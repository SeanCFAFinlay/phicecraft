// ============================================================================
// BOARD3D COUNTERS
//
// App-owned readiness signal exposed on `window`, mirroring
// `src/render/paintCounters.ts`'s pattern for the 2D renderer's paint
// counters. Board3D has no equivalent of Canvas2D/WebGL's `staticLayerKey`
// cache-hit skip - it repaints on every camera change and every playback
// frame - so a caller (e2e, or `visual.spec.ts`'s screenshot readiness wait)
// needs two independent signals, not one:
//
//   - `framesRendered`: at least one real WebGL frame has been drawn.
//   - `actorsBuilt`: the async GLB load has resolved and the actor set for
//     the current drill has actually been added to the scene.
//
// Neither alone is enough: `framesRendered` can tick from the arena/camera
// alone before the GLB models finish loading (a real bug the frame ordering
// note in Board3D.tsx's own `buildActors`/`renderFrame` describes), and
// `actorsBuilt` alone says nothing about whether a frame has actually been
// painted with them in it yet.
// ============================================================================

export interface Board3DCounters {
  framesRendered: number;
  /** True once the current mount's actor set (skaters/goalies/coaches/puck) has been built. */
  actorsBuilt: boolean;
  reset(): void;
}

declare global {
  interface Window {
    __phicecraftBoard3d?: Board3DCounters;
  }
}

function createBoard3DCounters(): Board3DCounters {
  const counters: Board3DCounters = {
    framesRendered: 0,
    actorsBuilt: false,
    reset() {
      counters.framesRendered = 0;
      counters.actorsBuilt = false;
    },
  };
  return counters;
}

/**
 * Returns the window-global singleton, creating it on first call. Safe to
 * call repeatedly - from every Board3D mount, including React StrictMode's
 * double-invoke and hot-module-reload remounts - a later call must not
 * replace the object or reset counts an earlier one already recorded.
 */
export function installBoard3DCounters(): Board3DCounters {
  if (!window.__phicecraftBoard3d) {
    window.__phicecraftBoard3d = createBoard3DCounters();
  }
  return window.__phicecraftBoard3d;
}

/** Called from Board3D's own `render()`, once per real WebGL frame. */
export function recordBoard3DFrame(): void {
  installBoard3DCounters().framesRendered += 1;
}

/** Called once the current mount's actor set has been added to the scene. */
export function markBoard3DActorsBuilt(): void {
  installBoard3DCounters().actorsBuilt = true;
}
