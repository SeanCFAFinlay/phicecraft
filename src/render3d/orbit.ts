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
import type { Viewport } from '@/camera/cameraMath';
import { clamp } from '@/utils/geometry';
import { rinkToWorld } from './worldMap';

/**
 * World units from the orbit target at zoom 1, chosen so the full 1000x425
 * rink frames inside a 16:9 viewport with the default field of view. Zoom
 * scales it directly (see `orbitFromCamera`) - a coach pinching in on the flat
 * view and then tilting into 3D lands at a distance that keeps roughly the
 * same framing.
 */
export const BASE_DISTANCE = 42;

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
 * Reserved for aspect-ratio-aware framing in a later task (Task 4/5): the
 * distance formula below is deliberately viewport-independent for now (see
 * the brief), but the signature already carries the viewport so callers do
 * not change again once that lands.
 */
export function orbitFromCamera(camera: Camera, viewport: Viewport): Orbit {
  void viewport;

  const azimuth = camera.rotation ?? 0;
  const tilt = camera.tilt ?? 0;
  const polar = clamp(Math.PI / 2 - tilt * TILT_TO_POLAR, POLAR_MIN, Math.PI / 2 - POLAR_MAX_MARGIN);
  const distance = BASE_DISTANCE / camera.zoom;
  const target = rinkToWorld({ x: camera.x, y: camera.y });

  return { azimuth, polar, distance, target };
}
