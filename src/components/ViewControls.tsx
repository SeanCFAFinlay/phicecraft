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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppServices } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { useCameraSnapshot } from '@/playback/usePlaybackSnapshot';
import { useResponsive } from '@/ui/useResponsive';
import { TABLETOP_DEFAULT_TILT, TABLETOP_MIN_TILT } from '@/core/constants';
import type { Zone } from '@/camera/cameraMath';
import { loadBoard3D } from '@/render3d/loadBoard3D';
import { FitIcon, OrientationIcon, RotateLeftIcon, RotateRightIcon } from '@/ui/icons';

/** A pleasing starting spin, matching the reference render. */
const DEFAULT_ANGLE = -0.4;
const ANIMATION_MS = 380;

/**
 * The views the area button steps through.
 *
 * Full ice is where most drills are drawn, but a station, a battle or a
 * small-area game happens in one end - and on a phone, a full sheet shown
 * end-to-end makes those players too small to place accurately. Cycling rather
 * than opening a menu keeps it one tap while the coach is on the ice.
 */
const AREAS: { zone: Zone; label: string; description: string }[] = [
  { zone: 'full', label: 'FULL', description: 'the whole sheet' },
  { zone: 'defensive', label: 'D ZONE', description: 'the left end, to the blue line' },
  { zone: 'offensive', label: 'O ZONE', description: 'the right end, to the blue line' },
];

/**
 * Once the coach has panned or pinch-zoomed by hand, the camera is no longer
 * any of the named views. The cycle button still needs something to show and
 * to step on from - it shows a neutral label, and treats the next tap as
 * starting the cycle over from `FULL`.
 */
const CUSTOM_AREA = { label: 'VIEW', description: 'a custom view' };

export function ViewControls() {
  const { camera } = useEditorRuntime();
  const { announcer } = useAppServices();
  const snapshot = useCameraSnapshot(camera);
  const { prefersReducedMotion, isCompactLandscape } = useResponsive();

  const rafRef = useRef<number | null>(null);
  /** True while the Board3D chunk is being fetched, ahead of the tilt animation. */
  const [loadingBoard3D, setLoadingBoard3D] = useState(false);
  // -1 (not found) for 'custom' - the arithmetic below then starts back at FULL.
  const areaIndex = AREAS.findIndex(area => area.zone === snapshot.zone);
  const currentArea = AREAS[areaIndex] ?? CUSTOM_AREA;
  const nextArea = AREAS[(areaIndex + 1) % AREAS.length];
  const is3D = (snapshot.camera.tilt ?? 0) > TABLETOP_MIN_TILT;
  const isVerticalBoard = Math.abs(snapshot.camera.rotation ?? 0) > Math.PI / 4;

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const animateTo = useCallback(
    (targetRotation: number, targetTilt: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      // Reduced motion: change the view, just don't animate the change.
      if (prefersReducedMotion) {
        camera.setCamera({ ...camera.camera, rotation: targetRotation, tilt: targetTilt });
        return;
      }

      const startRotation = camera.camera.rotation ?? 0;
      const startTilt = camera.camera.tilt ?? 0;
      let startTime: number | null = null;

      const step = (time: number) => {
        if (startTime === null) startTime = time;
        const raw = Math.min((time - startTime) / ANIMATION_MS, 1);
        const k = raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw; // easeInOut
        camera.setCamera({
          ...camera.camera,
          rotation: startRotation + (targetRotation - startRotation) * k,
          tilt: startTilt + (targetTilt - startTilt) * k,
        });
        rafRef.current = raw < 1 ? requestAnimationFrame(step) : null;
      };

      rafRef.current = requestAnimationFrame(step);
    },
    [camera, prefersReducedMotion]
  );

  const toggle3D = useCallback(() => {
    if (is3D) {
      animateTo(0, 0);
      return;
    }
    // Already in flight: a repeat tap while the chunk loads is a no-op, not a
    // second fetch (the module cache would make it free anyway, but there is
    // no reason to race two `.then`s against the same `loadingBoard3D` flag).
    if (loadingBoard3D) return;

    setLoadingBoard3D(true);
    loadBoard3D()
      .then(() => {
        const rotation = camera.camera.rotation ?? 0;
        animateTo(rotation === 0 ? DEFAULT_ANGLE : rotation, TABLETOP_DEFAULT_TILT);
      })
      .catch(error => {
        // Stay in 2D: never animate a tilt Board3D cannot actually render.
        console.warn('phicecraft: Board3D chunk failed to load', error);
        announcer.announce('3D view unavailable; staying on the flat rink');
      })
      .finally(() => setLoadingBoard3D(false));
  }, [is3D, loadingBoard3D, camera, animateTo, announcer]);

  const spin = useCallback(
    (delta: number) => animateTo((camera.camera.rotation ?? 0) + delta, camera.camera.tilt ?? 0),
    [camera, animateTo]
  );

  const button =
    'touch-target flex items-center justify-center rounded-xl border border-cyan-300/25 bg-[#04111c]/88 text-cyan-100 shadow-lg backdrop-blur-md transition hover:bg-[#0a2130] disabled:opacity-35';

  return (
    <div
      className={`absolute right-2 z-20 flex flex-col gap-1.5 ${isCompactLandscape ? 'top-2' : 'top-14'}`}
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

      <button
        type="button"
        onClick={() => spin(-0.35)}
        disabled={!is3D}
        aria-label="Spin the rink left"
        className={`${button} text-[14px]`}
      >
        <RotateLeftIcon size={16} />
      </button>

      <button
        type="button"
        onClick={() => spin(0.35)}
        disabled={!is3D}
        aria-label="Spin the rink right"
        className={`${button} text-[14px]`}
      >
        <RotateRightIcon size={16} />
      </button>

      {/* Which patch of ice to work on. The zone views frame the real region -
          end boards to the blue line, plus a little neutral ice, because the
          entry into the zone is most of the coaching. */}
      {!is3D && (
        <button
          type="button"
          onClick={() => camera.zoomToZone(nextArea.zone)}
          aria-label={`Showing ${currentArea.description}. Tap for ${nextArea.description}.`}
          className={`${button} px-1.5 text-[10px] font-black tracking-tight`}
        >
          {currentArea.label}
        </button>
      )}

      {/* Turning the board is what makes a full sheet usable on an upright
          phone. It is chosen automatically on a resize, and this is how a
          coach overrules that - so it is hidden in the tabletop, where
          rotation means the orbit angle instead. */}
      {!is3D && (
        <button
          type="button"
          onClick={() =>
            camera.setBoardOrientation(isVerticalBoard ? 'horizontal' : 'vertical')
          }
          aria-pressed={isVerticalBoard}
          aria-label={
            isVerticalBoard ? 'Lay the rink across the screen' : 'Turn the rink up the screen'
          }
          className={`${button} px-2 text-[12px] font-black`}
        >
          <OrientationIcon size={16} />
        </button>
      )}

      <button
        type="button"
        onClick={() => camera.fit()}
        aria-label="Fit the whole rink in view"
        className={`${button} text-[13px]`}
      >
        <FitIcon size={16} />
      </button>
    </div>
  );
}
