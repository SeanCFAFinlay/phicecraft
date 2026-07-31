// ============================================================================
// DASHED LINE — pure tessellation tests
//
// Pixi has no native dashed stroke, unlike Canvas's `ctx.setLineDash`. This
// module walks an already-expanded polyline (the SAME dense points
// `expandCurve` produces - see PathRenderer.ts) and cuts it into alternating
// "on"/"off" sub-polylines, so a Pixi Graphics can stroke only the "on" ones
// and reproduce the same dash pattern.
//
// No DOM/Pixi touched here - this is pure geometry, hence a plain
// `.test.ts`, not `.dom.test.ts`.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { dashPolyline, polylineOf } from './dashedLine';
import type { Point } from '@/core/types';

function length(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

describe('dashPolyline', () => {
  it('returns nothing for fewer than two points', () => {
    expect(dashPolyline([{ x: 0, y: 0 }], { dash: 9, gap: 6 })).toEqual([]);
    expect(dashPolyline([], { dash: 9, gap: 6 })).toEqual([]);
  });

  it('parity: concatenating every segment (on and off) reconstructs the full polyline length', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 100, y: 30 },
    ];
    const total = length(points);
    const segments = dashPolyline(points, { dash: 9, gap: 6 });

    const reconstructed = segments.reduce((sum, segment) => sum + length(segment.points), 0);
    expect(reconstructed).toBeCloseTo(total, 5);
  });

  it('alternates on/off starting with an "on" dash at distance 0', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const segments = dashPolyline(points, { dash: 9, gap: 6 });

    expect(segments[0].on).toBe(true);
    segments.forEach((segment, index) => {
      if (index === 0) return;
      expect(segment.on).toBe(!segments[index - 1].on);
    });
  });

  it('every "on" segment is close to the requested dash length, except possibly the last (truncated by the line end)', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const segments = dashPolyline(points, { dash: 9, gap: 6 });
    const onSegments = segments.filter(segment => segment.on);

    onSegments.slice(0, -1).forEach(segment => {
      expect(length(segment.points)).toBeCloseTo(9, 5);
    });
    expect(length(onSegments[onSegments.length - 1].points)).toBeLessThanOrEqual(9 + 1e-6);
  });

  it('a straight line of exactly one dash cycle produces one on and one off segment', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 15, y: 0 }];
    const segments = dashPolyline(points, { dash: 9, gap: 6 });

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ on: true });
    expect(segments[1]).toMatchObject({ on: false });
    expect(length(segments[0].points)).toBeCloseTo(9, 5);
    expect(length(segments[1].points)).toBeCloseTo(6, 5);
  });

  it('follows a bend in the polyline rather than cutting across it', () => {
    // An "on" segment spanning the corner must include the corner vertex, not
    // a straight line from before it to after it.
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const segments = dashPolyline(points, { dash: 12, gap: 4 });
    const firstOn = segments[0];

    expect(firstOn.on).toBe(true);
    // The corner vertex (10, 0) must appear in the segment's own points -
    // proof the tessellation walked the bend instead of shortcutting it.
    expect(firstOn.points.some(p => Math.abs(p.x - 10) < 1e-6 && Math.abs(p.y - 0) < 1e-6)).toBe(
      true
    );
  });

  it('degenerates to a single solid "on" segment when dash length is zero or negative', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }];
    const segments = dashPolyline(points, { dash: 0, gap: 6 });
    expect(segments).toHaveLength(1);
    expect(segments[0].on).toBe(true);
    expect(length(segments[0].points)).toBeCloseTo(50, 5);
  });

  it('handles coincident points (zero-length polyline) without throwing', () => {
    const points: Point[] = [{ x: 5, y: 5 }, { x: 5, y: 5 }];
    expect(() => dashPolyline(points, { dash: 9, gap: 6 })).not.toThrow();
    expect(dashPolyline(points, { dash: 9, gap: 6 })).toEqual([]);
  });
});

describe('polylineOf (the "on" segments only, ready to stroke)', () => {
  it('filters out the gaps, keeping only dash segments', () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const onlyOn = polylineOf(points, { dash: 9, gap: 6 });
    expect(onlyOn.every(segment => segment.length >= 2)).toBe(true);
    // 100 / 15 = 6.67 cycles -> 7 "on" dashes (last one truncated)
    expect(onlyOn).toHaveLength(7);
  });
});
