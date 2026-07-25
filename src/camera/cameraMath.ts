// ============================================================================
// CAMERA MATH
//
// Pure functions, unchanged in behaviour from the reducer that used to own
// them. Keeping them here means the store, the tests, and any future consumer
// all agree on exactly what "fit the rink" means.
// ============================================================================

import type { Camera } from '@/core/types';
import {
  DEFAULT_CAMERA,
  FIT_PADDING,
  MAX_ZOOM,
  MIN_ZOOM,
  RINK,
  TABLETOP_MAX_TILT,
} from '@/core/constants';
import { clamp } from '@/utils/geometry';

export interface Viewport {
  width: number;
  height: number;
}

/** Clamp zoom and tilt into their legal ranges. */
export function normalizeCamera(camera: Camera): Camera {
  return {
    ...camera,
    zoom: clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM),
    tilt: clamp(camera.tilt ?? 0, 0, TABLETOP_MAX_TILT),
  };
}

/**
 * The camera that shows the whole rink inside `viewport`.
 * The tabletop lean/spin is a view preference, so it survives a re-fit.
 */
export function calculateFitCamera(viewport: Viewport, base?: Camera): Camera {
  const rotation = base?.rotation ?? 0;
  const tilt = base?.tilt ?? 0;

  if (viewport.width <= 0 || viewport.height <= 0) {
    return { ...DEFAULT_CAMERA, rotation, tilt };
  }

  const zoom = Math.min(
    (viewport.width - FIT_PADDING * 2) / RINK.width,
    (viewport.height - FIT_PADDING * 2) / RINK.height
  );

  return {
    zoom,
    x: (viewport.width - RINK.width * zoom) / 2 - RINK.x * zoom,
    y: (viewport.height - RINK.height * zoom) / 2 - RINK.y * zoom,
    rotation,
    tilt,
  };
}

/** Zoom by `factor` while keeping the world point under `screenPoint` fixed. */
export function zoomAt(camera: Camera, factor: number, screenPoint: { x: number; y: number }): Camera {
  const zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const scale = zoom / camera.zoom;

  return {
    ...camera,
    zoom,
    x: screenPoint.x - (screenPoint.x - camera.x) * scale,
    y: screenPoint.y - (screenPoint.y - camera.y) * scale,
  };
}

export type Zone = 'full' | 'offensive' | 'defensive';

/** Frame a zone of the rink. `full` is the same as a fit. */
export function cameraForZone(zone: Zone, viewport: Viewport, camera: Camera): Camera {
  if (zone === 'full') return calculateFitCamera(viewport, camera);

  const zoom = clamp(2, MIN_ZOOM, MAX_ZOOM);
  const cx = zone === 'offensive' ? RINK.x + RINK.width * 0.62 : RINK.x + RINK.width * 0.38;
  const cy = RINK.centerY;

  return {
    x: -cx * zoom + viewport.width / 2,
    y: -cy * zoom + viewport.height / 2,
    zoom,
    rotation: camera.rotation ?? 0,
    tilt: camera.tilt ?? 0,
  };
}

/**
 * The device pixel ratio to render at.
 *
 * Uncapped DPR on a modern phone means painting 9x the pixels for a diagram
 * that gains nothing above 2x, so this caps at 2 and allows an adaptive drop
 * to 1.5 or 1 when frames are consistently over budget.
 */
export function effectiveDevicePixelRatio(
  deviceRatio: number,
  quality: 'high' | 'medium' | 'low' = 'high'
): number {
  const capped = Math.min(Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1, 2);
  if (quality === 'high') return capped;
  if (quality === 'medium') return Math.min(capped, 1.5);
  return 1;
}
