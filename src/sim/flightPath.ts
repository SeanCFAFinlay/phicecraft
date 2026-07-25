// ============================================================================
// PUCK FLIGHT PATH
//
// The line the author draws for a pass, shot or dump IS the path the puck
// takes. Flight distance is measured along that curve, so bending a pass
// around a defender genuinely makes it travel further - and the event
// inspector's claim that "the displayed line is the exact puck trajectory" is
// now true rather than aspirational.
//
// Before this, `via` shaped only the drawing; the puck flew straight to the
// receiver's blade regardless.
// ============================================================================

import type { DrillEvent, Point } from '@/core/types';
import { expandCurve, pointAtDistance, polylineLength } from '@/utils/curves';

export interface FlightPath {
  /** The dense polyline the puck follows, endpoint to endpoint. */
  points: Point[];
  /** Its length in world units. */
  length: number;
}

/**
 * The control polygon for an event's flight: its release point, any authored
 * waypoints, and its destination.
 *
 * `from` and `to` are passed in rather than read off the event because both
 * are dynamic - a pass leaves the passer's blade at release and lands on the
 * receiver's blade at arrival, wherever their routes have taken them.
 */
export function flightControls(event: DrillEvent, from: Point, to: Point): Point[] {
  const waypoints = event.waypoints ?? [];
  return [from, ...waypoints.map(point => ({ ...point })), to];
}

/**
 * Expand an event's flight into the polyline the puck walks.
 *
 * Memoized per event object and endpoints: `samplePuck` asks for this on every
 * animation frame, and the answer only changes when the drill does.
 */
const cache = new WeakMap<DrillEvent, { from: Point; to: Point; flight: FlightPath }>();

export function getFlightPath(event: DrillEvent, from: Point, to: Point): FlightPath {
  const cached = cache.get(event);
  if (
    cached &&
    cached.from.x === from.x &&
    cached.from.y === from.y &&
    cached.to.x === to.x &&
    cached.to.y === to.y
  ) {
    return cached.flight;
  }

  const controls = flightControls(event, from, to);
  const points = expandCurve(controls, event.shape ?? 'spline');
  const flight: FlightPath = { points, length: polylineLength(points) };

  cache.set(event, { from: { ...from }, to: { ...to }, flight });
  return flight;
}

/** Where the puck is, and which way it is going, a fraction of the way through. */
export function puckAlongFlight(flight: FlightPath, progress: number) {
  return pointAtDistance(flight.points, flight.length * Math.max(0, Math.min(1, progress)));
}

/**
 * The length of a flight described by explicit endpoints and waypoints.
 *
 * Used by the command layer to re-time an event after its geometry is edited,
 * without needing a compiled drill.
 */
export function measureFlight(
  from: Point,
  waypoints: Point[],
  to: Point,
  shape: 'spline' | 'polyline' = 'spline'
): number {
  return polylineLength(expandCurve([from, ...waypoints, to], shape));
}
