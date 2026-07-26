import type { Drill, ID, PlaybackPlayerFrame, Point } from '@/core/types';
import { closestPointOnPolyline } from '@/utils/geometry';
import { compileDrill } from './compileDrill';
import { sampleMotionProfile } from './movementCurves';
import { solvePassInterception } from './passSolver';
import { sampleFrame } from './sampleFrame';
import { sampleSkater } from './skaterMotor';
import type { MotionProfile } from './types';

function timeAtDistance(profile: MotionProfile, requestedDistance: number): number {
  const target = Math.max(0, Math.min(profile.distance, requestedDistance));
  if (target <= 0 || profile.distance <= 0) return 0;
  const acceleration = profile.peakSpeed / Math.max(profile.accelerationTime, 0.0001);
  if (target <= profile.accelerationDistance) {
    return Math.sqrt((2 * target) / Math.max(acceleration, 0.0001));
  }

  const afterAcceleration = target - profile.accelerationDistance;
  if (afterAcceleration <= profile.cruiseDistance) {
    return profile.accelerationTime + afterAcceleration / Math.max(profile.peakSpeed, 0.0001);
  }

  const braking = profile.peakSpeed / Math.max(profile.brakingTime, 0.0001);
  const brakingDistance = afterAcceleration - profile.cruiseDistance;
  const discriminant = Math.max(0, profile.peakSpeed ** 2 - 2 * braking * brakingDistance);
  const brakingTime = (profile.peakSpeed - Math.sqrt(discriminant)) / Math.max(braking, 0.0001);
  return profile.accelerationTime + profile.cruiseTime + brakingTime;
}

export function getAuthoredReleaseProgress(drill: Drill, playerId: ID, point: Point): number {
  const compiled = compileDrill(drill);
  const route = compiled.routes.get(playerId);
  if (!route || route.totalLength <= 0) return 0;
  const closest = closestPointOnPolyline(route.points, point);
  const seconds = timeAtDistance(route.motion, closest.t * route.totalLength);
  return Math.max(0, Math.min(0.98, seconds / compiled.durationSeconds));
}

export function getAuthoredPlayerFrame(
  drill: Drill,
  playerId: ID,
  progress: number
): PlaybackPlayerFrame | null {
  const compiled = compileDrill(drill);
  const player = compiled.players.get(playerId);
  const route = compiled.routes.get(playerId);
  if (!player || !route) return null;
  return sampleSkater(
    player,
    route,
    Math.max(0, Math.min(1, progress)) * compiled.durationSeconds,
    compiled.events
  );
}

export function getAuthoredPlayerBlade(drill: Drill, playerId: ID, progress: number): Point | null {
  return getAuthoredPlayerFrame(drill, playerId, progress)?.bladePosition ?? null;
}

export function getAuthoredPassInterception(
  drill: Drill,
  from: Point,
  receiverId: ID,
  departureProgress: number
): { toPoint: Point; arrivalAt: number } | null {
  const compiled = compileDrill(drill);
  const receiver = compiled.players.get(receiverId);
  const route = compiled.routes.get(receiverId);
  if (!receiver || !route) return null;
  const departureSeconds = departureProgress * compiled.durationSeconds;
  const solved = solvePassInterception(
    from,
    departureSeconds,
    compiled.config.passSpeed,
    timeSeconds => sampleSkater(receiver, route, timeSeconds, compiled.events),
    compiled.durationSeconds * 0.98
  );
  return {
    toPoint: solved.point,
    arrivalAt: solved.arrivalSeconds / compiled.durationSeconds,
  };
}

/**
 * How a pass to each of several receivers would land, solved against ONE
 * compile of the drill.
 *
 * `getAuthoredPassInterception` compiles the drill per call, which is fine for
 * committing a single pass but not for scoring every eligible teammate while
 * the coach is choosing one. Same solver, same answers, one compile.
 */
export function predictPassInterceptions(
  drill: Drill,
  from: Point,
  departureProgress: number,
  receiverIds: ID[]
): Map<ID, { toPoint: Point; arrivalAt: number; leadDistance: number }> {
  const compiled = compileDrill(drill);
  const results = new Map<ID, { toPoint: Point; arrivalAt: number; leadDistance: number }>();
  const departureSeconds = departureProgress * compiled.durationSeconds;

  for (const receiverId of receiverIds) {
    const receiver = compiled.players.get(receiverId);
    const route = compiled.routes.get(receiverId);
    if (!receiver || !route) continue;

    const atDeparture = sampleSkater(receiver, route, departureSeconds, compiled.events);
    const solved = solvePassInterception(
      from,
      departureSeconds,
      compiled.config.passSpeed,
      timeSeconds => sampleSkater(receiver, route, timeSeconds, compiled.events),
      compiled.durationSeconds * 0.98
    );

    results.set(receiverId, {
      toPoint: solved.point,
      arrivalAt: solved.arrivalSeconds / compiled.durationSeconds,
      // How far the receiver has to travel between the puck leaving and the
      // puck arriving. A big lead is a pass that only works if they keep
      // skating, which is worth telling the coach before they commit.
      leadDistance: Math.hypot(
        solved.point.x - atDeparture.bladePosition.x,
        solved.point.y - atDeparture.bladePosition.y
      ),
    });
  }

  return results;
}

export function getAuthoredPuck(drill: Drill, progress: number) {
  const compiled = compileDrill(drill);
  return sampleFrame(compiled, progress * compiled.durationSeconds).puck;
}

/** Useful in tests and tuning tools that need the physical route clock. */
export function getRouteMotionAtProgress(drill: Drill, playerId: ID, progress: number) {
  const compiled = compileDrill(drill);
  const route = compiled.routes.get(playerId);
  return route
    ? sampleMotionProfile(route.motion, progress * compiled.durationSeconds)
    : null;
}
