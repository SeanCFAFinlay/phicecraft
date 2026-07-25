// ============================================================================
// GEOMETRY UTILITIES
// ============================================================================

import type { Point, Camera } from '@/core/types';
import { RINK } from '@/core/constants';

/**
 * Calculate distance between two points
 */
export function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ============================================================================
// CAMERA TRANSFORM
//
// The world->screen mapping is a single 2x3 affine matrix so that a rotated,
// tilted "tabletop" view stays perfectly invertible - hit-testing just runs the
// inverse. With rotation = tilt = 0 the matrix collapses to plain translate +
// scale, identical to the original flat diagram.
//
//   screen.x = a*wx + c*wy + e
//   screen.y = b*wx + d*wy + f
// ============================================================================

export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Build the world->screen affine matrix for a camera. Rotation spins the sheet
 * about the rink centre; tilt foreshortens the depth (screen-vertical) axis by
 * cos(tilt), which is what makes a flat plane read as a table leaning away.
 */
export function cameraMatrix(camera: Camera): Affine {
  const { x, y, zoom } = camera;
  const rotation = camera.rotation ?? 0;
  const tilt = camera.tilt ?? 0;

  const cx = RINK.centerX;
  const cy = RINK.centerY;
  const k = Math.cos(tilt); // vertical foreshorten: 1 flat -> 0 edge-on
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // Linear part = zoom * foreshorten * rotate, applied about the rink centre.
  const a = zoom * cos;
  const c = -zoom * sin;
  const b = zoom * k * sin;
  const d = zoom * k * cos;

  // Keep camera.x / camera.y meaning identical to the flat case: world (0,0)
  // still lands at (camera.x, camera.y) when rotation = tilt = 0.
  const ox = x + zoom * cx;
  const oy = y + zoom * cy;
  const e = ox - a * cx - c * cy;
  const f = oy - b * cx - d * cy;

  return { a, b, c, d, e, f };
}

/** Apply an affine matrix to a world point. */
export function applyAffine(m: Affine, wx: number, wy: number): Point {
  return { x: m.a * wx + m.c * wy + m.e, y: m.b * wx + m.d * wy + m.f };
}

/** Invert an affine matrix (screen -> world). */
export function invertAffine(m: Affine, sx: number, sy: number): Point {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-9) return { x: 0, y: 0 };
  const px = sx - m.e;
  const py = sy - m.f;
  return {
    x: (m.d * px - m.c * py) / det,
    y: (-m.b * px + m.a * py) / det,
  };
}

/**
 * Calculate midpoint between two points
 */
export function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

/**
 * Convert world coordinates to screen coordinates
 */
export function worldToScreen(wx: number, wy: number, camera: Camera): Point {
  // Fast path for the flat diagram keeps the common case allocation-light.
  if (!camera.rotation && !camera.tilt) {
    return { x: wx * camera.zoom + camera.x, y: wy * camera.zoom + camera.y };
  }
  return applyAffine(cameraMatrix(camera), wx, wy);
}

/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(sx: number, sy: number, camera: Camera): Point {
  if (!camera.rotation && !camera.tilt) {
    return { x: (sx - camera.x) / camera.zoom, y: (sy - camera.y) / camera.zoom };
  }
  return invertAffine(cameraMatrix(camera), sx, sy);
}

/**
 * Get position along a polyline at parameter t (0-1)
 */
export function pointAtParameter(points: Point[], t: number): Point {
  if (!points || points.length < 1) {
    return { x: 0, y: 0 };
  }
  if (points.length === 1) {
    return { x: points[0].x, y: points[0].y };
  }

  // Calculate total length and segment lengths
  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const len = distance(points[i], points[i + 1]);
    segmentLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) {
    return { x: points[0].x, y: points[0].y };
  }

  // Clamp t and find target distance
  const clampedT = Math.max(0, Math.min(1, t));
  const targetDistance = clampedT * totalLength;
  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    if (accumulated + segmentLengths[i] >= targetDistance - 1e-9) {
      const segmentT = segmentLengths[i] > 0
        ? (targetDistance - accumulated) / segmentLengths[i]
        : 0;
      const clampedSegT = Math.max(0, Math.min(1, segmentT));

      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * clampedSegT,
        y: points[i].y + (points[i + 1].y - points[i].y) * clampedSegT,
      };
    }
    accumulated += segmentLengths[i];
  }

  // Return last point
  return {
    x: points[points.length - 1].x,
    y: points[points.length - 1].y,
  };
}

/**
 * Find the closest point on a polyline to a given point
 */
export function closestPointOnPolyline(
  points: Point[],
  target: Point
): { t: number; point: Point; distance: number } {
  if (!points || points.length === 0) {
    return { t: 0, point: { x: 0, y: 0 }, distance: Infinity };
  }

  if (points.length === 1) {
    return {
      t: 0,
      point: { x: points[0].x, y: points[0].y },
      distance: distance(target, points[0]),
    };
  }

  // Calculate total length and segment lengths
  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const len = distance(points[i], points[i + 1]);
    segmentLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) {
    return {
      t: 0,
      point: { x: points[0].x, y: points[0].y },
      distance: distance(target, points[0]),
    };
  }

  let bestResult = {
    t: 0,
    point: { x: points[0].x, y: points[0].y },
    distance: Infinity,
  };

  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const ax = points[i].x;
    const ay = points[i].y;
    const bx = points[i + 1].x;
    const by = points[i + 1].y;
    const len = segmentLengths[i];

    if (len < 0.001) {
      accumulated += len;
      continue;
    }

    // Project target onto segment
    const projection = Math.max(0, Math.min(1,
      ((target.x - ax) * (bx - ax) + (target.y - ay) * (by - ay)) / (len * len)
    ));

    const closestX = ax + projection * (bx - ax);
    const closestY = ay + projection * (by - ay);
    const dist = Math.sqrt((target.x - closestX) ** 2 + (target.y - closestY) ** 2);

    if (dist < bestResult.distance) {
      bestResult = {
        distance: dist,
        point: { x: closestX, y: closestY },
        t: (accumulated + projection * len) / totalLength,
      };
    }

    accumulated += len;
  }

  return bestResult;
}

/**
 * Generate arc points for curved pass/shot lines
 */
export function generateArcPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curvature: number = 0.16
): Point[] {
  const points: Point[] = [];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // Control point perpendicular to midpoint
  const bx = mx + (-dy / len) * len * curvature;
  const by = my + (dx / len) * len * curvature;

  // Generate quadratic bezier points
  for (let t = 0; t <= 1.001; t += 0.04) {
    const u = 1 - t;
    points.push({
      x: u * u * x1 + 2 * u * t * bx + t * t * x2,
      y: u * u * y1 + 2 * u * t * by + t * t * y2,
    });
  }

  return points;
}

/**
 * Decimate a path to reduce point count
 */
export function decimatePath(points: Point[], targetCount: number = 50): Point[] {
  if (points.length <= targetCount) {
    return points;
  }

  const result: Point[] = [points[0]];
  const step = points.length / targetCount;

  for (let i = 1; i < targetCount - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }

  result.push(points[points.length - 1]);
  return result;
}

/**
 * Smooth a path using Chaikin's algorithm
 */
export function smoothPath(points: Point[], iterations: number = 2): Point[] {
  let current = points;

  for (let j = 0; j < iterations; j++) {
    const next: Point[] = [current[0]];

    for (let i = 0; i < current.length - 1; i++) {
      next.push({
        x: current[i].x * 0.75 + current[i + 1].x * 0.25,
        y: current[i].y * 0.75 + current[i + 1].y * 0.25,
      });
      next.push({
        x: current[i].x * 0.25 + current[i + 1].x * 0.75,
        y: current[i].y * 0.25 + current[i + 1].y * 0.75,
      });
    }

    next.push(current[current.length - 1]);
    current = next;
  }

  return current;
}

/**
 * Process raw drawing points into a smooth skate path
 */
export function processRawPath(rawPoints: Point[]): Point[] {
  const decimated = decimatePath(rawPoints);
  return smoothPath(decimated);
}

/**
 * A small, evenly-spaced set of draggable control points for an existing skate
 * route. The first control is pinned to the route's start (the player), the
 * rest are handles the author can drag to reshape the route.
 */
export function routeControlPoints(points: Point[], count = 5): Point[] {
  if (points.length <= count) return points.map(p => ({ x: p.x, y: p.y }));
  const controls: Point[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i / (count - 1)) * (points.length - 1));
    controls.push({ x: points[idx].x, y: points[idx].y });
  }
  return controls;
}

/**
 * Rebuild a smooth route from a small control set (used while dragging a
 * control handle), keeping the start anchored.
 */
export function routeFromControls(controls: Point[]): Point[] {
  if (controls.length < 2) return controls.map(p => ({ x: p.x, y: p.y }));
  return smoothPath(controls, 3);
}

/**
 * Sample the puck line for an event. With a `via` midpoint the puck bends
 * through it (a quadratic that passes through `via` at its midpoint); otherwise
 * it is a straight from->to segment.
 */
export function eventCurvePoints(from: Point, to: Point, via?: Point): Point[] {
  if (!via) return [from, to];
  // Control point chosen so the sampled midpoint lands exactly on `via`.
  const cx = 2 * via.x - (from.x + to.x) / 2;
  const cy = 2 * via.y - (from.y + to.y) / 2;
  const pts: Point[] = [];
  for (let t = 0; t <= 1.0001; t += 1 / 18) {
    const u = 1 - t;
    pts.push({
      x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
      y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
    });
  }
  return pts;
}

/**
 * Calculate angle between two points (in radians)
 */
export function angle(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Check if a point is inside a circle
 */
export function pointInCircle(point: Point, center: Point, radius: number): boolean {
  return distance(point, center) <= radius;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Ease-in-out quadratic interpolation
 */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ============================================================================
// RINK CONTAINMENT
// ============================================================================

/** True when the point is inside the rounded rink outline, with `margin` inset. */
export function isInsideRink(point: Point, margin = 0): boolean {
  const clamped = constrainToRink(point, margin);
  return Math.abs(clamped.x - point.x) < 1e-6 && Math.abs(clamped.y - point.y) < 1e-6;
}

/**
 * Move a point to the nearest position inside the rink outline.
 *
 * The rink is a rounded rectangle, so clamping to the bounding box alone would
 * leave objects floating in the corner cut-outs. Inside the corner squares the
 * point is projected onto the corner arc instead.
 *
 * `margin` keeps authored objects a comfortable distance off the boards so they
 * remain grabbable; pass 0 for a strict containment test.
 */
export function constrainToRink(point: Point, margin = 0): Point {
  const left = RINK.x + margin;
  const right = RINK.x + RINK.width - margin;
  const top = RINK.y + margin;
  const bottom = RINK.y + RINK.height - margin;

  // A margin wider than the rink collapses it to the centre line.
  if (left >= right || top >= bottom) {
    return { x: RINK.centerX, y: RINK.centerY };
  }

  const radius = Math.max(0, RINK.cornerRadius - margin);
  let x = clamp(Number.isFinite(point.x) ? point.x : RINK.centerX, left, right);
  let y = clamp(Number.isFinite(point.y) ? point.y : RINK.centerY, top, bottom);

  if (radius <= 0) return { x, y };

  // Each corner arc is centred `radius` in from both edges.
  const cornerX = x < left + radius ? left + radius : x > right - radius ? right - radius : null;
  const cornerY = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : null;

  if (cornerX !== null && cornerY !== null) {
    const dx = x - cornerX;
    const dy = y - cornerY;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      const scale = radius / dist;
      x = cornerX + dx * scale;
      y = cornerY + dy * scale;
    }
  }

  return { x, y };
}
