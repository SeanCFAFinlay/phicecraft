// ============================================================================
// ORBIT
//
// Translates the 2D tabletop camera (rotation/tilt/zoom, still the single
// source of truth CameraStore owns and ViewControls animates) into the orbit
// parameters Board3D's three.js camera actually sits at. Nothing here reads
// or writes CameraStore - it is a pure function of one snapshot, so it can be
// unit-tested with no DOM and no renderer.
// ============================================================================

import type { Camera } from '@/core/types';
import { calculateFitCamera, type Viewport } from '@/camera/cameraMath';
import { RINK } from '@/core/constants';
import { clamp, screenToWorld } from '@/utils/geometry';
import { rinkToWorld, RINK_SCALE } from './worldMap';

/** Shared with the renderer so fitting and drawing use the same lens. */
export const ORBIT_FOV_DEGREES = 50;

/** Fit the perspective projection, including the near boards and their height. */
function fittedDistance(azimuth: number, polar: number, viewport: Viewport): number {
  const tanVertical = Math.tan(ORBIT_FOV_DEGREES * Math.PI / 360) * 0.9;
  const tanHorizontal = tanVertical * Math.max(1, viewport.width) / Math.max(1, viewport.height);
  let distance = 1;
  for (const x of [-RINK.width * RINK_SCALE / 2, RINK.width * RINK_SCALE / 2]) {
    for (const z of [-RINK.height * RINK_SCALE / 2, RINK.height * RINK_SCALE / 2]) {
      for (const y of [0, 2.5]) {
        const horizontal = x * Math.cos(azimuth) - z * Math.sin(azimuth);
        const vertical = -x * Math.sin(azimuth) * Math.sin(polar) + y * Math.cos(polar) - z * Math.cos(azimuth) * Math.sin(polar);
        const depth = x * Math.sin(azimuth) * Math.cos(polar) + y * Math.sin(polar) + z * Math.cos(azimuth) * Math.cos(polar);
        distance = Math.max(distance, depth + Math.abs(horizontal) / tanHorizontal, depth + Math.abs(vertical) / tanVertical);
      }
    }
  }
  return distance;
}

/** How steeply `tilt` (radians, 0..~1.3) pitches the orbit toward the horizon. */
const TILT_TO_POLAR = 1.05;
/** Never let the camera reach the horizon itself - an unreadable, grazing view. */
const POLAR_MIN = 0.15;
/** Never let the camera sit exactly overhead - lookAt's up vector degenerates there. */
const POLAR_MAX_MARGIN = 0.12;

export interface Orbit {
  /** Radians about the world +Y axis; straight from `camera.rotation`. */
  azimuth: number;
  /**
   * Elevation above the horizon, in radians: PI/2 is overhead (top-down), a
   * small positive value is a grazing, near-horizon view.
   */
  polar: number;
  /** World units from `target` to the camera. */
  distance: number;
  target: { x: number; y: number; z: number };
}

/**
 * Match the 2D zoom relative to its fitted view, while framing the actual
 * perspective footprint at this viewport aspect ratio.
 */
export function orbitFromCamera(camera: Camera, viewport: Viewport): Orbit {
  const azimuth = camera.rotation ?? 0;
  const tilt = camera.tilt ?? 0;
  const polar = clamp(Math.PI / 2 - tilt * TILT_TO_POLAR, POLAR_MIN, Math.PI / 2 - POLAR_MAX_MARGIN);
  const fittedZoom = calculateFitCamera(viewport, camera).zoom;
  const distance = fittedDistance(azimuth, polar, viewport) * fittedZoom / camera.zoom;

  // `camera.x`/`camera.y` are the TRANSLATION TERMS of the 2D affine
  // `cameraMatrix` (screen-pixel space, entangled with zoom/rotation/tilt) -
  // NOT a rink-space point, so `rinkToWorld(camera.x, camera.y)` (the
  // previous formula here) was a unit error. What Board3D actually wants to
  // orbit around is the rink point a coach currently sees at the centre of
  // their screen, i.e. the inverse image of the viewport's centre under
  // `cameraMatrix(camera)`. `screenToWorld` already IS that inverse (it is
  // `invertAffine(cameraMatrix(camera), sx, sy)`, with a fast path for the
  // untilted/unrotated case) - reusing it here keeps this in lockstep with
  // the 2D hit-testing that already inverts the same matrix, and keeps a 2D
  // pan -> tilt-into-3D transition visually continuous.
  const screenCentreRinkPoint = screenToWorld(viewport.width / 2, viewport.height / 2, camera);
  const target = rinkToWorld(screenCentreRinkPoint);

  return { azimuth, polar, distance, target };
}
