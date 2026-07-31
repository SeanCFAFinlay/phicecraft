// ============================================================================
// SELECT RENDERER
//
// Resolves which BoardRenderer implementation a session gets and produces it.
//
// Resolution order: an explicit `?renderer=` URL override always wins (for
// support and debugging), then the persisted device setting, then the
// `canvas2d` default. The setting lives in localStorage, NOT the drill
// document - it describes what this device can render, not the drill - using
// the same guarded-try/catch idiom as FirstRunHint's `firstRunHintDone` flag.
//
// selectRenderer's WebGL branch dynamic-imports its chunk lazily: a coach who
// never opts in never PARSES OR EXECUTES PixiJS, so it costs them nothing at
// startup. This is not the same as never downloading it - the service worker
// (`public/sw.js`) precaches every build-manifest chunk, including this one,
// in the background for offline availability, regardless of whether the
// coach has ever selected WebGL. The import is tried BEFORE the `webgl2`
// capability check, and deliberately so: a canvas that has ever had a context
// taken from it can never change context type again (a canvas that got `2d`
// can't become `webgl2`, and the reverse is equally true), so probing
// `webgl2` is only safe once we are actually committed to using it - i.e.
// once the chunk has already loaded. An import failure alone therefore never
// touches, and never locks, the real canvas. The probe itself runs on a
// throwaway canvas, never the real one (see the capability check below).
// ============================================================================

import type { BoardRenderer, RendererHost } from '@/render/BoardRenderer';
import { Canvas2DRenderer } from '@/render/canvas2d/Canvas2DRenderer';
import type { RendererPreference } from '@/core/types';
import { RENDERER_PREFERENCE_STORAGE_KEY, DEFAULT_RENDERER_PREFERENCE } from '@/core/constants';

/** What the announcer says when the GPU renderer could not be used, but the fallback can draw fine. */
export const GPU_UNAVAILABLE_MESSAGE = 'GPU renderer unavailable; using standard renderer';

/**
 * What the announcer says when the WebGL attempt has already left a canvas
 * unable to yield a `2d` context - the fallback can never fully recover this
 * session (see `canRenderCanvas2D` below).
 */
export const RENDER_BROKEN_MESSAGE =
  'Rendering failed on this device. Reload the page to recover.';

/**
 * Whether Canvas2DRenderer can actually draw on both canvases.
 *
 * A failed WebGL attempt can leave one canvas mid-init'd: `WebGLRenderer`
 * builds its two canvases independently (`Promise.allSettled`, since a GPU
 * can hand out a context for one and then refuse the other - a context
 * limit, driver reset, or shader/extension failure), so it is entirely
 * possible for one canvas to have already been irreversibly handed a
 * `webgl2` context while the other never got one. A canvas's context type is
 * fixed for its lifetime once granted, so `getContext('2d')` on the
 * `webgl2` one now, and forever after, returns `null` - Canvas2DRenderer
 * would silently stop drawing that one layer for the rest of the session.
 * This check is what tells the difference between "GPU unavailable, standard
 * renderer works fine" and "this session's canvases are partially wrecked."
 */
function canRenderCanvas2D(host: RendererHost): boolean {
  return host.staticCanvas.getContext('2d') !== null && host.dynamicCanvas.getContext('2d') !== null;
}

function isRendererPreference(value: string | null): value is RendererPreference {
  return value === 'canvas2d' || value === 'webgl';
}

/** The persisted device choice, or `null` if nothing valid is stored. */
export function readRendererPreference(): RendererPreference | null {
  try {
    const stored = localStorage.getItem(RENDERER_PREFERENCE_STORAGE_KEY);
    return isRendererPreference(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persists the device's renderer choice. Applies from the next full load. */
export function writeRendererPreference(pref: RendererPreference): void {
  try {
    localStorage.setItem(RENDERER_PREFERENCE_STORAGE_KEY, pref);
  } catch {
    /* a coach with storage disabled just gets the default next visit */
  }
}

/**
 * Resolution order: URL `?renderer=` override -> persisted setting -> default.
 * @param search `location.search`, e.g. `"?renderer=webgl"`.
 */
export function resolveRendererPreference(search: string): RendererPreference {
  const fromUrl = new URLSearchParams(search).get('renderer');
  if (isRendererPreference(fromUrl)) return fromUrl;
  return readRendererPreference() ?? DEFAULT_RENDERER_PREFERENCE;
}

/**
 * Creates the disposable element the `webgl2` capability probe runs on. A
 * real function (not an inline `document.createElement`) purely so
 * `selectRenderer`'s tests - which run under the `node` Vitest environment,
 * with no `document` global at all - can supply a fake one instead of
 * needing a full jsdom just to answer "can this device do webgl2?".
 */
function createProbeCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

interface WebGLClaim {
  refCount: number;
  promise: Promise<BoardRenderer>;
}

/**
 * Keyed on `host.dynamicCanvas` - the shared identity between two
 * `selectRenderer` calls that are really the SAME mount.
 *
 * `React.StrictMode`'s dev-only double-invoke runs a component's effects as
 * setup -> cleanup -> setup, all synchronously, before either call's async
 * work has settled - so `useCanvasLayers`'s selection effect calls
 * `selectRenderer` twice for the exact same pair of canvas elements (only the
 * `RendererHost` wrapper object is fresh each time; the DOM nodes and the
 * refs pointing at them are not). Left uncached, that is two independent
 * `new WebGLRenderer(host)` instances racing to initialize Pixi against the
 * SAME canvases. Whichever effect run gets cancelled disposes its renderer as
 * soon as its promise settles - and `WebGLRenderer.dispose()` calls Pixi's
 * `GlContextSystem.destroy()`, which calls `loseContext()` on the GL context
 * object. Browsers hand back the SAME context object for repeated
 * `getContext('webgl2')` calls on one canvas, so that `loseContext()` kills
 * the context the SURVIVING instance is using too - the coach sees a blank
 * board (reproduced live: `CONTEXT_LOST_WEBGL` / "Could not retrieve shader
 * source" in the console, `staticPaints`/`dynamicPaints` frozen at 1). This
 * cache makes the second call reuse the first call's in-flight
 * promise/instance instead of racing it.
 */
const webglClaims = new WeakMap<HTMLCanvasElement, WebGLClaim>();

/**
 * Wraps the real WebGLRenderer so `dispose()` only tears down the GPU
 * context once every caller sharing `claim` has released it.
 *
 * Every caller sharing the same claim is handed the SAME wrapper (it is the
 * resolved value of the SAME cached promise), so the cancelled StrictMode
 * caller's `dispose()` and the surviving caller's eventual real unmount
 * `dispose()` are just two decrements of one shared counter: the first is a
 * no-op (refCount 2 -> 1), the second does the real work (1 -> 0). Neither
 * `useCanvasLayers.ts` nor its two `renderer.dispose()` call sites need to
 * know any of this - the reuse is entirely selectRenderer's problem.
 */
function wrapClaimedRenderer(real: BoardRenderer, claim: WebGLClaim, key: HTMLCanvasElement): BoardRenderer {
  return {
    kind: real.kind,
    drawStatic: input => real.drawStatic(input),
    drawDynamic: input => real.drawDynamic(input),
    resize: (width, height, dpr) => real.resize(width, height, dpr),
    dispose: () => {
      claim.refCount -= 1;
      if (claim.refCount <= 0) {
        if (webglClaims.get(key) === claim) webglClaims.delete(key);
        real.dispose();
      }
    },
  };
}

/**
 * Resolves the (possibly shared) WebGL renderer for `host`'s canvas pair.
 * See `webglClaims` above for why this exists rather than just constructing
 * one directly.
 */
function claimWebGLRenderer(host: RendererHost, probeCanvas: () => HTMLCanvasElement): Promise<BoardRenderer> {
  const key = host.dynamicCanvas;
  const existing = webglClaims.get(key);
  if (existing) {
    existing.refCount += 1;
    return existing.promise;
  }

  const claim: WebGLClaim = { refCount: 1, promise: undefined as unknown as Promise<BoardRenderer> };
  webglClaims.set(key, claim);

  claim.promise = (async () => {
    try {
      const { WebGLRenderer } = await import('@/render/webgl/WebGLRenderer');
      // Probed on a throwaway canvas, never `host.dynamicCanvas`: a bare
      // `getContext('webgl2')` call creates the context right there with
      // default attributes (`stencil: false`, `antialias: true`, ...). Pixi's
      // own `renderer.init()` then finds a context ALREADY on the canvas and
      // reuses it as-is - the attributes Pixi asks for (see `buildLayer` in
      // `WebGLRenderer.ts`) are silently ignored, which is exactly what Pixi's
      // own `GlContextSystem` warns about. A disposable element never touched
      // by Pixi answers the same capability question with no side effect on
      // the canvas WebGLRenderer is about to initialize for real.
      if (probeCanvas().getContext('webgl2') === null) {
        throw new Error('webgl2 is not available on this device');
      }
      const real = new WebGLRenderer(host);
      await real.whenReady();
      return wrapClaimedRenderer(real, claim, key);
    } catch (err) {
      // A failed claim must not poison future selections on this canvas -
      // only a genuinely successful renderer stays cached.
      if (webglClaims.get(key) === claim) webglClaims.delete(key);
      throw err;
    }
  })();

  return claim.promise;
}

/**
 * Produces the BoardRenderer for this session.
 *
 * `announce` is the Announcer's `announce` (see `src/ui/announcer.ts`) - the
 * polite live region, not a toast, since a background renderer fallback is
 * not something a coach needs to dismiss.
 */
export async function selectRenderer(
  pref: RendererPreference,
  host: RendererHost,
  announce: (message: string) => void = () => {},
  probeCanvas: () => HTMLCanvasElement = createProbeCanvas
): Promise<BoardRenderer> {
  if (pref !== 'webgl') return new Canvas2DRenderer(host);

  try {
    return await claimWebGLRenderer(host, probeCanvas);
  } catch (err) {
    // canRenderCanvas2D's own getContext('2d') probe is safe to run even
    // here: any canvas it still finds virgin is exactly what Canvas2DRenderer
    // would acquire lazily on its first draw anyway.
    console.warn('phicecraft: WebGL renderer unavailable', err);
    announce(canRenderCanvas2D(host) ? GPU_UNAVAILABLE_MESSAGE : RENDER_BROKEN_MESSAGE);
    return new Canvas2DRenderer(host);
  }
}
