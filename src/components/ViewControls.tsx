// ============================================================================
// VIEW CONTROLS
//
// The tabletop (pseudo-3D) camera cluster. It writes straight into the camera
// store, so leaning the rink back does not republish application state - and
// the animation respects reduced motion.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { useCameraSnapshot } from '@/playback/usePlaybackSnapshot';
import { useResponsive } from '@/ui/useResponsive';
import { TABLETOP_DEFAULT_TILT, TABLETOP_MIN_TILT } from '@/core/constants';
import type { Zone } from '@/camera/cameraMath';

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

export function ViewControls() {
  const { camera } = useEditorRuntime();
  const snapshot = useCameraSnapshot(camera);
  const { prefersReducedMotion, isCompactLandscape } = useResponsive();

  const rafRef = useRef<number | null>(null);
  const [areaIndex, setAreaIndex] = useState(0);
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
    const rotation = camera.camera.rotation ?? 0;
    animateTo(rotation === 0 ? DEFAULT_ANGLE : rotation, TABLETOP_DEFAULT_TILT);
  }, [is3D, camera, animateTo]);

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
        aria-pressed={is3D}
        aria-label={is3D ? 'Switch to the flat top-down view' : 'Switch to the tabletop 3D view'}
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
        ↺
      </button>

      <button
        type="button"
        onClick={() => spin(0.35)}
        disabled={!is3D}
        aria-label="Spin the rink right"
        className={`${button} text-[14px]`}
      >
        ↻
      </button>

      {/* Which patch of ice to work on. The zone views frame the real region -
          end boards to the blue line, plus a little neutral ice, because the
          entry into the zone is most of the coaching. */}
      {!is3D && (
        <button
          type="button"
          onClick={() => {
            const next = (areaIndex + 1) % AREAS.length;
            setAreaIndex(next);
            camera.zoomToZone(AREAS[next].zone);
          }}
          aria-label={`Showing ${AREAS[areaIndex].description}. Tap for ${
            AREAS[(areaIndex + 1) % AREAS.length].description
          }.`}
          className={`${button} px-1.5 text-[10px] font-black tracking-tight`}
        >
          {AREAS[areaIndex].label}
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
          {isVerticalBoard ? '↔' : '↕'}
        </button>
      )}

      <button
        type="button"
        onClick={() => camera.fit()}
        aria-label="Fit the whole rink in view"
        className={`${button} text-[13px]`}
      >
        ⛶
      </button>
    </div>
  );
}
