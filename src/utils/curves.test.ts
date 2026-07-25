// ============================================================================
// CURVES
//
// The property that matters most: a spline PASSES THROUGH every control point.
// That is what makes a dragged handle land on the line it is shaping, and it
// is the reason this is Catmull-Rom rather than Chaikin corner-cutting.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  MAX_COMFORTABLE_CONTROLS,
  MIN_CONTROLS,
  ROUTE_CONTROL_TARGET,
  controlMidpoints,
  expandCurve,
  insertControl,
  moveControl,
  nearestControlSegment,
  pointAtDistance,
  pointAtProgress,
  polylineLength,
  removeControl,
  simplifyToControls,
} from './curves';
import type { Point } from '@/core/types';

const SQUARE: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

/** The shortest distance from `point` to any vertex of `points`. */
function nearestVertexDistance(points: Point[], point: Point): number {
  return Math.min(...points.map(candidate => Math.hypot(candidate.x - point.x, candidate.y - point.y)));
}

/** The sharpest direction change anywhere along a polyline, in radians. */
function maxTurnAngle(points: Point[]): number {
  let sharpest = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const inbound = Math.atan2(points[index].y - points[index - 1].y, points[index].x - points[index - 1].x);
    const outbound = Math.atan2(points[index + 1].y - points[index].y, points[index + 1].x - points[index].x);
    let turn = Math.abs(outbound - inbound);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    sharpest = Math.max(sharpest, turn);
  }
  return sharpest;
}

describe('expandCurve', () => {
  it('returns the controls unchanged for a polyline', () => {
    expect(expandCurve(SQUARE, 'polyline')).toEqual(SQUARE);
  });

  it('leaves a two-point line alone whatever the shape', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ];
    expect(expandCurve(line, 'spline')).toEqual(line);
    expect(expandCurve(line, 'polyline')).toEqual(line);
  });

  it('handles degenerate input without throwing', () => {
    expect(expandCurve([], 'spline')).toEqual([]);
    expect(expandCurve([{ x: 1, y: 2 }], 'spline')).toEqual([{ x: 1, y: 2 }]);
  });

  it('passes through every control point', () => {
    const curve = expandCurve(SQUARE, 'spline');
    for (const control of SQUARE) {
      // Within a fraction of a world unit - the curve genuinely touches it.
      expect(nearestVertexDistance(curve, control)).toBeLessThan(0.5);
    }
  });

  it('keeps the first and last control exactly, so a route still starts on its player', () => {
    const curve = expandCurve(SQUARE, 'spline');
    expect(curve[0]).toEqual(SQUARE[0]);
    expect(curve.at(-1)).toEqual(SQUARE.at(-1));
  });

  it('produces a denser line than the control polygon', () => {
    expect(expandCurve(SQUARE, 'spline').length).toBeGreaterThan(SQUARE.length * 5);
  });

  it('rounds the corners a polyline keeps sharp', () => {
    // The difference between the two shapes is turn angle, not length: an
    // interpolating spline passes through every control AND bows between them,
    // so it is actually the LONGER of the two.
    expect(maxTurnAngle(expandCurve(SQUARE, 'polyline'))).toBeCloseTo(Math.PI / 2, 3);
    expect(maxTurnAngle(expandCurve(SQUARE, 'spline'))).toBeLessThan(0.5);
  });

  it('is longer than the cornered path, because it bows through the controls', () => {
    // Worth stating explicitly: switching a route to a spline lengthens it, so
    // the skater covers more ground and the route takes longer.
    expect(polylineLength(expandCurve(SQUARE, 'spline'))).toBeGreaterThan(
      polylineLength(expandCurve(SQUARE, 'polyline'))
    );
  });

  it('survives coincident control points', () => {
    const duplicated = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const curve = expandCurve(duplicated, 'spline');
    expect(curve.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });

  it('does not overshoot far outside the control polygon', () => {
    const curve = expandCurve(SQUARE, 'spline');
    // Centripetal parameterisation is chosen precisely to avoid the loops and
    // cusps uniform Catmull-Rom produces on unevenly spaced controls.
    for (const point of curve) {
      expect(point.x).toBeGreaterThan(-30);
      expect(point.x).toBeLessThan(130);
      expect(point.y).toBeGreaterThan(-30);
      expect(point.y).toBeLessThan(130);
    }
  });

  it('does not share point objects with its controls', () => {
    const curve = expandCurve(SQUARE, 'polyline');
    curve[0].x = 999;
    expect(SQUARE[0].x).toBe(0);
  });
});

describe('polylineLength', () => {
  it('measures a straight run', () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      ])
    ).toBe(50);
  });

  it('is zero for a single point', () => {
    expect(polylineLength([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe('pointAtDistance', () => {
  const line: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('walks along the line rather than cutting across it', () => {
    // 150 along an L is halfway up the second leg, not on the diagonal.
    const sampled = pointAtDistance(line, 150);
    expect(sampled.position.x).toBeCloseTo(100, 6);
    expect(sampled.position.y).toBeCloseTo(50, 6);
  });

  it('reports the direction of travel', () => {
    expect(pointAtDistance(line, 50).tangent).toEqual({ x: 1, y: 0 });
    expect(pointAtDistance(line, 150).tangent).toEqual({ x: 0, y: 1 });
  });

  it('reports progress as a fraction of total length', () => {
    expect(pointAtDistance(line, 100).progress).toBeCloseTo(0.5, 6);
  });

  it('clamps past either end', () => {
    expect(pointAtDistance(line, -50).position).toEqual({ x: 0, y: 0 });
    expect(pointAtDistance(line, 9999).position).toEqual({ x: 100, y: 100 });
    expect(pointAtDistance(line, 9999).progress).toBe(1);
  });

  it('survives an empty or single-point line', () => {
    expect(pointAtDistance([], 10).position).toEqual({ x: 0, y: 0 });
    expect(pointAtDistance([{ x: 7, y: 8 }], 10).position).toEqual({ x: 7, y: 8 });
  });

  it('survives a zero-length line', () => {
    const stationary = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    expect(pointAtDistance(stationary, 10).position).toEqual({ x: 5, y: 5 });
  });

  it('pointAtProgress is the normalized form', () => {
    expect(pointAtProgress(line, 0.5).position).toEqual(pointAtDistance(line, 100).position);
    expect(pointAtProgress(line, 2).progress).toBe(1);
  });
});

describe('editing controls', () => {
  it('moves one control and leaves the rest alone', () => {
    const moved = moveControl(SQUARE, 1, { x: 55, y: 66 });
    expect(moved[1]).toEqual({ x: 55, y: 66 });
    expect(moved[0]).toEqual(SQUARE[0]);
    expect(moved[3]).toEqual(SQUARE[3]);
  });

  it('ignores a move for an index that does not exist', () => {
    expect(moveControl(SQUARE, 99, { x: 1, y: 1 })).toEqual(SQUARE);
  });

  it('does not mutate the original', () => {
    moveControl(SQUARE, 1, { x: 55, y: 66 });
    expect(SQUARE[1]).toEqual({ x: 100, y: 0 });
  });

  it('inserts a control between two others', () => {
    const inserted = insertControl(SQUARE, 2, { x: 100, y: 50 });
    expect(inserted).toHaveLength(5);
    expect(inserted[2]).toEqual({ x: 100, y: 50 });
  });

  it('never inserts before the start or after the end', () => {
    expect(insertControl(SQUARE, 0, { x: 9, y: 9 })[0]).toEqual(SQUARE[0]);
    expect(insertControl(SQUARE, 99, { x: 9, y: 9 }).at(-1)).toEqual(SQUARE.at(-1));
  });

  it('removes a control', () => {
    const removed = removeControl(SQUARE, 1);
    expect(removed).toHaveLength(3);
    expect(removed[1]).toEqual(SQUARE[2]);
  });

  it('refuses to drop below two controls', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(removeControl(line, 0)).toHaveLength(MIN_CONTROLS);
  });

  it('ignores a removal for an index that does not exist', () => {
    expect(removeControl(SQUARE, 99)).toEqual(SQUARE);
  });
});

describe('nearestControlSegment', () => {
  it('finds the segment a point sits beside, and where on it', () => {
    const result = nearestControlSegment(SQUARE, { x: 50, y: 12 });
    // Between control 0 and 1, so a new control would be inserted at index 1.
    expect(result.index).toBe(1);
    expect(result.closest).toEqual({ x: 50, y: 0 });
    expect(result.distance).toBeCloseTo(12, 6);
  });

  it('picks the nearer of two candidate segments', () => {
    expect(nearestControlSegment(SQUARE, { x: 96, y: 50 }).index).toBe(2);
  });
});

describe('controlMidpoints', () => {
  it('gives one add-affordance per segment, with its insertion index', () => {
    const midpoints = controlMidpoints(SQUARE);
    expect(midpoints).toHaveLength(SQUARE.length - 1);
    expect(midpoints[0]).toEqual({ index: 1, point: { x: 50, y: 0 } });
    expect(midpoints[2]).toEqual({ index: 3, point: { x: 50, y: 100 } });
  });

  it('is empty for a single point', () => {
    expect(controlMidpoints([{ x: 0, y: 0 }])).toEqual([]);
  });
});

describe('simplifyToControls', () => {
  const dense: Point[] = Array.from({ length: 200 }, (_, index) => ({ x: index, y: index * 0.5 }));

  it('reduces a dense path to a handleable number of controls', () => {
    const controls = simplifyToControls(dense);
    expect(controls).toHaveLength(ROUTE_CONTROL_TARGET);
    expect(controls.length).toBeLessThanOrEqual(MAX_COMFORTABLE_CONTROLS);
  });

  it('keeps the endpoints exactly', () => {
    const controls = simplifyToControls(dense);
    expect(controls[0]).toEqual(dense[0]);
    expect(controls.at(-1)).toEqual(dense.at(-1));
  });

  it('leaves an already-sparse path alone', () => {
    expect(simplifyToControls(SQUARE)).toEqual(SQUARE);
  });

  it('preserves the shape closely enough to be an honest simplification', () => {
    const controls = simplifyToControls(dense);
    // Every original point stays near the simplified line.
    const line = expandCurve(controls, 'spline');
    for (const point of dense) {
      expect(nearestVertexDistance(line, point)).toBeLessThan(2);
    }
  });

  it('degrades to the two endpoints for a nonsense target', () => {
    expect(simplifyToControls(dense, 1)).toHaveLength(2);
  });
});
