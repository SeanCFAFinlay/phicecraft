// ============================================================================
// SELECT RENDERER — resolution + fallback tests
//
// Three things are under test:
//
//   1. resolveRendererPreference's precedence: URL `?renderer=` override beats
//      the persisted device setting beats the `canvas2d` default.
//   2. selectRenderer's WebGL fallback: import failure OR a missing `webgl2`
//      context both fall back to Canvas2D and tell the coach why via the
//      announcer. The import is tried FIRST — a canvas that has never had a
//      context taken from it is only ever asked for `webgl2` once the chunk
//      has actually loaded, so a failed import never touches the real canvas.
//   3. A WebGL attempt that fails PARTWAY (one canvas already got its context,
//      the other didn't - a realistic GPU context-limit/driver failure) must
//      not be reported as an ordinary, fully-working fallback: the contaminated
//      canvas can never draw `2d` again, and `selectRenderer` has to detect
//      that and say so, rather than silently returning a Canvas2DRenderer that
//      can only ever draw one of its two layers.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RendererHost } from '@/render/BoardRenderer';

const GPU_UNAVAILABLE_MESSAGE = 'GPU renderer unavailable; using standard renderer';
const RENDER_BROKEN_MESSAGE = 'Rendering failed on this device. Reload the page to recover.';

/** A `Storage`-shaped in-memory stand-in — the node test environment has no real localStorage. */
class FakeStorage {
  private readonly store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

/** Every call returns the same value regardless of which context `type` is asked for. */
function fakeCanvas(getContext: (type: string) => unknown = () => ({})): HTMLCanvasElement {
  return { getContext } as unknown as HTMLCanvasElement;
}

/**
 * Mimics a REAL canvas's context-locking: once some type is successfully
 * granted, a request for any OTHER type returns `null` forever, and the SAME
 * type keeps returning the same context object. This is what makes the
 * "contaminated canvas" scenario below realistic rather than contrived.
 */
function statefulCanvas(): HTMLCanvasElement {
  let locked: string | null = null;
  const granted = {};
  const getContext = vi.fn((type: string) => {
    if (locked === null) locked = type;
    return locked === type ? granted : null;
  });
  return { getContext } as unknown as HTMLCanvasElement;
}

function fakeHost(overrides: Partial<RendererHost> = {}): RendererHost {
  return {
    staticCanvas: fakeCanvas(),
    dynamicCanvas: fakeCanvas(),
    onPaint: vi.fn(),
    ...overrides,
  };
}

describe('resolveRendererPreference', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new FakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to canvas2d with no URL override and nothing persisted', async () => {
    const { resolveRendererPreference } = await import('./selectRenderer');
    expect(resolveRendererPreference('')).toBe('canvas2d');
  });

  it('a persisted setting is used when there is no URL override', async () => {
    const { resolveRendererPreference, writeRendererPreference } = await import('./selectRenderer');
    writeRendererPreference('webgl');
    expect(resolveRendererPreference('')).toBe('webgl');
  });

  it('the URL override wins over a persisted setting', async () => {
    const { resolveRendererPreference, writeRendererPreference } = await import('./selectRenderer');
    writeRendererPreference('canvas2d');
    expect(resolveRendererPreference('?renderer=webgl')).toBe('webgl');
  });

  it('ignores an unrecognized URL override', async () => {
    const { resolveRendererPreference } = await import('./selectRenderer');
    expect(resolveRendererPreference('?renderer=bogus')).toBe('canvas2d');
  });
});

describe('selectRenderer', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new FakeStorage());
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/render/webgl/WebGLRenderer');
    vi.unstubAllGlobals();
  });

  it('a canvas2d preference resolves directly, without touching the WebGL chunk', async () => {
    const { selectRenderer } = await import('./selectRenderer');
    const renderer = await selectRenderer('canvas2d', fakeHost());
    expect(renderer.kind).toBe('canvas2d');
  });

  it('falls back to Canvas2D and announces when webgl2 is unavailable', async () => {
    vi.doMock('@/render/webgl/WebGLRenderer', () => ({
      WebGLRenderer: class {
        constructor() {
          throw new Error('must not be constructed when webgl2 is unavailable');
        }
      },
    }));

    const { selectRenderer } = await import('./selectRenderer');
    const announce = vi.fn();
    // Only `webgl2` is unsupported - a REAL "this browser has no webgl2"
    // canvas still yields `2d` fine, and a failed/unsupported getContext call
    // never locks the canvas to anything (unlike a successful one).
    const renderer = await selectRenderer(
      'webgl',
      fakeHost({ dynamicCanvas: fakeCanvas(type => (type === 'webgl2' ? null : {})) }),
      announce
    );

    expect(renderer.kind).toBe('canvas2d');
    expect(announce).toHaveBeenCalledWith(GPU_UNAVAILABLE_MESSAGE);
  });

  it('reports a harder failure when a partial WebGL failure has already contaminated a canvas', async () => {
    // Simulates the realistic failure the review flagged: WebGLRenderer
    // builds its two canvases independently, so a GPU can hand out a context
    // for one (here, staticCanvas) while refusing the other - and `whenReady`
    // still rejects overall. staticCanvas is now stuck on `webgl2` forever;
    // Canvas2DRenderer can never draw it again.
    const staticCanvas = statefulCanvas();
    const dynamicCanvas = statefulCanvas();

    class FakeWebGLRenderer {
      readonly kind = 'webgl' as const;
      constructor(host: RendererHost) {
        // Stands in for the layer whose buildLayer() succeeded before the
        // other one failed.
        host.staticCanvas.getContext('webgl2');
      }
      whenReady() {
        return Promise.reject(new Error('dynamic canvas: context limit reached'));
      }
    }
    vi.doMock('@/render/webgl/WebGLRenderer', () => ({ WebGLRenderer: FakeWebGLRenderer }));

    const { selectRenderer } = await import('./selectRenderer');
    const announce = vi.fn();
    const renderer = await selectRenderer('webgl', fakeHost({ staticCanvas, dynamicCanvas }), announce);

    expect(renderer.kind).toBe('canvas2d');
    expect(announce).toHaveBeenCalledWith(RENDER_BROKEN_MESSAGE);
    expect(announce).not.toHaveBeenCalledWith(GPU_UNAVAILABLE_MESSAGE);
  });

  it('falls back to Canvas2D and announces when the WebGL chunk fails to import', async () => {
    vi.doMock('@/render/webgl/WebGLRenderer', () => {
      throw new Error('network error loading the chunk');
    });

    const { selectRenderer } = await import('./selectRenderer');
    const announce = vi.fn();
    const renderer = await selectRenderer('webgl', fakeHost(), announce);

    expect(renderer.kind).toBe('canvas2d');
    expect(announce).toHaveBeenCalledWith(GPU_UNAVAILABLE_MESSAGE);
  });

  it('selects the WebGL renderer when the chunk imports and webgl2 is available', async () => {
    class FakeWebGLRenderer {
      readonly kind = 'webgl' as const;
      whenReady() {
        return Promise.resolve();
      }
    }
    vi.doMock('@/render/webgl/WebGLRenderer', () => ({ WebGLRenderer: FakeWebGLRenderer }));

    const { selectRenderer } = await import('./selectRenderer');
    const announce = vi.fn();
    const renderer = await selectRenderer(
      'webgl',
      fakeHost({ dynamicCanvas: fakeCanvas(() => ({})) }),
      announce
    );

    expect(renderer.kind).toBe('webgl');
    expect(announce).not.toHaveBeenCalled();
  });
});
