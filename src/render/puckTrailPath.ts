// ============================================================================
// PUCK TRAIL PATH
//
// A fading streak behind a passed or shot puck, so the eye can follow it.
// This works out WHERE the streak goes; each flat renderer (WebGL and the
// Canvas2D fallback) draws it the same way. The 3D board has its own
// velocity-based streak (render3d/scene/puckTrail.ts).
//
// The streak is traced back along the flight line of the pass or shot the
// puck is on (curved passes included), never past where it left the stick.
// It is a pure function of the frame, so a scrubbed frame shows the same
// trail as a played one.
// ============================================================================

import type { AnimatedPuck, DrillEvent, Point } from '@/core/types';
import { eventFlightLine } from '@/canvas/PathRenderer';

/** Longest trail, in world units (about a third of a zone). */
export const PUCK_TRAIL_LENGTH = 90;
export const PUCK_TRAIL_SEGMENTS = 12;

export interface PuckTrailSegment {
  from: Point;
  to: Point;
  /** 1 at the puck, falling towards the tail. */
  fade: number;
}

export interface PuckTrailPath {
  /** Pass yellow or shot orange. */
  color: number;
  segments: PuckTrailSegment[];
}

/** Nearest point on a polyline: the segment it falls in and how far away it is. */
function nearestOnLine(line: Point[], p: Point): { index: number; point: Point; distance: number } {
  let best = { index: 0, point: line[0], distance: Infinity };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    const point = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = Math.hypot(point.x - p.x, point.y - p.y);
    if (distance < best.distance) best = { index: i, point, distance };
  }
  return best;
}

export function puckTrailPath(puck: AnimatedPuck | null, events: DrillEvent[]): PuckTrailPath | null {
  if (!puck?.visible) return null;
  if (puck.state !== 'in_flight' && puck.state !== 'shot') return null;

  let line: Point[] | null = null;
  let nearest: ReturnType<typeof nearestOnLine> | null = null;
  for (const event of events) {
    if (event.type !== 'pass' && event.type !== 'shot') continue;
    const candidate = eventFlightLine(event);
    if (candidate.length < 2) continue;
    const hit = nearestOnLine(candidate, puck);
    if (!nearest || hit.distance < nearest.distance) {
      nearest = hit;
      line = candidate;
    }
  }
  if (!line || !nearest || nearest.distance > 10) return null;

  // Walk back from the puck towards the stick it left.
  const trail: Point[] = [{ x: puck.x, y: puck.y }, nearest.point];
  let remaining = PUCK_TRAIL_LENGTH - Math.hypot(nearest.point.x - puck.x, nearest.point.y - puck.y);
  for (let i = nearest.index - 1; i >= 0 && remaining > 0; i--) {
    const from = trail[trail.length - 1];
    const to = line[i];
    const step = Math.hypot(to.x - from.x, to.y - from.y);
    if (step <= remaining) {
      trail.push(to);
      remaining -= step;
    } else {
      const t = remaining / step;
      trail.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      remaining = 0;
    }
  }
  const lengths = [0];
  for (let i = 1; i < trail.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y));
  }
  const total = lengths[lengths.length - 1];
  if (total < 2) return null;

  const at = (distance: number): Point => {
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < distance) i++;
    const span = lengths[i] - lengths[i - 1];
    const t = span < 1e-9 ? 0 : (distance - lengths[i - 1]) / span;
    return { x: trail[i - 1].x + (trail[i].x - trail[i - 1].x) * t, y: trail[i - 1].y + (trail[i].y - trail[i - 1].y) * t };
  };
  const segments: PuckTrailSegment[] = [];
  for (let k = 0; k < PUCK_TRAIL_SEGMENTS; k++) {
    segments.push({
      from: at((k / PUCK_TRAIL_SEGMENTS) * total),
      to: at(((k + 1) / PUCK_TRAIL_SEGMENTS) * total),
      fade: 1 - k / PUCK_TRAIL_SEGMENTS,
    });
  }
  return { color: puck.state === 'shot' ? 0xff6b0f : 0xffd60a, segments };
}

/** Shared look: alpha and width for a segment at a given fade. */
export function puckTrailStroke(fade: number): { alpha: number; width: number } {
  return { alpha: 0.5 * fade * fade, width: 1.5 + 4.5 * fade };
}
