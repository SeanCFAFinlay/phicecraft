// ============================================================================
// DASHED LINE — CPU dash tessellation for Pixi
//
// Pixi Graphics has no `setLineDash` equivalent, unlike Canvas 2D. Every
// dashed stroke on the Canvas2D path (skate paths, the transient route being
// drawn, drag previews, edit-handle guide lines) starts from an already
// EXPANDED polyline - the same dense points `expandCurve` produces
// (PathRenderer.ts) - and hands it straight to `ctx.setLineDash([dash, gap])`.
//
// This walks that same dense polyline by arc length and cuts it into
// alternating "on"/"off" sub-polylines, always starting "on" at distance 0 -
// exactly what `ctx.setLineDash` does with its default zero dash offset (no
// caller in this codebase sets one). A Pixi Graphics then strokes only the
// "on" segments (`polylineOf`) to reproduce the same visual pattern.
//
// Deliberately geometry-only: no Pixi import here, so this is unit-tested as
// plain arithmetic (dashedLine.test.ts), not a DOM/Pixi test.
// ============================================================================

import type { Point } from '@/core/types';

export interface DashPattern {
  readonly dash: number;
  readonly gap: number;
}

export interface DashSegment {
  /** Whether this segment should be stroked ("on") or skipped ("gap"). */
  on: boolean;
  /** At least two points, a sub-polyline of the source line. */
  points: Point[];
}

function clonePoint(p: Point): Point {
  return { x: p.x, y: p.y };
}

/** Cumulative arc length at each point, `cumulative[0] === 0`. */
function cumulativeLengths(points: Point[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return cumulative;
}

/**
 * The sub-polyline of `points` between arc distances `d0` and `d1`
 * (inclusive), following every vertex in between rather than a straight
 * shortcut - so a dash that spans a bend still bends with the source line.
 */
function sliceByDistance(points: Point[], cumulative: number[], d0: number, d1: number): Point[] {
  const interpolateAt = (d: number): Point => {
    for (let i = 1; i < cumulative.length; i++) {
      if (cumulative[i] >= d - 1e-9) {
        const segLen = cumulative[i] - cumulative[i - 1];
        const t = segLen > 1e-12 ? (d - cumulative[i - 1]) / segLen : 0;
        const a = points[i - 1];
        const b = points[i];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    return clonePoint(points[points.length - 1]);
  };

  const result: Point[] = [interpolateAt(d0)];
  for (let i = 1; i < points.length - 1; i++) {
    if (cumulative[i] > d0 + 1e-9 && cumulative[i] < d1 - 1e-9) {
      result.push(clonePoint(points[i]));
    }
  }
  result.push(interpolateAt(d1));
  return result;
}

/**
 * Splits a dense polyline into alternating "on"/"off" sub-polylines per a
 * repeating `[dash, gap]` pattern (world units), covering the ENTIRE source
 * line - concatenating every returned segment's own length reconstructs the
 * source polyline's total length exactly (the parity property the unit tests
 * check), which is what lets a caller draw only the "on" ones with total
 * confidence nothing was silently dropped or duplicated.
 *
 * Always starts "on" at distance 0, matching every caller in this codebase
 * (none sets a Canvas dash offset).
 */
export function dashPolyline(points: Point[], pattern: DashPattern): DashSegment[] {
  if (points.length < 2) return [];

  const cumulative = cumulativeLengths(points);
  const total = cumulative[cumulative.length - 1];
  if (total <= 1e-9) return [];

  if (pattern.dash <= 0) {
    return [{ on: true, points: points.map(clonePoint) }];
  }

  const segments: DashSegment[] = [];
  let cursor = 0;
  let on = true;
  while (cursor < total - 1e-9) {
    const span = on ? pattern.dash : Math.max(0, pattern.gap);
    const next = span > 0 ? Math.min(total, cursor + span) : total;
    segments.push({ on, points: sliceByDistance(points, cumulative, cursor, next) });
    cursor = next;
    on = !on;
    // A non-positive gap would otherwise spin forever re-emitting a
    // zero-length "off" segment at the same cursor position.
    if (span <= 0 && !on) break;
  }
  return segments;
}

/** Just the polylines a caller should actually stroke - the "on" dashes. */
export function polylineOf(points: Point[], pattern: DashPattern): Point[][] {
  return dashPolyline(points, pattern)
    .filter(segment => segment.on)
    .map(segment => segment.points);
}
