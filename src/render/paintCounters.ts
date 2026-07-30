// ============================================================================
// PAINT COUNTERS
//
// App-owned, renderer-agnostic paint counters exposed on `window` for e2e
// instrumentation. They replace `e2e/perf.spec.ts`'s previous approach of
// monkey-patching `CanvasRenderingContext2D.clearRect` on the canvas found at
// a hard-coded DOM index: that broke silently (read 0, no thrown error) the
// moment a canvas switched to a `webgl2` context, since `getContext('2d')`
// then returns null, and it assumed canvas order never changes.
//
// Installed unconditionally — not gated to test or dev builds — because this
// module is ~20 lines, the runtime cost is one integer increment per real
// paint, and staying renderer-agnostic (every BoardRenderer reports through
// the same RendererHost.onPaint seam, see BoardRenderer.ts) is what lets the
// perf spec stop assuming canvas index 0 is always a 2D context.
// ============================================================================

export interface PaintCounters {
  staticPaints: number;
  dynamicPaints: number;
  reset(): void;
}

declare global {
  interface Window {
    __phicecraftPaint?: PaintCounters;
  }
}

function createPaintCounters(): PaintCounters {
  const counters: PaintCounters = {
    staticPaints: 0,
    dynamicPaints: 0,
    reset() {
      counters.staticPaints = 0;
      counters.dynamicPaints = 0;
    },
  };
  return counters;
}

/**
 * Returns the window-global singleton, creating it on first call. Safe to
 * call repeatedly — from every renderer construction, including React
 * StrictMode's double-invoke and hot-module-reload remounts — a later call
 * must not replace the object or reset counts an earlier one already
 * recorded.
 */
export function installPaintCounters(): PaintCounters {
  if (!window.__phicecraftPaint) {
    window.__phicecraftPaint = createPaintCounters();
  }
  return window.__phicecraftPaint;
}

/**
 * The RendererHost.onPaint implementation wired into every BoardRenderer at
 * construction (see useCanvasLayers.ts).
 */
export function recordPaint(layer: 'static' | 'dynamic'): void {
  const counters = installPaintCounters();
  if (layer === 'static') {
    counters.staticPaints += 1;
  } else {
    counters.dynamicPaints += 1;
  }
}
