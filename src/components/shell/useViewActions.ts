// ============================================================================
// VIEW ACTIONS
//
// Shared view-control behavior for the floating desktop rail and the phone View
// sheet. Keeping the 3D-load ordering in one hook preserves the safety contract:
// Board3D's chunk is awaited before camera.tilt crosses TABLETOP_MIN_TILT.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppServices, useAppState } from '@/hooks/useAppState';
import { actionBounds, actionFrame } from '@/camera/actionZone';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { useCameraSnapshot } from '@/playback/usePlaybackSnapshot';
import { useResponsive } from '@/ui/useResponsive';
import { TABLETOP_DEFAULT_TILT, TABLETOP_MIN_TILT } from '@/core/constants';
import type { Zone } from '@/camera/cameraMath';
import { loadBoard3D } from '@/render3d/loadBoard3D';

/** Enter a straight side view unless the coach already rotated the rink. */
const DEFAULT_ANGLE = 0;
const ANIMATION_MS = 380;
/**
 * The flat fit of a region leaves it small in perspective, because the far
 * side recedes; this brings the play back up to fill the screen. Side-on
 * only: looking down the ice, the near side is magnified by perspective, and
 * any extra zoom pushes the skaters nearest the camera off the screen.
 */
const ACTION_TIGHTEN = 1.12;
const PORTRAIT_ENTRY_TILT = 0.7;

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
  { zone: 'neutral', label: 'N ZONE', description: 'the neutral zone between blue lines' },
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
  const { state } = useAppState();
  const drill = state.drill;
  // Read at call time: the 3D callbacks stay stable while the drill is edited.
  const drillRef = useRef(drill);
  drillRef.current = drill;
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
    (targetRotation: number, targetTilt: number, after: boolean | (() => void) = false) => {
      const finish = () => {
        if (typeof after === 'function') after();
        else if (after) camera.fit();
      };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      // Reduced motion: change the view, just don't animate the change.
      if (prefersReducedMotion) {
        camera.setCamera({ ...camera.camera, rotation: targetRotation, tilt: targetTilt });
        finish();
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
        if (raw === 1) finish();
      };

      rafRef.current = requestAnimationFrame(step);
    },
    [camera, prefersReducedMotion]
  );

  /**
   * Zone framing is computed for the flat board; seen in perspective, that
   * leaves the zone small in the middle of most of the sheet. Tighten about
   * the screen centre so the zone, not the rink, fills the view.
   */
  const tighten = useCallback(
    (factor: number) => {
      const { viewport } = camera.getSnapshot();
      camera.zoomAt(factor, { x: viewport.width / 2, y: viewport.height / 2 });
    },
    [camera]
  );

  // Frame the play, not the whole sheet: the ice the skaters actually use,
  // plus the net they attack.
  const frameAction = useCallback(() => {
    camera.frameRegion(actionBounds(drillRef.current));
    const downIce = Math.abs(camera.camera.rotation ?? 0) > Math.PI / 4;
    if (!downIce) tighten(ACTION_TIGHTEN);
  }, [camera, tighten]);

  /**
   * Which way the rink faces on entering 3D.
   *
   * Side-on suits a wide screen. On a phone held upright, side-on is a thin
   * strip across the middle of the screen with most of it empty; looking down
   * the ice toward the net being attacked fills the screen and reads the way
   * the play actually goes. A rink the coach already turned keeps its angle.
   */
  const entryRotation = useCallback((): number => {
    const current = camera.camera.rotation ?? 0;
    const { viewport } = camera.getSnapshot();
    const portrait = viewport.height > viewport.width * 1.15;
    if (!portrait) return Math.abs(current) > Math.PI / 4 ? DEFAULT_ANGLE : current;
    return actionFrame(drillRef.current).attackedNet === 'right' ? -Math.PI / 2 : Math.PI / 2;
  }, [camera]);

  /**
   * Looking down the ice on an upright phone, a low camera spends half the
   * screen on near ice the play never reaches. A steeper, more overhead angle
   * keeps the play big and still reads as 3D.
   */
  const entryTilt = useCallback((): number => {
    const { viewport } = camera.getSnapshot();
    return viewport.height > viewport.width * 1.15 ? PORTRAIT_ENTRY_TILT : TABLETOP_DEFAULT_TILT;
  }, [camera]);

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
        animateTo(entryRotation(), entryTilt(), frameAction);
      })
      .catch(error => {
        // Stay in 2D: never animate a tilt Board3D cannot actually render.
        console.warn('phicecraft: Board3D chunk failed to load', error);
        announcer.announce('3D view unavailable; staying on the flat rink');
      })
      .finally(() => setLoadingBoard3D(false));
  }, [is3D, loadingBoard3D, animateTo, entryRotation, entryTilt, frameAction, announcer]);

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

  // Low behind the net the play attacks, looking back up the ice at it.
  const behindTheNet = useCallback(() => {
    const { zone, attackedNet } = actionFrame(drill);
    const rotation = attackedNet === 'right' ? Math.PI / 2 : -Math.PI / 2;
    const endZone = attackedNet === 'right' ? 'offensive' : 'defensive';
    animateTo(rotation, 0.95, () => {
      camera.zoomToZone(zone === 'full' ? endZone : zone);
      tighten(1.5);
    });
  }, [animateTo, camera, drill, tighten]);

  return {
    currentArea,
    nextArea,
    is3D,
    isVerticalBoard,
    loadingBoard3D,
    toggle3D,
    spinLeft: () => spin(-0.35),
    spinRight: () => spin(0.35),
    setPresetBroadcast: () => animateTo(0, 0.65, frameAction),
    setPresetEndZone: behindTheNet,
    setPresetTactical: () => animateTo(0, 0.35, true),
    setPresetPOV: () => animateTo(0, 1.25, false),
    zoomToZone,
    cycleArea,
    toggleOrientation,
    fit,
  };
}
