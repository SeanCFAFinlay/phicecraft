import type { Point } from '@/core/types';

function blend(a: Point, b: Point, amount: number): Point {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
  };
}

/**
 * Chaikin corner cutting preserves authored endpoints while turning abrupt
 * polyline pivots into carveable skating lanes. It never overshoots the route,
 * which keeps smoothed paths safely inside the same rink envelope.
 */
export function smoothRoutePoints(points: Point[], iterations = 2): Point[] {
  if (points.length < 3 || iterations <= 0) return points.map(point => ({ ...point }));
  let current = points.map(point => ({ ...point }));

  for (let iteration = 0; iteration < iterations; iteration++) {
    const next: Point[] = [{ ...current[0] }];
    for (let index = 0; index < current.length - 1; index++) {
      next.push(blend(current[index], current[index + 1], 0.25));
      next.push(blend(current[index], current[index + 1], 0.75));
    }
    next.push({ ...current[current.length - 1] });
    current = next;
  }

  return current;
}
