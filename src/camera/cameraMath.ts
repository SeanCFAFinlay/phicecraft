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
 * The board turned a quarter turn, so a TALL screen shows a LONG rink.
 *
 * A phone held upright is roughly 390x600 of usable editor area. Fitting a
 * 1000x425 sheet into that horizontally gives a strip about a quarter of the
 * screen high, surrounded by empty stage - which is what the market review
 * measured and scored the mobile portrait experience 4/10 for. Turned, the
 * same sheet fills nearly the whole height.
 */
export const BOARD_ROTATION_VERTICAL = -Math.PI / 2;
export const BOARD_ROTATION_HORIZONTAL = 0;

/** How much of the rink one screen pixel covers, at a given board rotation. */
function fitZoom(viewport: Viewport, rotation: number): number {
  // The rink's axis-aligned footprint once turned.
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const width = RINK.width * cos + RINK.height * sin;
  const height = RINK.width * sin + RINK.height * cos;

  return Math.min(
    (viewport.width - FIT_PADDING * 2) / width,
    (viewport.height - FIT_PADDING * 2) / height
  );
}

/**
 * Whether turning the board would genuinely show more ice.
 *
 * Measured rather than guessed from an aspect-ratio threshold: the two
 * candidate zooms are compared directly. The margin stops a near-square
 * viewport flapping between orientations as the keyboard opens and closes.
 */
export function fitsBetterRotated(viewport: Viewport): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return false;
  return fitZoom(viewport, BOARD_ROTATION_VERTICAL) > fitZoom(viewport, BOARD_ROTATION_HORIZONTAL) * 1.15;
}

/** The board rotation that shows the most ice in `viewport`. */
export function autoBoardRotation(viewport: Viewport): number {
  return fitsBetterRotated(viewport) ? BOARD_ROTATION_VERTICAL : BOARD_ROTATION_HORIZONTAL;
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

  const zoom = fitZoom(viewport, rotation);

  // The rink CENTRE lands at (x + zoom*centreX, y + zoom*centreY) whatever the
  // rotation - that falls out of how `cameraMatrix` anchors its origin - so
  // centring is the same arithmetic at any orientation. At rotation 0 this is
  // arithmetically identical to the half-the-leftover-space form it replaces.
  return {
    zoom,
    x: viewport.width / 2 - zoom * RINK.centerX,
    y: viewport.height / 2 - zoom * RINK.centerY,
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
