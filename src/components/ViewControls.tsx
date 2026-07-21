// ============================================================================
// VIEW CONTROLS - tabletop (pseudo-3D) camera controls
//
// A small floating cluster for leaning the rink into the "table hockey" view
// and spinning it. All authoring still happens on the ice; this only drives the
// camera's rotation/tilt. Dragging empty ice orbits once tilted.
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { TABLETOP_DEFAULT_TILT, TABLETOP_MIN_TILT } from '@/core/constants';
import type { Camera } from '@/core/types';

const DEFAULT_ANGLE = -0.4; // A pleasing starting spin, matching the reference render.

export function ViewControls() {
  const { state, actions } = useAppState();
  const camera = state.camera;
  const is3D = (camera.tilt ?? 0) > TABLETOP_MIN_TILT;

  const rafRef = useRef<number | null>(null);
  const cameraRef = useRef<Camera>(camera);
  cameraRef.current = camera;

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // Smoothly ease rotation/tilt toward a target while leaving pan/zoom alone.
  const animateTo = useCallback(
    (targetRotation: number, targetTilt: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const startRotation = cameraRef.current.rotation ?? 0;
      const startTilt = cameraRef.current.tilt ?? 0;
      const duration = 380;
      let startTime: number | null = null;

      const step = (t: number) => {
        if (startTime === null) startTime = t;
        const raw = Math.min((t - startTime) / duration, 1);
        const k = raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw; // easeInOut
        actions.setCamera({
          ...cameraRef.current,
          rotation: startRotation + (targetRotation - startRotation) * k,
          tilt: startTilt + (targetTilt - startTilt) * k,
        });
        if (raw < 1) rafRef.current = requestAnimationFrame(step);
        else rafRef.current = null;
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [actions]
  );

  const toggle3D = useCallback(() => {
    if (is3D) {
      animateTo(0, 0);
    } else {
      const rotation = camera.rotation ?? 0;
      animateTo(rotation === 0 ? DEFAULT_ANGLE : rotation, TABLETOP_DEFAULT_TILT);
    }
  }, [is3D, camera.rotation, animateTo]);

  const spin = useCallback(
    (delta: number) => {
      animateTo((cameraRef.current.rotation ?? 0) + delta, cameraRef.current.tilt ?? 0);
    },
    [animateTo]
  );

  const btn =
    'flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/25 bg-[#04111c]/85 text-cyan-100 shadow-lg backdrop-blur-md transition hover:bg-[#0a2130] active:scale-95 disabled:opacity-35';

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-30 flex flex-col items-center gap-1.5">
      <button
        className={`${btn} ${is3D ? 'ring-1 ring-cyan-300/60 text-cyan-300' : ''} w-auto px-2.5 text-[11px] font-black tracking-wide`}
        onClick={toggle3D}
        title={is3D ? 'Back to top-down view' : 'Tilt into 3D tabletop view'}
      >
        {is3D ? '2D' : '3D'}
      </button>
      <button className={btn} onClick={() => spin(-Math.PI / 6)} disabled={!is3D} title="Spin left">
        ⟲
      </button>
      <button className={btn} onClick={() => spin(Math.PI / 6)} disabled={!is3D} title="Spin right">
        ⟳
      </button>
    </div>
  );
}
