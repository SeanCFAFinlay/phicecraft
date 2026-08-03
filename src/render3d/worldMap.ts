// ============================================================================
// WORLD MAP
//
// The one place rink coordinates (feet-scaled, origin at the top-left corner,
// (RINK.centerX, RINK.centerY) at centre ice) become three.js world
// coordinates (origin at centre ice, Y up, flat on the XZ ground plane).
//
// Every 2D authoring coordinate a drill stores - player positions, route
// points, event waypoints - is a rink coordinate. Board3D never invents a
// second source of truth for "where things are": it re-projects the SAME
// numbers CanvasSurface draws, through this module.
// ============================================================================

import type { Point } from '@/core/types';
import { RINK } from '@/core/constants';

/** World units per rink unit (which are themselves feet * FT - see constants.ts). */
export const RINK_SCALE = 0.061;

/**
 * Rink (x, y) -> three.js world (x, y, z).
 *
 * Centre ice (RINK.centerX, RINK.centerY) maps to the world origin, so the
 * scene can be built and orbited around (0, 0, 0) regardless of which end of
 * the sheet a drill happens to favour. The rink is flat, so every point lands
 * on y = 0 - actors and props raise themselves off this plane, not this
 * function.
 *
 * Rink y (screen-down in the 2D diagram) becomes world z (into the screen at
 * yaw 0), keeping the ground plane in the XZ plane the way three.js scenes
 * conventionally do, with Y reserved for height.
 */
export function rinkToWorld(p: Point): { x: number; y: number; z: number } {
  return {
    x: p.x * RINK_SCALE - RINK.centerX * RINK_SCALE,
    y: 0,
    z: p.y * RINK_SCALE - RINK.centerY * RINK_SCALE,
  };
}

/**
 * Rink heading (radians, 0 = +x/east, increasing toward +y/"south") -> three.js
 * yaw (radians about +Y, three's convention for a model authored facing +Z).
 *
 * `yaw = -heading + PI/2`: rink heading turns the OPPOSITE way a three.js yaw
 * does (screen-down-positive vs. right-handed-about-Y), and the PI/2 offset
 * accounts for a rink heading of 0 pointing along rink +x while a yaw of 0
 * points a model along its authored +z. Worked example: heading 0 gives
 * yaw = PI/2, which rotates a model's local +z forward vector to world +x -
 * i.e. heading 0 (east) faces the model down the rink's x axis, exactly as
 * rinkToWorld maps rink +x to world +x.
 */
export function headingToYaw(heading: number): number {
  return -heading + Math.PI / 2;
}
