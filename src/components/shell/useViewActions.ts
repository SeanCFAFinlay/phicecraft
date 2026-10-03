// ============================================================================
// VIEW ACTIONS
//
// Shared view-control behavior for the floating desktop rail and the phone View
// sheet. Keeping the 3D-load ordering in one hook preserves the safety contract:
// Board3D's chunk is awaited before camera.tilt crosses TABLETOP_MIN_TILT.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppServices } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { useCameraSnapshot } from '@/playback/usePlaybackSnapshot';
import { useResponsive } from '@/ui/useResponsive';
import { TABLETOP_DEFAULT_TILT, TABLETOP_MIN_TILT } from '@/core/constants';
import type { Zone } from '@/camera/cameraMath';
import { loadBoard3D } from '@/render3d/loadBoard3D';

/** A pleasing starting spin, matching the reference render. */
const DEFAULT_ANGLE = -0.4;
const ANIMATION_MS = 380;

/**
 * The views the area button steps through.
 *
 * Full ice is where most drills are drawn, but a station, a battle or a
 * small-area game happens in one end - and on a phone, a full sheet shown
 * end-to-end makes those players too small to place accurately.
 */
export const VIEW_AREAS: { zone: Zone; label: string; description: string }[] = [
  { zone: 'full', label: 'FULL', description: 'the whole sheet' },
  { zone: 'defensive', label: 'D ZONE', description: 'the left end, to the blue line' },
  { zone: 'offensive', label: 'O ZONE', description: 'the right end, to the blue line' },
];

/**
 * Once the coach has panned or pinch-zoomed by hand, the camera is no longer
 * any of the named views. The cycle button still needs something to show and
 * to step on from.
 */
const CUSTOM_AREA = { label: 'VIEW', description: 'a custom view' };

export function useViewActions() {
  const { camera } = useEditorRuntime();
  const { announcer } = useAppServices();
  const snapshot = useCameraSnapshot(camera);
  const { prefersReducedMotion } = useResponsive();

  const rafRef = useRef<number | null>(null);
  /** True while the Board3D chunk is being fetched, ahead of the tilt animation. */
  const [loadingBoard3D, setLoadingBoard3D] = useState(false);

  // -1 (not found) for 'custom' - the arithmetic below then starts back at FULL.
  const areaIndex = VIEW_AREAS.findIndex(area => area.zone === snapshot.zone);
  const currentArea = VIEW_AREAS[areaIndex] ?? CUSTOM_AREA;
  const nextArea = VIEW_AREAS[(areaIndex + 1) % VIEW_AREAS.length];
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
    // second fetch.
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

  const zoomToZone = useCallback((zone: Zone) => camera.zoomToZone(zone), [camera]);
  const cycleArea = useCallback(() => camera.zoomToZone(nextArea.zone), [camera, nextArea.zone]);
  const toggleOrientation = useCallback(
    () => camera.setBoardOrientation(isVerticalBoard ? 'horizontal' : 'vertical'),
    [camera, isVerticalBoard]
  );
  const fit = useCallback(() => camera.fit(), [camera]);

  return {
    currentArea,
    nextArea,
    is3D,
    isVerticalBoard,
    loadingBoard3D,
    toggle3D,
    spinLeft: () => spin(-0.35),
    spinRight: () => spin(0.35),
    setPresetBroadcast: () => animateTo(-0.4, 0.55),
    setPresetEndZone: () => animateTo(Math.PI / 2, 0.65),
    setPresetTactical: () => animateTo(0, 0.95),
    zoomToZone,
    cycleArea,
    toggleOrientation,
    fit,
  };
}
