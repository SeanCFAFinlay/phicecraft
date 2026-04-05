// ============================================================================
// GEOMETRY UTILITIES
// ============================================================================

import type { Point, Camera } from '@/core/types';

/**
 * Calculate distance between two points
 */
export function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
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
  return {
    x: wx * camera.zoom + camera.x,
    y: wy * camera.zoom + camera.y,
  };
}

/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(sx: number, sy: number, camera: Camera): Point {
  return {
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom,
  };
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
