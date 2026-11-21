import type { Player, Point, SkateLeg, SkatePath } from '@/core/types';
import { distance } from '@/utils/geometry';
import { expandCurve } from '@/utils/curves';
import { buildMotionProfile, sampleMotionProfile } from './movementCurves';
import { validateRoute } from './routeValidation';
import type { CompiledLeg, CompiledRoute, MechanicsConfig, MotionProfile } from './types';

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

function compileLegs(
  player: Player,
  path: SkatePath,
  config: MechanicsConfig
): { polyline: Polyline; legs: CompiledLeg[]; endSeconds: number } {
  const shape = path.shape ?? 'spline';
  const allPoints: Point[] = [];
  const legs: CompiledLeg[] = [];
  let cursor: Point = { x: player.x, y: player.y };
  let clock = 0;
  let offset = 0;

  for (const [index, leg] of (path.legs ?? []).entries()) {
    // Each leg begins where the player actually is: where the last one ended.
    const authored = samePoint(leg.points[0], cursor)
      ? leg.points.map(point => ({ ...point }))
      : [{ ...cursor }, ...leg.points.map(point => ({ ...point }))];
    const expanded = authored.length > 1 ? expandCurve(authored, shape) : authored;
    const { totalLength } = measure(expanded);
    const mode: SkateMode = leg.mode ?? 'skate';
    const motion = motionFor(totalLength, mode, leg.finish ?? path.finish, config);
    const requested = index === 0 ? leg.startAtSeconds ?? path.startAtSeconds ?? 0 : leg.startAtSeconds;
    const startAtSeconds = Math.max(requested, clock);

    for (const point of expanded) {
      const previous = allPoints[allPoints.length - 1];
      if (previous && samePoint(previous, point)) continue;
      allPoints.push(point);
    }
    legs.push({ startAtSeconds, distanceOffset: offset, length: totalLength, motion, mode });
    offset += totalLength;
    clock = startAtSeconds + motion.duration;
    cursor = expanded[expanded.length - 1];
  }

  return { polyline: measure(allPoints), legs, endSeconds: clock };
}

export function compileRoute(
  player: Player,
  path: SkatePath | null,
  config: MechanicsConfig
): CompiledRoute {
  if (path && legsMatchRoute(path)) {
    const { polyline, legs, endSeconds } = compileLegs(player, path, config);
    return {
      ownerId: player.id,
      source: path,
      ...polyline,
      durationSeconds: endSeconds,
      motion: motionFor(polyline.totalLength, path.mode ?? 'skate', path.finish, config),
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
  const motion = motionFor(polyline.totalLength, path?.mode ?? 'skate', path?.finish, config);

  return {
    ownerId: player.id,
    source: path,
    ...polyline,
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
    return { ...motion, mode: route.source?.mode ?? 'skate' };
  }

  let active = legs[0];
  for (const leg of legs) if (timeSeconds >= leg.startAtSeconds) active = leg;
  const local = sampleMotionProfile(active.motion, Math.max(0, timeSeconds - active.startAtSeconds));
  const phase = timeSeconds < active.startAtSeconds
    ? 'idle'
    : local.phase === 'finished' && active !== legs[legs.length - 1]
      ? 'idle'
      : local.phase;
  return {
    distance: active.distanceOffset + local.distance,
    speed: local.speed,
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
  if (!legs || legs.length === 0) {
    return (route.source?.startAtSeconds ?? 0) + timeAtProfileDistance(route.motion, requestedDistance);
  }
  let leg = legs[0];
  for (const candidate of legs) if (requestedDistance >= candidate.distanceOffset) leg = candidate;
  return leg.startAtSeconds + timeAtProfileDistance(leg.motion, requestedDistance - leg.distanceOffset);
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
