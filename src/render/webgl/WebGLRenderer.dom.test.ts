// ============================================================================
// WebGLRenderer — partial-init failure test
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
// pixi.js itself is mocked: jsdom has no real webgl2 backend, and the point
// here is WebGLRenderer's own init()/dispose() orchestration, not Pixi's.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RendererHost } from '@/render/BoardRenderer';
import { TABLETOP_MIN_TILT } from '@/core/constants';

const destroySpy = vi.fn();

// This file is about WebGLRenderer's OWN init()/dispose() orchestration and
// its tabletop-routing decision, not about the rink scene graph's own content
// (that has its own dedicated test, rinkScene.dom.test.ts) - stubbed out so
// building it never needs the real pixi.js Container/Graphics/Text/
// FillGradient the mock below doesn't provide.
const rinkSceneSpy = { setFromMatrix: vi.fn(), destroy: vi.fn() };
vi.mock('./rinkScene', () => ({
  buildRinkScene: () => rinkSceneSpy,
}));

// Likewise, the dynamic (game) scene graph's own content is gameScene.ts's
// own concern, covered by gameScene.dom.test.ts - stubbed out here for the
// same reason rinkScene is: this file is about WebGLRenderer's ROUTING
// decision (which pipeline drawDynamic reaches for), not the scene's pixels.
const gameSceneRootSpy = { setFromMatrix: vi.fn() };
const updateGameSceneSpy = vi.fn();
const destroyGameSceneSpy = vi.fn();
vi.mock('./gameScene', () => ({
  buildGameScene: () => ({ root: gameSceneRootSpy }),
  updateGameScene: (...args: unknown[]) => updateGameSceneSpy(...args),
  destroyGameScene: (...args: unknown[]) => destroyGameSceneSpy(...args),
}));

// Likewise, the Canvas2D tabletop fallback's own drawing is
// renderStatic.ts/RinkRenderer.ts's concern (already covered by their own
// tests); this file only needs to know WHICH pipeline drawStatic() reaches
// for, given a camera's tilt.
const drawStaticLayerSpy = vi.fn();
vi.mock('@/components/canvas/renderStatic', () => ({
  drawStaticLayer: drawStaticLayerSpy,
  staticLayerKey: (input: { camera: unknown }) => JSON.stringify(input.camera),
}));

// drawDynamicLayer is the SAME tabletop pass-through primitive drawStaticLayer
// is above - mocked for the same reason: this file asserts WebGLRenderer's
// ROUTING decision (Task 6's shared `canvasFallback` predicate), not the
// Canvas2D dynamic layer's own pixels (renderDynamic.ts has its own coverage).
const drawDynamicLayerSpy = vi.fn();
vi.mock('@/components/canvas/renderDynamic', () => ({
  drawDynamicLayer: drawDynamicLayerSpy,
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
  class FakeSprite {
    texture: unknown;
    constructor(texture: unknown) {
      this.texture = texture;
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
    Sprite: FakeSprite,
    Texture: { from: () => ({ source: { update: vi.fn(), resize: vi.fn() } }) },
    Matrix: FakeMatrix,
  };
});

const { WebGLRenderer } = await import('./WebGLRenderer');

beforeEach(() => {
  destroySpy.mockClear();
  rinkSceneSpy.setFromMatrix.mockClear();
  rinkSceneSpy.destroy.mockClear();
  drawStaticLayerSpy.mockClear();
  drawDynamicLayerSpy.mockClear();
  gameSceneRootSpy.setFromMatrix.mockClear();
  updateGameSceneSpy.mockClear();
  destroyGameSceneSpy.mockClear();
  // jsdom has no real 2D canvas backend; stub just enough for the
  // pass-through buffer WebGLRenderer draws onto internally.
  HTMLCanvasElement.prototype.getContext = vi.fn(function (type: string) {
    return type === '2d' ? ({} as unknown as CanvasRenderingContext2D) : null;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
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

// The brief's binding requirement: tabletop must still work with the GPU
// toggle on. WebGLRenderer never modelled the tabletop arena as Pixi display
// objects (rinkScene.ts is flat-rink only) - drawStatic instead reaches for
// the Canvas2D pass-through buffer/sprite pipeline once tilt crosses the same
// TABLETOP_MIN_TILT threshold Canvas2DRenderer uses. This asserts the ROUTING
// decision only - the pixel content of each path already has its own tests
// (rinkScene.dom.test.ts for the flat scene, renderStatic/RinkRenderer's own
// tests for the Canvas2D arena).
describe('WebGLRenderer.drawStatic — tabletop fallback', () => {
  function flatCamera() {
    return { x: 0, y: 0, zoom: 1, rotation: 0, tilt: 0 };
  }

  function tabletopCamera() {
    return { x: 0, y: 0, zoom: 1, rotation: 0, tilt: TABLETOP_MIN_TILT + 0.1 };
  }

  it('renders the flat rink Pixi scene when tilt is at or below the tabletop threshold', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawStatic({ camera: flatCamera(), width: 800, height: 400, dpr: 1 });

    expect(rinkSceneSpy.setFromMatrix).toHaveBeenCalledTimes(1);
    expect(drawStaticLayerSpy).not.toHaveBeenCalled();
  });

  it('falls back to the Canvas2D arena, still on the same (permanently webgl2) canvas, once tilt passes the threshold', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawStatic({ camera: tabletopCamera(), width: 800, height: 400, dpr: 1 });

    expect(drawStaticLayerSpy).toHaveBeenCalledTimes(1);
    expect(rinkSceneSpy.setFromMatrix).not.toHaveBeenCalled();
  });

  it('switches pipelines cleanly as the same renderer crosses the threshold mid-session', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawStatic({ camera: flatCamera(), width: 800, height: 400, dpr: 1 });
    renderer.drawStatic({ camera: tabletopCamera(), width: 800, height: 400, dpr: 1 });
    renderer.drawStatic({ camera: flatCamera(), width: 800, height: 400, dpr: 1 });

    expect(rinkSceneSpy.setFromMatrix).toHaveBeenCalledTimes(2);
    expect(drawStaticLayerSpy).toHaveBeenCalledTimes(1);
  });
});

// Task 6: drawDynamic goes live. Asserts the SAME routing guarantee as
// drawStatic above, through the SAME shared `canvasFallback` predicate - a
// mixed WebGL/Canvas2D frame (one layer picking one pipeline, the other layer
// picking the other for the same camera) must be impossible.
describe('WebGLRenderer.drawDynamic — pipeline routing', () => {
  function flatCamera() {
    return { x: 0, y: 0, zoom: 1, rotation: 0, tilt: 0 };
  }

  function tabletopCamera() {
    return { x: 0, y: 0, zoom: 1, rotation: 0, tilt: TABLETOP_MIN_TILT + 0.1 };
  }

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

  it('updates and renders the real Pixi game scene when tilt is at or below the tabletop threshold', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawDynamic(dynamicInput(flatCamera()));

    expect(updateGameSceneSpy).toHaveBeenCalledTimes(1);
    expect(gameSceneRootSpy.setFromMatrix).toHaveBeenCalledTimes(1);
    expect(drawDynamicLayerSpy).not.toHaveBeenCalled();
  });

  it('falls back to the Canvas2D pass-through, without touching the game scene, once tilt passes the threshold', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.drawDynamic(dynamicInput(tabletopCamera()));

    expect(drawDynamicLayerSpy).toHaveBeenCalledTimes(1);
    expect(updateGameSceneSpy).not.toHaveBeenCalled();
    expect(gameSceneRootSpy.setFromMatrix).not.toHaveBeenCalled();
  });

  it('never disagrees with drawStatic for the SAME camera', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    for (const camera of [flatCamera(), tabletopCamera()]) {
      drawStaticLayerSpy.mockClear();
      drawDynamicLayerSpy.mockClear();
      renderer.drawStatic({ camera, width: 800, height: 400, dpr: 1 });
      renderer.drawDynamic(dynamicInput(camera));
      expect(drawStaticLayerSpy.mock.calls.length > 0).toBe(drawDynamicLayerSpy.mock.calls.length > 0);
    }
  });

  it('disposes the game scene along with both Pixi renderers', async () => {
    const renderer = new WebGLRenderer(host());
    await renderer.whenReady();

    renderer.dispose();

    expect(destroyGameSceneSpy).toHaveBeenCalledTimes(1);
  });
});
