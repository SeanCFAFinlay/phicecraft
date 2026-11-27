import type { Player, Point, SkateLeg, SkatePath } from '@/core/types';
import { FT } from '@/core/constants';
import { distance } from '@/utils/geometry';
import { expandCurve } from '@/utils/curves';
import { buildMotionProfile, sampleMotionProfile } from './movementCurves';
import { validateRoute } from './routeValidation';
import type { CompiledLeg, CompiledRoute, MechanicsConfig, MotionProfile, TurnWarp } from './types';

type SkateMode = 'skate' | 'glide' | 'backward';

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

/** Legs joined end to end, the shared seam point stored once. */
function joinLegPoints(legs: SkateLeg[]): Point[] {
  const joined: Point[] = [];
  for (const leg of legs) {
    for (const point of leg.points) {
      const previous = joined[joined.length - 1];
      if (previous && samePoint(previous, point)) continue;
      joined.push(point);
    }
  }
  return joined;
}

/**
 * Whether the legs still describe this route. A coach who redraws or drags a
 * route edits `points`; the legs were not edited with it, so from then on the
 * route plays as the one continuous skate they drew.
 */
function legsMatchRoute(path: SkatePath): boolean {
  const legs = path.legs;
  if (!legs || legs.length < 2) return false;
  const joined = joinLegPoints(legs);
  return joined.length === path.points.length && joined.every((point, index) => samePoint(point, path.points[index]));
}

function motionFor(length: number, mode: SkateMode, finish: SkatePath['finish'], config: MechanicsConfig): MotionProfile {
  const maxSpeed = mode === 'backward' ? config.maxBackwardSpeed : config.maxForwardSpeed;
  const braking = finish === 'coast' ? config.acceleration : config.braking;
  return buildMotionProfile(length, maxSpeed, config.acceleration, braking);
}

interface Polyline {
  points: Point[];
  segmentLengths: number[];
  cumulativeLengths: number[];
  totalLength: number;
}

function measure(points: Point[]): Polyline {
  const segmentLengths: number[] = [];
  const cumulativeLengths = [0];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const length = distance(points[index], points[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
    cumulativeLengths.push(totalLength);
  }
  return { points, segmentLengths, cumulativeLengths, totalLength };
}

// ----------------------------------------------------------------------------
// Slowing down through turns
//
// A skater cannot carry full speed through a tight turn. Each stretch of route
// is skated at a fraction of the speed it would get on a straight:
//
//   factor = 1 - 0.35 * min(1, turn / pi)
//
// where `turn` is how far the heading swings within TURN_REACH either side.
// A full U-turn runs at 65%, a square corner at about 82%, and a wide sweep
// barely slows at all.
//
// The motion profile is built over "straight-line equivalent" distance: each
// stretch counts as length / factor. Mapping that back to real distance
// slows the skater exactly where the route bends.
// ----------------------------------------------------------------------------

const TURN_SLOWDOWN = 0.35;
/** The heading change is measured over this far either side of each stretch. */
const TURN_REACH = 8 * FT;

function headingOf(points: Point[], index: number): number {
  return Math.atan2(points[index + 1].y - points[index].y, points[index + 1].x - points[index].x);
}

function turnDelta(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
}

/** The warp is sampled at least this often along the route. */
const WARP_STEP = 1 * FT;

function upperBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Real and straight-line-equivalent distance, sampled about every foot along
 * the route, or undefined for a route with no turn worth slowing for.
 */
function turnWarp(polyline: Polyline, breaks: number[] = []): TurnWarp | undefined {
  const { points, segmentLengths, cumulativeLengths } = polyline;
  const segments = segmentLengths.length;
  if (segments < 2) return undefined;
  const headings = segmentLengths.map((_, index) => headingOf(points, index));
  // Where each turn happens along the route, and how sharp it is. A seam
  // between legs is a stop, not a turn: the skater stopped and set off again.
  const turnAt: number[] = [];
  const turnSum = [0];
  for (let vertex = 1; vertex < segments; vertex++) {
    if (segmentLengths[vertex - 1] <= 1e-6 || segmentLengths[vertex] <= 1e-6) continue;
    if (breaks.some(seam => Math.abs(seam - cumulativeLengths[vertex]) < 1e-6)) continue;
    const turn = turnDelta(headings[vertex - 1], headings[vertex]);
    if (turn < 1e-4) continue;
    turnAt.push(cumulativeLengths[vertex]);
    turnSum.push(turnSum[turnSum.length - 1] + turn);
  }
  if (turnAt.length === 0) return undefined;
  // Total heading change within TURN_REACH of a point on the route.
  const turnNear = (at: number) => turnSum[upperBound(turnAt, at + TURN_REACH)] - turnSum[upperBound(turnAt, at - TURN_REACH - 1e-9)];

  const actual = [0];
  const nominal = [0];
  let slowed = false;
  for (let segment = 0; segment < segments; segment++) {
    const length = segmentLengths[segment];
    if (length <= 1e-9) continue;
    const steps = Math.max(1, Math.ceil(length / WARP_STEP));
    for (let step = 0; step < steps; step++) {
      const from = cumulativeLengths[segment] + (length * step) / steps;
      const to = cumulativeLengths[segment] + (length * (step + 1)) / steps;
      const factor = 1 - TURN_SLOWDOWN * Math.min(1, turnNear((from + to) / 2) / Math.PI);
      if (factor < 0.999) slowed = true;
      actual.push(to);
      nominal.push(nominal[nominal.length - 1] + (to - from) / factor);
    }
  }
  return slowed ? { actual, nominal } : undefined;
}

/** Map a distance through one column of the warp table to the other, with the slope there. */
function throughWarp(from: number[], to: number[], value: number): { value: number; slope: number } {
  const last = from.length - 1;
  if (value <= 0) return { value: 0, slope: (to[1] - to[0]) / Math.max(1e-9, from[1] - from[0]) };
  if (value >= from[last]) return { value: to[last] + (value - from[last]), slope: 1 };
  const index = Math.min(last, Math.max(1, upperBound(from, value))) - 1;
  const span = from[index + 1] - from[index];
  const slope = span > 1e-12 ? (to[index + 1] - to[index]) / span : 1;
  return { value: to[index] + (value - from[index]) * slope, slope };
}

/** Straight-line-equivalent distance at a real distance along the route. */
export function nominalDistance(route: Pick<CompiledRoute, 'turnWarp'>, actual: number): number {
  return route.turnWarp ? throughWarp(route.turnWarp.actual, route.turnWarp.nominal, actual).value : actual;
}

/** Real distance along the route for a straight-line-equivalent distance, and the speed factor there. */
function actualDistance(route: CompiledRoute, requested: number): { distance: number; factor: number } {
  if (!route.turnWarp) return { distance: requested, factor: 1 };
  const mapped = throughWarp(route.turnWarp.nominal, route.turnWarp.actual, requested);
  return { distance: Math.min(route.totalLength, mapped.value), factor: requested >= route.turnWarp.nominal[route.turnWarp.nominal.length - 1] ? 1 : mapped.slope };
}

function compileLegs(
  player: Player,
  path: SkatePath,
  config: MechanicsConfig
): { polyline: Polyline; turnWarp: TurnWarp | undefined; legs: CompiledLeg[]; endSeconds: number } {
  const shape = path.shape ?? 'spline';
  const allPoints: Point[] = [];
  const pieces: { length: number; offset: number; mode: SkateMode; finish: SkatePath['finish']; requested: number }[] = [];
  let cursor: Point = { x: player.x, y: player.y };
  let offset = 0;

  for (const [index, leg] of (path.legs ?? []).entries()) {
    // Each leg begins where the player actually is: where the last one ended.
    const authored = samePoint(leg.points[0], cursor)
      ? leg.points.map(point => ({ ...point }))
      : [{ ...cursor }, ...leg.points.map(point => ({ ...point }))];
    const expanded = authored.length > 1 ? expandCurve(authored, shape) : authored;
    const { totalLength } = measure(expanded);
    for (const point of expanded) {
      const previous = allPoints[allPoints.length - 1];
      if (previous && samePoint(previous, point)) continue;
      allPoints.push(point);
    }
    pieces.push({
      length: totalLength,
      offset,
      mode: leg.mode ?? 'skate',
      finish: leg.finish ?? path.finish,
      requested: index === 0 ? leg.startAtSeconds ?? path.startAtSeconds ?? 0 : leg.startAtSeconds,
    });
    offset += totalLength;
    cursor = expanded[expanded.length - 1];
  }

  const polyline = measure(allPoints);
  const warp = { turnWarp: turnWarp(polyline, pieces.slice(1).map(piece => piece.offset)) };
  const legs: CompiledLeg[] = [];
  let clock = 0;
  for (const piece of pieces) {
    const nominalOffset = nominalDistance(warp, piece.offset);
    const nominalLength = nominalDistance(warp, piece.offset + piece.length) - nominalOffset;
    const motion = motionFor(nominalLength, piece.mode, piece.finish, config);
    const startAtSeconds = Math.max(piece.requested, clock);
    legs.push({ startAtSeconds, distanceOffset: piece.offset, nominalOffset, length: piece.length, motion, mode: piece.mode });
    clock = startAtSeconds + motion.duration;
  }

  return { polyline, turnWarp: warp.turnWarp, legs, endSeconds: clock };
}

export function compileRoute(
  player: Player,
  path: SkatePath | null,
  config: MechanicsConfig
): CompiledRoute {
  if (path && legsMatchRoute(path)) {
    const { polyline, turnWarp: warp, legs, endSeconds } = compileLegs(player, path, config);
    const nominalTotal = nominalDistance({ turnWarp: warp }, polyline.totalLength);
    return {
      ownerId: player.id,
      source: path,
      ...polyline,
      ...(warp ? { turnWarp: warp } : {}),
      durationSeconds: endSeconds,
      motion: motionFor(nominalTotal, path.mode ?? 'skate', path.finish, config),
      warnings: validateRoute(path.points),
      legs,
    };
  }

  const pathPoints = path?.points?.length ? path.points : [{ x: player.x, y: player.y }];
  const authoredPoints = pathPoints[0].x === player.x && pathPoints[0].y === player.y
    ? pathPoints.map(point => ({ ...point }))
    : [{ x: player.x, y: player.y }, ...pathPoints.map(point => ({ ...point }))];
  // The authored points are a CONTROL POLYGON, expanded through the route's
  // shape. Previously every route was Chaikin-smoothed unconditionally, so a
  // polyline with deliberate sharp corners was impossible to author - the
  // simulation rounded every pivot no matter what was drawn.
  const polyline = measure(expandCurve(authoredPoints, path?.shape ?? 'spline'));
  const warp = turnWarp(polyline);
  const nominalTotal = nominalDistance({ turnWarp: warp }, polyline.totalLength);
  const motion = motionFor(nominalTotal, path?.mode ?? 'skate', path?.finish, config);

  return {
    ownerId: player.id,
    source: path,
    ...polyline,
    ...(warp ? { turnWarp: warp } : {}),
    durationSeconds: motion.duration + (path?.startAtSeconds ?? 0),
    motion,
    warnings: validateRoute(authoredPoints),
  };
}

export interface RouteMotionSample {
  /** Distance along the whole route. */
  distance: number;
  speed: number;
  phase: 'idle' | 'accelerate' | 'cruise' | 'brake' | 'finished';
  mode: SkateMode;
}

/**
 * Where along its route a skater is at `timeSeconds`, and how they are moving.
 * A route in legs holds the player still between them: they stopped, and go
 * again when the next leg starts.
 */
export function sampleRouteMotion(route: CompiledRoute, timeSeconds: number): RouteMotionSample {
  const legs = route.legs;
  if (!legs || legs.length === 0) {
    const motion = sampleMotionProfile(route.motion, Math.max(0, timeSeconds - (route.source?.startAtSeconds ?? 0)));
    const actual = actualDistance(route, motion.distance);
    return { ...motion, distance: actual.distance, speed: motion.speed * actual.factor, mode: route.source?.mode ?? 'skate' };
  }

  let active = legs[0];
  for (const leg of legs) if (timeSeconds >= leg.startAtSeconds) active = leg;
  const local = sampleMotionProfile(active.motion, Math.max(0, timeSeconds - active.startAtSeconds));
  const phase = timeSeconds < active.startAtSeconds
    ? 'idle'
    : local.phase === 'finished' && active !== legs[legs.length - 1]
      ? 'idle'
      : local.phase;
  const nominalOffset = active.nominalOffset ?? active.distanceOffset;
  const actual = actualDistance(route, nominalOffset + local.distance);
  // Never past the end of the active leg, whatever rounding the warp does.
  const distance = Math.min(active.distanceOffset + active.length, Math.max(active.distanceOffset, actual.distance));
  return {
    distance,
    speed: local.speed * actual.factor,
    phase,
    mode: active.mode,
  };
}

function timeAtProfileDistance(profile: MotionProfile, requestedDistance: number): number {
  const d = Math.max(0, Math.min(profile.distance, requestedDistance));
  if (profile.distance <= 0) return 0;
  if (d <= profile.accelerationDistance) {
    const acceleration = profile.peakSpeed / Math.max(profile.accelerationTime, 0.0001);
    return Math.sqrt((2 * d) / Math.max(acceleration, 0.0001));
  }
  if (d <= profile.accelerationDistance + profile.cruiseDistance) {
    return profile.accelerationTime + (d - profile.accelerationDistance) / Math.max(profile.peakSpeed, 0.0001);
  }
  const braking = profile.peakSpeed / Math.max(profile.brakingTime, 0.0001);
  const brakingDistance = d - profile.accelerationDistance - profile.cruiseDistance;
  const discriminant = Math.max(0, profile.peakSpeed ** 2 - 2 * braking * brakingDistance);
  return profile.accelerationTime + profile.cruiseTime + (profile.peakSpeed - Math.sqrt(discriminant)) / Math.max(braking, 0.0001);
}

/** Drill seconds at which a skater first reaches `distance` along their route. */
export function timeAtRouteDistance(route: CompiledRoute, requestedDistance: number): number {
  const legs = route.legs;
  const nominal = nominalDistance(route, requestedDistance);
  if (!legs || legs.length === 0) {
    return (route.source?.startAtSeconds ?? 0) + timeAtProfileDistance(route.motion, nominal);
  }
  let leg = legs[0];
  for (const candidate of legs) if (requestedDistance >= candidate.distanceOffset) leg = candidate;
  return leg.startAtSeconds + timeAtProfileDistance(leg.motion, nominal - (leg.nominalOffset ?? leg.distanceOffset));
}

export function pointAndTangentAtDistance(
  route: CompiledRoute,
  requestedDistance: number
): { position: Point; tangent: Point; progress: number } {
  if (route.totalLength <= 0 || route.points.length < 2) {
    return { position: { ...route.points[0] }, tangent: { x: 1, y: 0 }, progress: 0 };
  }

  const target = Math.max(0, Math.min(route.totalLength, requestedDistance));
  let segmentIndex = route.segmentLengths.length - 1;
  for (let index = 0; index < route.segmentLengths.length; index++) {
    if (target <= route.cumulativeLengths[index + 1] + 1e-6) {
      segmentIndex = index;
      break;
    }
  }

  const start = route.points[segmentIndex];
  const end = route.points[segmentIndex + 1];
  const length = Math.max(route.segmentLengths[segmentIndex], 0.0001);
  const local = Math.max(0, Math.min(1, (target - route.cumulativeLengths[segmentIndex]) / length));
  return {
    position: {
      x: start.x + (end.x - start.x) * local,
      y: start.y + (end.y - start.y) * local,
    },
    tangent: { x: (end.x - start.x) / length, y: (end.y - start.y) / length },
    progress: target / route.totalLength,
  };
}
