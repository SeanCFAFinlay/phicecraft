// ============================================================================
// WebGLRenderer — init()/dispose() orchestration and routing
//
// Covers the fix for a review finding: WebGLRenderer builds its two canvases
// independently (Promise.allSettled, not Promise.all), because a real GPU can
// hand out a context for one canvas and then refuse the other (context
// limit, driver reset, shader/extension failure). If that happens, the
// SUCCEEDED layer's Pixi renderer must be disposed - its GPU resources
// released - rather than left dangling once this WebGLRenderer instance is
// discarded in favor of a Canvas2D fallback (selectRenderer.ts's job, covered
// by its own test file's "contaminated canvas" case).
//
// Phase 4 Task 6 deleted the tabletop pseudo-3D pass this renderer used to
// fall back to (a Canvas2D-drawn arena blitted onto the canvas as a texture
// once `camera.tilt` crossed TABLETOP_MIN_TILT) - true 3D
// (`src/render3d/Board3D.tsx`) is now the unconditional tabletop
// presentation, mounted instead of this renderer entirely. The tests below
// that used to prove the fallback routing now prove its absence: tilt no
// longer changes which pipeline drawStatic()/drawDynamic() reach for.
//
// pixi.js itself is mocked: jsdom has no real webgl2 backend, and the point
// here is WebGLRenderer's own init()/dispose()/routing, not Pixi's.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RendererHost } from '@/render/BoardRenderer';
import { TABLETOP_MIN_TILT } from '@/core/constants';

const destroySpy = vi.fn();

// This file is about WebGLRenderer's OWN init()/dispose() orchestration and
// per-frame call order, not the rink scene graph's own content (that has its
// own dedicated test, rinkScene.dom.test.ts) - stubbed out so building it
// never needs the real pixi.js Container/Graphics/Text/FillGradient the mock
// below doesn't provide.
const rinkSceneSpy = { setFromMatrix: vi.fn(), destroy: vi.fn() };
vi.mock('./rinkScene', () => ({
  buildRinkScene: () => rinkSceneSpy,
}));

// Likewise, the dynamic (game) scene graph's own content is gameScene.ts's
// own concern, covered by gameScene.dom.test.ts - stubbed out here for the
// same reason rinkScene is: this file is about WebGLRenderer's per-frame call
// order, not the scene's pixels.
const gameSceneRootSpy = { setFromMatrix: vi.fn() };
const updateGameSceneSpy = vi.fn();
const destroyGameSceneSpy = vi.fn();
vi.mock('./gameScene', () => ({
  buildGameScene: () => ({ root: gameSceneRootSpy }),
  updateGameScene: (...args: unknown[]) => updateGameSceneSpy(...args),
  destroyGameScene: (...args: unknown[]) => destroyGameSceneSpy(...args),
}));

vi.mock('pixi.js', () => {
  class FakePixiWebGLRenderer {
    destroy = destroySpy;
    resize = vi.fn();
    render = vi.fn();
    async init(options: { canvas: HTMLCanvasElement & { shouldFailInit?: boolean } }) {
      if (options.canvas.shouldFailInit) {
        throw new Error('context limit reached');
      }
    }
  }
  class FakeMatrix {
    constructor(
      public a: number,
      public b: number,
      public c: number,
      public d: number,
      public e: number,
      public f: number
    ) {}
  }
  return {
    WebGLRenderer: FakePixiWebGLRenderer,
    Matrix: FakeMatrix,
  };
});

const { WebGLRenderer } = await import('./WebGLRenderer');

beforeEach(() => {
  destroySpy.mockClear();
  rinkSceneSpy.setFromMatrix.mockClear();
  rinkSceneSpy.destroy.mockClear();
  gameSceneRootSpy.setFromMatrix.mockClear();
  updateGameSceneSpy.mockClear();
  destroyGameSceneSpy.mockClear();
});

function host(overrides: Partial<RendererHost> = {}): RendererHost {
  return {
    staticCanvas: document.createElement('canvas'),
    dynamicCanvas: document.createElement('canvas'),
    onPaint: vi.fn(),
    ...overrides,
  };
}

describe('WebGLRenderer', () => {
  it('resolves whenReady() once both canvases initialize successfully', async () => {
    const renderer = new WebGLRenderer(host());
    await expect(renderer.whenReady()).resolves.toBeUndefined();
  });

  it('rejects whenReady() and disposes the layer that DID succeed when the other fails', async () => {
    const staticCanvas = document.createElement('canvas');
    const dynamicCanvas = document.createElement('canvas') as HTMLCanvasElement & {
      shouldFailInit: boolean;
    };
    dynamicCanvas.shouldFailInit = true;

    const renderer = new WebGLRenderer(host({ staticCanvas, dynamicCanvas }));

    await expect(renderer.whenReady()).rejects.toThrow('context limit reached');
    // staticCanvas's Pixi renderer succeeded before dynamicCanvas's failure
    // surfaced; it must still be released rather than left dangling.
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('rejects whenReady() when the static canvas is the one that fails', async () => {
    const staticCanvas = document.createElement('canvas') as HTMLCanvasElement & {
      shouldFailInit: boolean;
    };
    staticCanvas.shouldFailInit = true;
    const dynamicCanvas = document.createElement('canvas');

    const renderer = new WebGLRenderer(host({ staticCanvas, dynamicCanvas }));

    await expect(renderer.whenReady()).rejects.toThrow('context limit reached');
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});

function flatCamera() {
  return { x: 0, y: 0, zoom: 1, rotation: 0, tilt: 0 };
}

function tabletopCamera() {
  return { x: 0, y: 0, zoom: 1, rotation: 0, tilt: TABLETOP_MIN_TILT + 0.1 };
}

describe('WebGLRenderer.drawStatic', () => {
  it('renders the Pixi rink scene under a camera transform', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawStatic({ camera: flatCamera(), width: 800, height: 400, dpr: 1 });

    expect(rinkSceneSpy.setFromMatrix).toHaveBeenCalledTimes(1);
  });

  it('skips a repaint when the static key has not changed', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawStatic({ camera: flatCamera(), width: 800, height: 400, dpr: 1 });
    renderer.drawStatic({ camera: flatCamera(), width: 800, height: 400, dpr: 1 });

    expect(rinkSceneSpy.setFromMatrix).toHaveBeenCalledTimes(1);
  });

  it('tilt no longer routes anywhere else - the Pixi rink scene renders even at tabletop tilt', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawStatic({ camera: flatCamera(), width: 800, height: 400, dpr: 1 });
    renderer.drawStatic({ camera: tabletopCamera(), width: 800, height: 400, dpr: 1 });

    // Two DIFFERENT camera values (different tilt), so both are real repaints,
    // both through the same single Pixi pipeline.
    expect(rinkSceneSpy.setFromMatrix).toHaveBeenCalledTimes(2);
  });
});

describe('WebGLRenderer.drawDynamic', () => {
  function dynamicInput(camera: ReturnType<typeof flatCamera>) {
    return {
      camera,
      width: 800,
      height: 400,
      dpr: 1,
      drill: { id: 'd', name: 'd', createdAt: 0, updatedAt: 0, players: [], skatePaths: [], events: [] },
      positions: {},
      playerFrames: {},
      puck: null,
      ghostTrails: { forEach: () => {} },
      isPlaying: false,
      suppressEditAffordances: false,
      progress: 0,
      selectedPlayerId: null,
      selectedEventId: null,
      passFromPlayerId: null,
      movingPlayerId: null,
      transientRoute: null,
      draggedPlayer: null,
      dragPreview: null,
      passCandidates: null,
      showDiagnostics: false,
      reducedEffects: false,
      quality: 'high' as const,
    };
  }

  it('updates and renders the real Pixi game scene', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawDynamic(dynamicInput(flatCamera()));

    expect(updateGameSceneSpy).toHaveBeenCalledTimes(1);
    expect(gameSceneRootSpy.setFromMatrix).toHaveBeenCalledTimes(1);
  });

  it('tilt no longer routes anywhere else - the Pixi game scene updates and renders even at tabletop tilt', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawDynamic(dynamicInput(tabletopCamera()));

    expect(updateGameSceneSpy).toHaveBeenCalledTimes(1);
    expect(gameSceneRootSpy.setFromMatrix).toHaveBeenCalledTimes(1);
  });

  it('disposes the game scene along with both Pixi renderers', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.dispose();

    expect(destroyGameSceneSpy).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledTimes(2);
    expect(rinkSceneSpy.destroy).toHaveBeenCalledTimes(1);
  });
});
