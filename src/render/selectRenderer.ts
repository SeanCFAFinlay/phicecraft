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
// selectRenderer's WebGL branch dynamic-imports its chunk so a coach who
// never opts in never downloads PixiJS. The import is tried BEFORE the
// `webgl2` capability check, and deliberately so: a canvas that has ever had
// a context taken from it can never change context type again (a canvas that
// got `2d` can't become `webgl2`, and the reverse is equally true), so probing
// `webgl2` on the real canvas is only safe once we are actually committed to
// using it - i.e. once the chunk has already loaded. An import failure alone
// therefore never touches, and never locks, the real canvas.
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
 * Produces the BoardRenderer for this session.
 *
 * `announce` is the Announcer's `announce` (see `src/ui/announcer.ts`) - the
 * polite live region, not a toast, since a background renderer fallback is
 * not something a coach needs to dismiss.
 */
export async function selectRenderer(
  pref: RendererPreference,
  host: RendererHost,
  announce: (message: string) => void = () => {}
): Promise<BoardRenderer> {
  if (pref !== 'webgl') return new Canvas2DRenderer(host);

  try {
    const { WebGLRenderer } = await import('@/render/webgl/WebGLRenderer');
    if (host.dynamicCanvas.getContext('webgl2') === null) {
      throw new Error('webgl2 is not available on this device');
    }
    const renderer = new WebGLRenderer(host);
    await renderer.whenReady();
    return renderer;
  } catch {
    // canRenderCanvas2D's own getContext('2d') probe is safe to run even
    // here: any canvas it still finds virgin is exactly what Canvas2DRenderer
    // would acquire lazily on its first draw anyway.
    announce(canRenderCanvas2D(host) ? GPU_UNAVAILABLE_MESSAGE : RENDER_BROKEN_MESSAGE);
    return new Canvas2DRenderer(host);
  }
}
