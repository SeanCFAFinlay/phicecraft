// ============================================================================
// VIEW CONTROLS
//
// The tabletop (true-3D) camera cluster. It writes straight into the camera
// store, so leaning the rink back does not republish application state - and
// the animation respects reduced motion.
//
// Entering 3D loads Board3D's chunk (three.js + its GLB models, ~500 KB)
// BEFORE animating the tilt past TABLETOP_MIN_TILT, rather than after. Tilt
// alone is what AppShell swaps CanvasSurface out on (`is3D`), so animating it
// first would open a real window - the length of the chunk fetch - where
// AppShell has already unmounted CanvasSurface and Board3D's lazy import
// hasn't resolved yet, and Suspense falls back to a FRESH CanvasSurface whose
// own tilt is already past the threshold. Before Task 6 that fallback drew a
// graceful degraded pseudo-3D pass; Task 6 deleted that pass, so the same
// fallback would now render a flat rink on the tabletop's dark gradient - a
// visibly broken transitional frame, not the "never blank the board" contract
// AppShell's own Suspense comment promises. Awaiting the chunk first means
// `is3D` never flips true until Board3D is already resolved, so the Suspense
// fallback is never actually reached on a real tilt-in (only, harmlessly, on
// the already-loaded mount tick that follows).
// ============================================================================

import { useAppState } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';
import { useViewActions } from '@/components/shell/useViewActions';
import { FitIcon, RotateLeftIcon, RotateRightIcon } from '@/ui/icons';

export function ViewControls() {
  const { dispatch } = useAppState();
  const { isCompactLandscape, isPhone } = useResponsive();
  const {
    is3D,
    loadingBoard3D,
    toggle3D,
    spinLeft,
    spinRight,
    setPresetBroadcast,
    setPresetEndZone,
    setPresetTactical,
    setPresetPOV,
    fit,
  } = useViewActions();

  const button =
    'touch-target flex items-center justify-center rounded-xl border border-cyan-300/25 bg-[#04111c]/88 text-cyan-100 shadow-lg backdrop-blur-md transition hover:bg-[#0a2130] disabled:opacity-35';

  if (isPhone) {
    return (
      <div className={`absolute right-2 z-20 ${isCompactLandscape ? 'top-2' : 'top-2.5'}`}>
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'view' })}
          aria-haspopup="dialog"
          aria-label="Open view controls"
          className={`${button} px-2.5 text-[11px] font-black tracking-wider border-cyan-400/35 bg-[#061826]/90`}
        >
          VIEW
        </button>
      </div>
    );
  }

  return (
    <div
      className={`absolute right-2.5 z-20 flex flex-col gap-1.5 ${isCompactLandscape ? 'top-2' : 'top-3'}`}
    >
      <button
        type="button"
        onClick={toggle3D}
        disabled={loadingBoard3D}
        aria-pressed={is3D}
        aria-busy={loadingBoard3D}
        aria-label={
          loadingBoard3D
            ? 'Loading the 3D view'
            : is3D
              ? 'Switch to the flat top-down view'
              : 'Switch to the tabletop 3D view'
        }
        className={`${button} px-2 text-[12px] font-black`}
      >
        {is3D ? '2D' : '3D'}
      </button>

      {is3D && (
        <>
          <button
            type="button"
            onClick={spinLeft}
            aria-label="Spin the rink left"
            className={`${button} text-[14px]`}
          >
            <RotateLeftIcon size={16} />
          </button>

          <button
            type="button"
            onClick={spinRight}
            aria-label="Spin the rink right"
            className={`${button} text-[14px]`}
          >
            <RotateRightIcon size={16} />
          </button>

          <button
            type="button"
            onClick={setPresetBroadcast}
            aria-label="Broadcast 3D camera angle"
            title="Broadcast side angle"
            className={`${button} px-1 text-[9px] font-black tracking-tight`}
          >
            Side
          </button>

          <button
            type="button"
            onClick={setPresetEndZone}
            aria-label="Behind the net 3D camera angle"
            title="Behind the net view"
            className={`${button} px-1 text-[9px] font-black tracking-tight`}
          >
            Net
          </button>

          <button
            type="button"
            onClick={setPresetTactical}
            aria-label="Tactical overhead 3D camera angle"
            title="Tactical overhead view"
            className={`${button} px-1 text-[9px] font-black tracking-tight`}
          >
            Top
          </button>

          <button
            type="button"
            onClick={setPresetPOV}
            aria-label="Player POV 3D camera angle"
            title="Player first-person / chase view"
            className={`${button} px-1 text-[9px] font-black tracking-tight text-amber-300 border-amber-400/30`}
          >
            POV
          </button>
        </>
      )}

      {is3D && (
        <button
          type="button"
          onClick={fit}
          aria-label="Fit the whole rink in view"
          className={`${button} text-[13px]`}
        >
          <FitIcon size={16} />
        </button>
      )}
    </div>
  );
}
