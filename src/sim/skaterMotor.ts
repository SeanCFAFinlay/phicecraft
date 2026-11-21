import type { DrillEvent, PlaybackPlayerFrame, Player, Point, SkaterAction } from '@/core/types';
import { PLAYER_RADIUS } from '@/core/constants';
import { pointAndTangentAtDistance, sampleRouteMotion } from './routeCompiler';
import type { CompiledEvent, CompiledRoute } from './types';
import { constrainToRink } from './collision/rinkGeometry';

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function contactPhase(time: number, contact: number, before: number, after: number): number {
  return Math.max(0, Math.min(1, time <= contact
    ? 0.5 * (time - contact + before) / before
    : 0.5 + 0.5 * (time - contact) / after));
}

function actionNearEvent(event: DrillEvent, playerId: string, time: number, departure: number, arrival: number): { action: SkaterAction; phase: number } | null {
  const contact = event.type === 'pickup' ? arrival : departure;
  if (event.fromPlayerId === playerId && time >= contact - 0.4 && time <= contact + 0.4) {
    return {
      action: event.type === 'shot' ? 'shot' : event.type === 'pickup' ? 'recover' : 'pass',
      phase: contactPhase(time, contact, 0.4, 0.4),
    };
  }
  if (event.type === 'pass' && event.toPlayerId === playerId && time >= arrival - 0.3 && time <= arrival + 0.22) {
    return { action: 'receive', phase: contactPhase(time, arrival, 0.3, 0.22) };
  }
  return null;
}

export function getBladePosition(player: Player, position: Point, heading: number): Point {
  const handedness = player.visual?.handedness ?? (player.team === 'home' ? 'right' : 'left');
  const lateral = handedness === 'right' ? PLAYER_RADIUS * 0.5 : -PLAYER_RADIUS * 0.5;
  const forward = PLAYER_RADIUS * 1.38;
  return {
    x: position.x + Math.cos(heading) * forward - Math.sin(heading) * lateral,
    y: position.y + Math.sin(heading) * forward + Math.cos(heading) * lateral,
  };
}

export function sampleSkater(
  player: Player,
  route: CompiledRoute,
  timeSeconds: number,
  events: CompiledEvent[] = []
): PlaybackPlayerFrame {
  // Leg-aware: a route in timed legs stops between them, and each leg is
  // skated its own way (forward one leg, backward the next).
  const motion = sampleRouteMotion(route, timeSeconds);
  const backward = motion.mode === 'backward';
  const sampled = pointAndTangentAtDistance(route, motion.distance);
  const constrainedPosition = constrainToRink(sampled.position, PLAYER_RADIUS * 0.72).position;
  const pathHeading = Math.atan2(sampled.tangent.y, sampled.tangent.x);
  let heading = backward ? normalizeAngle(pathHeading + Math.PI) : pathHeading;
  // A player with nowhere to skate faces the net their team attacks, not
  // whichever way an empty route's tangent happens to point.
  if (route.totalLength <= 0) heading = player.team === 'away' ? Math.PI : 0;
  const beforeMotion = sampleRouteMotion(route, Math.max(0, timeSeconds - 1 / 120));
  const before = pointAndTangentAtDistance(route, beforeMotion.distance);
  const beforeHeading = Math.atan2(before.tangent.y, before.tangent.x) + (beforeMotion.mode === 'backward' ? Math.PI : 0);
  const angularVelocity = normalizeAngle(heading - beforeHeading) * 120;

  let action: SkaterAction = motion.phase === 'accelerate'
    ? 'stride'
    : motion.phase === 'cruise'
      ? motion.mode === 'glide' ? 'glide' : 'stride'
      : motion.phase === 'brake'
        ? 'stop'
        : motion.phase === 'finished' || motion.phase === 'idle'
          ? 'idle'
          : 'glide';

  if (Math.abs(angularVelocity) > 0.32 && motion.speed > 2) action = 'turn';
  let actionPhase: number | undefined;
  let faceToward: Point | null = null;
  for (const compiledEvent of events) {
    const eventAction = actionNearEvent(
      compiledEvent.source,
      player.id,
      timeSeconds,
      compiledEvent.departureSeconds,
      compiledEvent.arrivalSeconds
    );
    if (eventAction) {
      action = eventAction.action;
      actionPhase = eventAction.phase;
      // Passer and shooter face the target; a receiver faces the puck coming in.
      faceToward = eventAction.action === 'receive'
        ? compiledEvent.source.fromPoint
        : eventAction.action === 'recover'
          ? null
          : compiledEvent.source.toPoint;
    }
  }

  // Standing still, the body turns to the play: a pass is made facing the
  // receiver and a shot facing the net. Skating, the stride sets the heading.
  if (faceToward && motion.speed < 0.8) {
    const dx = faceToward.x - constrainedPosition.x;
    const dy = faceToward.y - constrainedPosition.y;
    if (dx * dx + dy * dy > 1) heading = Math.atan2(dy, dx);
  }

  const velocityDirection = backward
    ? { x: -Math.cos(heading), y: -Math.sin(heading) }
    : { x: Math.cos(heading), y: Math.sin(heading) };

  return {
    id: player.id,
    position: constrainedPosition,
    velocity: { x: velocityDirection.x * motion.speed, y: velocityDirection.y * motion.speed },
    heading,
    angularVelocity,
    speed: motion.speed,
    routeProgress: sampled.progress,
    stridePhase: (motion.distance / Math.max(PLAYER_RADIUS * 1.5, 1)) % 1,
    action,
    animationTimeSeconds: timeSeconds,
    ...(actionPhase === undefined ? {} : { actionPhase }),
    bladePosition: getBladePosition(player, constrainedPosition, heading),
  };
}
