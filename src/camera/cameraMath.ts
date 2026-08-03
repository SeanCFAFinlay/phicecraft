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
  TABLETOP_MIN_TILT,
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

/** The named views a coach can jump between. */
export type Zone = 'full' | 'offensive' | 'defensive';

/** A rectangle of ice, in world units. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How far past the blue line a zone view reaches.
 *
 * A zone drill is not only what happens below the blue line - the entry into
 * it is most of the coaching - so the view carries a little neutral ice.
 */
const ZONE_NEUTRAL_MARGIN = 12 * 5;

/** The patch of ice a named view covers. */
export function rinkRegion(zone: Zone): WorldRect {
  if (zone === 'full') {
    return { x: RINK.x, y: RINK.y, width: RINK.width, height: RINK.height };
  }

  // Home defends the LEFT net, so the defensive end is the left one.
  const isLeft = zone === 'defensive';
  const inner = isLeft
    ? RINK.blueLineLeftX + ZONE_NEUTRAL_MARGIN
    : RINK.blueLineRightX - ZONE_NEUTRAL_MARGIN;

  return isLeft
    ? { x: RINK.x, y: RINK.y, width: inner - RINK.x, height: RINK.height }
    : { x: inner, y: RINK.y, width: RINK.x + RINK.width - inner, height: RINK.height };
}

/** How much of `region` one screen pixel covers, at a given board rotation. */
function fitZoomForRegion(region: WorldRect, viewport: Viewport, rotation: number): number {
  // The region's axis-aligned footprint once turned.
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const width = region.width * cos + region.height * sin;
  const height = region.width * sin + region.height * cos;

  return Math.min(
    (viewport.width - FIT_PADDING * 2) / width,
    (viewport.height - FIT_PADDING * 2) / height
  );
}

/**
 * Whether turning the board would genuinely show more of `region`.
 *
 * Measured rather than guessed from an aspect-ratio threshold: the two
 * candidate zooms are compared directly. The margin stops a near-square
 * viewport flapping between orientations as the keyboard opens and closes.
 *
 * Per REGION, not merely per viewport, because the answer differs. A full
 * sheet is 2.35:1 and wants turning on a phone; a single zone is nearly square
 * and does not.
 */
export function fitsBetterRotated(
  viewport: Viewport,
  region: WorldRect = rinkRegion('full')
): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return false;
  return (
    fitZoomForRegion(region, viewport, BOARD_ROTATION_VERTICAL) >
    fitZoomForRegion(region, viewport, BOARD_ROTATION_HORIZONTAL) * 1.15
  );
}

/** The board rotation that shows the most of `region` in `viewport`. */
export function autoBoardRotation(
  viewport: Viewport,
  region: WorldRect = rinkRegion('full')
): number {
  return fitsBetterRotated(viewport, region) ? BOARD_ROTATION_VERTICAL : BOARD_ROTATION_HORIZONTAL;
}

/**
 * The camera that frames `region` inside `viewport`.
 *
 * `cameraMatrix` maps a world point to
 *   R(world - rinkCentre) * zoom + (camera.x + zoom*centreX, camera.y + zoom*centreY)
 * so putting a region's centre in the middle of the viewport is a matter of
 * solving that for camera.x and camera.y. That is why it needs no special case
 * for a turned board.
 */
export function fitRegionCamera(region: WorldRect, viewport: Viewport, base?: Camera): Camera {
  const rotation = base?.rotation ?? 0;
  const tilt = base?.tilt ?? 0;

  if (viewport.width <= 0 || viewport.height <= 0) {
    return { ...DEFAULT_CAMERA, rotation, tilt };
  }

  const zoom = fitZoomForRegion(region, viewport, rotation);
  const k = Math.cos(tilt);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // Where the region's centre sits relative to the rink centre the matrix
  // rotates about.
  const dx = region.x + region.width / 2 - RINK.centerX;
  const dy = region.y + region.height / 2 - RINK.centerY;
  const offsetX = zoom * (dx * cos - dy * sin);
  const offsetY = zoom * k * (dx * sin + dy * cos);

  return {
    zoom,
    x: viewport.width / 2 - offsetX - zoom * RINK.centerX,
    y: viewport.height / 2 - offsetY - zoom * RINK.centerY,
    rotation,
    tilt,
  };
}

/**
 * The camera that shows the whole rink inside `viewport`.
 * The tabletop lean/spin is a view preference, so it survives a re-fit.
 */
export function calculateFitCamera(viewport: Viewport, base?: Camera): Camera {
  return fitRegionCamera(rinkRegion('full'), viewport, base);
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

/**
 * Frame a named view.
 *
 * This used to hard-code a zoom of 2 and centre on 38% or 62% of the rink's
 * length - numbers with no relationship to where the blue lines actually are,
 * so the "zone" it framed was not a zone. It now fits the real region, and
 * picks the orientation that shows most of THAT region rather than most of the
 * whole sheet: an end zone is nearly square and should not be turned even on a
 * phone where the full sheet is.
 */
export function cameraForZone(zone: Zone, viewport: Viewport, camera: Camera): Camera {
  const region = rinkRegion(zone);
  const isTabletop = (camera.tilt ?? 0) > TABLETOP_MIN_TILT;
  const base = isTabletop ? camera : { ...camera, rotation: autoBoardRotation(viewport, region) };

  return fitRegionCamera(region, viewport, base);
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
