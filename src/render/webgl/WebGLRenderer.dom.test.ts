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

const destroySpy = vi.fn();

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
  return {
    WebGLRenderer: FakePixiWebGLRenderer,
    Sprite: FakeSprite,
    Texture: { from: () => ({ source: { update: vi.fn(), resize: vi.fn() } }) },
  };
});

const { WebGLRenderer } = await import('./WebGLRenderer');

beforeEach(() => {
  destroySpy.mockClear();
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
