import { describe, it, expect } from 'vitest';
import {
  distance,
  midpoint,
  worldToScreen,
  screenToWorld,
  pointAtParameter,
  closestPointOnPolyline,
  decimatePath,
  smoothPath,
  processRawPath,
  clamp,
  lerp,
  pointInCircle,
} from './geometry';
import type { Camera, Point } from '@/core/types';

const line: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

describe('distance', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('is zero for the same point', () => {
    expect(distance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
});

describe('midpoint', () => {
  it('sits halfway between two points', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});

describe('screenToWorld / worldToScreen', () => {
  const camera: Camera = { x: 50, y: 20, zoom: 2 };

  it('round-trips a point', () => {
    const world = { x: 123, y: 456 };
    const screen = worldToScreen(world.x, world.y, camera);
    const back = screenToWorld(screen.x, screen.y, camera);
    expect(back.x).toBeCloseTo(world.x);
    expect(back.y).toBeCloseTo(world.y);
  });

  it('applies zoom then translation', () => {
    expect(worldToScreen(10, 10, camera)).toEqual({ x: 70, y: 40 });
  });
});

describe('pointAtParameter', () => {
  it('returns the ends at t=0 and t=1', () => {
    expect(pointAtParameter(line, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAtParameter(line, 1)).toEqual({ x: 100, y: 0 });
  });

  it('interpolates in between', () => {
    expect(pointAtParameter(line, 0.25).x).toBeCloseTo(25);
  });

  it('clamps out-of-range t', () => {
    expect(pointAtParameter(line, -1)).toEqual({ x: 0, y: 0 });
    expect(pointAtParameter(line, 2)).toEqual({ x: 100, y: 0 });
  });

  it('measures by arc length across uneven segments', () => {
    // Segments of length 10 and 90; halfway by length is x=50.
    const uneven = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 100, y: 0 }];
    expect(pointAtParameter(uneven, 0.5).x).toBeCloseTo(50);
  });

  it('survives degenerate input', () => {
    expect(pointAtParameter([], 0.5)).toEqual({ x: 0, y: 0 });
    expect(pointAtParameter([{ x: 5, y: 5 }], 0.5)).toEqual({ x: 5, y: 5 });
    // A zero-length path shouldn't divide by zero.
    expect(pointAtParameter([{ x: 5, y: 5 }, { x: 5, y: 5 }], 0.5)).toEqual({ x: 5, y: 5 });
  });
});

describe('closestPointOnPolyline', () => {
  it('projects a point onto the line', () => {
    const result = closestPointOnPolyline(line, { x: 50, y: 30 });
    expect(result.point.x).toBeCloseTo(50);
    expect(result.point.y).toBeCloseTo(0);
    expect(result.distance).toBeCloseTo(30);
    expect(result.t).toBeCloseTo(0.5);
  });

  it('clamps to the nearest endpoint when the target is past the end', () => {
    const result = closestPointOnPolyline(line, { x: 500, y: 0 });
    expect(result.point.x).toBeCloseTo(100);
    expect(result.distance).toBeCloseTo(400);
  });

  it('picks the nearest of several segments', () => {
    const bent = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const result = closestPointOnPolyline(bent, { x: 95, y: 50 });
    expect(result.point.x).toBeCloseTo(100);
    expect(result.point.y).toBeCloseTo(50);
  });

  it('handles empty and single-point input', () => {
    expect(closestPointOnPolyline([], { x: 0, y: 0 }).distance).toBe(Infinity);
    expect(closestPointOnPolyline([{ x: 3, y: 4 }], { x: 0, y: 0 }).distance).toBe(5);
  });
});

describe('decimatePath', () => {
  it('leaves a short path untouched', () => {
    expect(decimatePath(line, 50)).toBe(line);
  });

  it('reduces a long path while keeping both ends', () => {
    const long = Array.from({ length: 500 }, (_, i) => ({ x: i, y: 0 }));
    const result = decimatePath(long, 50);

    expect(result.length).toBeLessThanOrEqual(50);
    expect(result[0]).toEqual(long[0]);
    expect(result[result.length - 1]).toEqual(long[long.length - 1]);
  });
});

describe('smoothPath', () => {
  it('keeps the endpoints anchored', () => {
    const corner = [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }];
    const smoothed = smoothPath(corner, 2);

    expect(smoothed[0]).toEqual(corner[0]);
    expect(smoothed[smoothed.length - 1]).toEqual(corner[corner.length - 1]);
  });

  it('rounds off a sharp corner', () => {
    const corner = [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }];
    const smoothed = smoothPath(corner, 2);

    // No point should still reach the original apex.
    expect(Math.max(...smoothed.map(p => p.y))).toBeLessThan(50);
  });
});

describe('processRawPath', () => {
  it('turns a noisy drag into a bounded, smooth path', () => {
    const raw = Array.from({ length: 400 }, (_, i) => ({
      x: i,
      y: i % 2 === 0 ? 0 : 4, // jitter, as a real finger produces
    }));

    const result = processRawPath(raw);
    expect(result.length).toBeGreaterThan(2);
    expect(result.length).toBeLessThan(raw.length);
  });
});

describe('clamp', () => {
  it('bounds a value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('interpolates between two numbers', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });
});

describe('pointInCircle', () => {
  it('includes the boundary', () => {
    expect(pointInCircle({ x: 3, y: 4 }, { x: 0, y: 0 }, 5)).toBe(true);
    expect(pointInCircle({ x: 3, y: 4 }, { x: 0, y: 0 }, 4.9)).toBe(false);
  });
});
