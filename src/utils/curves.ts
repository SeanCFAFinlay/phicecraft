// ============================================================================
// CURVES
//
// Every authored line in the app - a skating route, a pass, a shot, a dump -
// is a CONTROL POLYGON plus a shape. This module turns that pair into the
// dense polyline that both the renderer and the simulation consume, so the
// line you see and the line the puck or skater follows are the same geometry.
//
// Two shapes:
//
//   spline    a centripetal Catmull-Rom curve that passes THROUGH every
//             control point, so a handle you drag ends up on the line
//   polyline  straight segments with sharp corners
//
// Catmull-Rom rather than Chaikin corner-cutting: Chaikin approximates the
// control polygon without touching it, so a dragged handle never lands on the
// curve it is supposed to be shaping. For an editable line that is the wrong
// trade.
// ============================================================================

import type { Point } from '@/core/types';

export type CurveShape = 'spline' | 'polyline';

/** Samples generated per spline segment. Enough to look smooth at full zoom. */
const SAMPLES_PER_SEGMENT = 12;

/**
 * Centripetal parameterisation (alpha = 0.5). Uniform Catmull-Rom produces
 * cusps and self-intersections when control points are unevenly spaced, which
 * is exactly what hand-drawn routes are.
 */
const ALPHA = 0.5;

function clonePoints(points: Point[]): Point[] {
  return points.map(point => ({ x: point.x, y: point.y }));
}

function knotDelta(a: Point, b: Point): number {
  const squared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  // Guard against coincident control points, which would divide by zero.
  return Math.max(Math.pow(squared, ALPHA / 2), 1e-6);
}

/**
 * One centripetal Catmull-Rom segment from `p1` to `p2`, using `p0` and `p3`
 * as tangent context.
 */
function sampleSegment(p0: Point, p1: Point, p2: Point, p3: Point, samples: number): Point[] {
  const t0 = 0;
  const t1 = t0 + knotDelta(p0, p1);
  const t2 = t1 + knotDelta(p1, p2);
  const t3 = t2 + knotDelta(p2, p3);

  const output: Point[] = [];
  for (let step = 0; step < samples; step++) {
    const t = t1 + ((t2 - t1) * step) / samples;

    const a1 = interpolate(p0, p1, t0, t1, t);
    const a2 = interpolate(p1, p2, t1, t2, t);
    const a3 = interpolate(p2, p3, t2, t3, t);
    const b1 = interpolate(a1, a2, t0, t2, t);
    const b2 = interpolate(a2, a3, t1, t3, t);

    output.push(interpolate(b1, b2, t1, t2, t));
  }
  return output;
}

function interpolate(a: Point, b: Point, ta: number, tb: number, t: number): Point {
  const span = tb - ta || 1e-6;
  const left = (tb - t) / span;
  const right = (t - ta) / span;
  return { x: a.x * left + b.x * right, y: a.y * left + b.y * right };
}

/**
 * Expand a control polygon into the dense polyline everything else consumes.
 *
 * Always passes through the first and last control point, so a route still
 * starts on its player and a pass still ends on its receiver.
 */
export function expandCurve(controls: Point[], shape: CurveShape = 'spline'): Point[] {
  if (controls.length < 2) return clonePoints(controls);
  if (shape === 'polyline' || controls.length === 2) return clonePoints(controls);

  // Duplicate the endpoints so the first and last segments have tangent
  // context without inventing a direction the author did not draw.
  const padded = [controls[0], ...controls, controls[controls.length - 1]];
  const output: Point[] = [];

  for (let index = 1; index < padded.length - 2; index++) {
    output.push(
      ...sampleSegment(padded[index - 1], padded[index], padded[index + 1], padded[index + 2], SAMPLES_PER_SEGMENT)
    );
  }

  output.push({ ...controls[controls.length - 1] });
  return output;
}

// ----------------------------------------------------------------------------
// Arc length
// ----------------------------------------------------------------------------

function segmentLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Total length of a dense polyline, in world units. */
export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    total += segmentLength(points[index], points[index + 1]);
  }
  return total;
}

export interface SampledPoint {
  position: Point;
  /** Unit direction of travel at this position. */
  tangent: Point;
  /** 0..1 along the line. */
  progress: number;
}

/**
 * Walk `distance` along a dense polyline. This is what makes the puck follow
 * the line the author drew rather than cutting straight to the target.
 */
export function pointAtDistance(points: Point[], distance: number): SampledPoint {
  if (points.length === 0) {
    return { position: { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, progress: 0 };
  }
  if (points.length === 1) {
    return { position: { ...points[0] }, tangent: { x: 1, y: 0 }, progress: 0 };
  }

  const total = polylineLength(points);
  if (total <= 0) {
    return { position: { ...points[0] }, tangent: { x: 1, y: 0 }, progress: 0 };
  }

  const target = Math.max(0, Math.min(total, distance));
  let travelled = 0;

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const length = segmentLength(start, end);
    if (length <= 0) continue;

    if (travelled + length >= target - 1e-9) {
      const local = (target - travelled) / length;
      return {
        position: {
          x: start.x + (end.x - start.x) * local,
          y: start.y + (end.y - start.y) * local,
        },
        tangent: { x: (end.x - start.x) / length, y: (end.y - start.y) / length },
        progress: target / total,
      };
    }
    travelled += length;
  }

  const last = points[points.length - 1];
  const previous = points[points.length - 2];
  const length = Math.max(segmentLength(previous, last), 1e-6);
  return {
    position: { ...last },
    tangent: { x: (last.x - previous.x) / length, y: (last.y - previous.y) / length },
    progress: 1,
  };
}

/** Position at a normalized 0..1 position along the line. */
export function pointAtProgress(points: Point[], progress: number): SampledPoint {
  return pointAtDistance(points, polylineLength(points) * Math.max(0, Math.min(1, progress)));
}

// ----------------------------------------------------------------------------
// Editing the control polygon
// ----------------------------------------------------------------------------

/** The fewest controls a line can have and still be a line. */
export const MIN_CONTROLS = 2;

/**
 * How many controls a freshly drawn route keeps.
 *
 * Small enough that every one of them is a grabbable handle, large enough to
 * preserve the shape of a hand-drawn curve.
 */
export const ROUTE_CONTROL_TARGET = 10;

/** Above this, handles would overlap; the inspector offers to simplify. */
export const MAX_COMFORTABLE_CONTROLS = 16;

export function moveControl(controls: Point[], index: number, to: Point): Point[] {
  if (index < 0 || index >= controls.length) return clonePoints(controls);
  return controls.map((point, current) => (current === index ? { x: to.x, y: to.y } : { ...point }));
}

/**
 * Insert a new control at `index` (i.e. between `index - 1` and `index`).
 * Clamped so the endpoints stay the endpoints.
 */
export function insertControl(controls: Point[], index: number, point: Point): Point[] {
  const at = Math.max(1, Math.min(controls.length - 1, index));
  const next = clonePoints(controls);
  next.splice(at, 0, { x: point.x, y: point.y });
  return next;
}

/** Remove a control, refusing to drop below two points. */
export function removeControl(controls: Point[], index: number): Point[] {
  if (controls.length <= MIN_CONTROLS) return clonePoints(controls);
  if (index < 0 || index >= controls.length) return clonePoints(controls);
  return clonePoints(controls).filter((_, current) => current !== index);
}

/**
 * Which segment of the control polygon a point is nearest, and where on it.
 * Used to decide where a new control should be inserted.
 */
export function nearestControlSegment(
  controls: Point[],
  point: Point
): { index: number; closest: Point; distance: number } {
  let best = { index: 1, closest: { ...controls[0] }, distance: Number.POSITIVE_INFINITY };

  for (let index = 0; index < controls.length - 1; index++) {
    const start = controls[index];
    const end = controls[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const closest = { x: start.x + dx * t, y: start.y + dy * t };
    const distance = Math.hypot(point.x - closest.x, point.y - closest.y);

    if (distance < best.distance) {
      best = { index: index + 1, closest, distance };
    }
  }

  return best;
}

/** The midpoint of each segment: where the "add a point here" affordances go. */
export function controlMidpoints(controls: Point[]): { index: number; point: Point }[] {
  const midpoints: { index: number; point: Point }[] = [];
  for (let index = 0; index < controls.length - 1; index++) {
    midpoints.push({
      index: index + 1,
      point: {
        x: (controls[index].x + controls[index + 1].x) / 2,
        y: (controls[index].y + controls[index + 1].y) / 2,
      },
    });
  }
  return midpoints;
}

/**
 * Reduce a dense point list to at most `target` controls, keeping the ends.
 *
 * Used for a freshly drawn route (hundreds of raw pointer samples) and offered
 * as an explicit action for legacy routes stored by an older build, which kept
 * fifty pre-smoothed points and were therefore impossible to hand-edit.
 */
export function simplifyToControls(points: Point[], target = ROUTE_CONTROL_TARGET): Point[] {
  if (points.length <= target) return clonePoints(points);
  if (target < MIN_CONTROLS) return [{ ...points[0] }, { ...points[points.length - 1] }];

  const controls: Point[] = [];
  for (let index = 0; index < target; index++) {
    const source = Math.round((index / (target - 1)) * (points.length - 1));
    controls.push({ ...points[source] });
  }
  return controls;
}
