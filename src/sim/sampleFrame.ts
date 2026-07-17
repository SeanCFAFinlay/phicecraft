import type { AnimatedPuck, ID, PassEvent, PlaybackPlayerFrame, Point, ShotEvent } from '@/core/types';
import { distance } from '@/utils/geometry';
import { evaluateReception } from './receptionSolver';
import { sampleSkater } from './skaterMotor';
import { solveLoosePuck } from './puckSolver';
import { resolveShotResult, shotVelocity } from './shotSolver';
import { drillOutcome } from './scoring';
import { chooseNearestPursuer } from './pursuitSolver';
import { canCollectPuck } from './pickupSolver';
import type { CompiledDrill, CompiledEvent, SimulationFrame } from './types';

function playerFrameAt(compiled: CompiledDrill, id: ID, timeSeconds: number): PlaybackPlayerFrame | null {
  const player = compiled.players.get(id);
  const route = compiled.routes.get(id);
  return player && route ? sampleSkater(player, route, timeSeconds, compiled.events) : null;
}

export function getCompiledEventEndpoints(compiled: CompiledDrill, event: CompiledEvent): { from: Point; to: Point } {
  const sourceFrame = playerFrameAt(compiled, event.source.fromPlayerId, event.departureSeconds);
  const receiverFrame = event.source.type === 'pass'
    ? playerFrameAt(compiled, event.source.toPlayerId, event.arrivalSeconds)
    : null;
  return {
    from: sourceFrame?.bladePosition ?? event.source.fromPoint,
    to: receiverFrame?.bladePosition ?? event.source.toPoint,
  };
}

function looseAfterEvent(
  compiled: CompiledDrill,
  event: CompiledEvent,
  from: Point,
  to: Point,
  timeSeconds: number,
  speed: number,
  reverse = false
): AnimatedPuck {
  const dx = (reverse ? from.x : to.x + (to.x - from.x)) - to.x;
  const dy = (reverse ? from.y : to.y + (to.y - from.y)) - to.y;
  const length = Math.hypot(dx, dy) || 1;
  const motion = solveLoosePuck(
    to,
    { x: (dx / length) * speed, y: (dy / length) * speed },
    Math.max(0, timeSeconds - event.arrivalSeconds),
    compiled.config
  );
  return {
    ...motion.position,
    visible: true,
    state: 'loose',
    velocity: motion.velocity,
  };
}

function autoCollectLoosePuck(
  compiled: CompiledDrill,
  frames: Record<ID, PlaybackPlayerFrame>,
  event: CompiledEvent,
  loose: AnimatedPuck
): AnimatedPuck {
  if (compiled.config.recovery !== 'nearest-teammate') return loose;
  const teammateIds = compiled.source.players
    .filter(player => player.team === event.source.team)
    .map(player => player.id);
  const pursuerId = chooseNearestPursuer(frames, teammateIds, loose);
  const pursuer = pursuerId ? frames[pursuerId] : null;
  if (!pursuer || !canCollectPuck(pursuer, loose, compiled.config.pickupRadius)) return loose;
  return {
    ...pursuer.bladePosition,
    visible: true,
    state: 'possessed',
    carrierId: pursuer.id,
    velocity: pursuer.velocity,
    result: 'caught',
  };
}

function samplePuck(
  compiled: CompiledDrill,
  frames: Record<ID, PlaybackPlayerFrame>,
  timeSeconds: number
): AnimatedPuck | null {
  const initialCarrier = compiled.source.players.find(player => player.hasPuck);
  const fired = compiled.events.filter(event => event.departureSeconds <= timeSeconds + 1e-9);
  if (fired.length === 0) {
    const carrierFrame = initialCarrier ? frames[initialCarrier.id] : null;
    return carrierFrame
      ? { ...carrierFrame.bladePosition, visible: true, state: 'possessed', carrierId: initialCarrier?.id }
      : null;
  }

  const event = fired[fired.length - 1];
  const { from, to } = getCompiledEventEndpoints(compiled, event);
  const duration = Math.max(0.001, event.arrivalSeconds - event.departureSeconds);
  const t = Math.max(0, Math.min(1, (timeSeconds - event.departureSeconds) / duration));
  const velocity = { x: (to.x - from.x) / duration, y: (to.y - from.y) / duration };

  if (t < 1) {
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      visible: true,
      state: event.source.type === 'shot' ? 'shot' : event.source.type === 'pickup' ? 'loose' : 'in_flight',
      intendedReceiverId: event.source.type === 'pass' ? event.source.toPlayerId : undefined,
      velocity,
    };
  }

  if (event.source.type === 'pickup') {
    const frame = frames[event.source.fromPlayerId];
    return frame ? { ...frame.bladePosition, visible: true, state: 'possessed', carrierId: frame.id } : null;
  }

  if (event.source.type === 'dump') {
    return autoCollectLoosePuck(
      compiled,
      frames,
      event,
      looseAfterEvent(compiled, event, from, to, timeSeconds, compiled.config.passSpeed * 0.75)
    );
  }

  if (event.source.type === 'pass') {
    const receiver = frames[event.source.toPlayerId];
    if (!receiver) return looseAfterEvent(compiled, event, from, to, timeSeconds, compiled.config.passSpeed);
    // Reception is resolved exactly once at arrival. After a catch, the puck
    // follows the receiver instead of being re-tested as the skater moves on.
    const receiverAtArrival = playerFrameAt(compiled, event.source.toPlayerId, event.arrivalSeconds) ?? receiver;
    const evaluation = evaluateReception(event.source as PassEvent, to, velocity, receiverAtArrival, compiled.config);
    if (!evaluation.caught) {
      return autoCollectLoosePuck(compiled, frames, event, {
        ...looseAfterEvent(compiled, event, from, to, timeSeconds, Math.max(30, Math.hypot(velocity.x, velocity.y) * 0.55)),
        intendedReceiverId: event.source.toPlayerId,
        result: 'missed',
      });
    }
    return {
      ...receiver.bladePosition,
      visible: true,
      state: 'possessed',
      carrierId: receiver.id,
      velocity: receiver.velocity,
      result: 'caught',
    };
  }

  const shot = event.source as ShotEvent;
  const result = resolveShotResult(shot, compiled.config);
  if (result === 'rebound' || result === 'post') {
    return autoCollectLoosePuck(compiled, frames, event, {
      ...looseAfterEvent(compiled, event, from, to, timeSeconds, compiled.config.shotSpeed * 0.42, true),
      result,
    });
  }
  if (result === 'wide') {
    return autoCollectLoosePuck(compiled, frames, event, {
      ...looseAfterEvent(compiled, event, from, to, timeSeconds, compiled.config.shotSpeed * 0.5), result,
    });
  }
  if (result === 'save') {
    return { ...to, visible: true, state: 'dead', velocity: { x: 0, y: 0 }, result };
  }
  return { ...to, visible: true, state: 'dead', velocity: shotVelocity(from, to, compiled.config.shotSpeed), result: 'goal' };
}

export function sampleFrame(compiled: CompiledDrill, requestedTimeSeconds: number): SimulationFrame {
  const timeSeconds = Math.max(0, Math.min(compiled.durationSeconds, requestedTimeSeconds));
  const players: Record<ID, PlaybackPlayerFrame> = {};
  for (const [id, player] of compiled.players) {
    const route = compiled.routes.get(id);
    if (route) players[id] = sampleSkater(player, route, timeSeconds, compiled.events);
  }
  const puck = samplePuck(compiled, players, timeSeconds);
  const firedEventIndices = compiled.events
    .filter(event => event.departureSeconds <= timeSeconds + 1e-9)
    .map(event => event.index);
  const terminal = timeSeconds >= compiled.durationSeconds - 1e-9;
  const outcome = terminal ? drillOutcome(compiled.events) : null;
  const lifecycle = !terminal ? (timeSeconds <= 0 ? 'ready' : 'active') : outcome ?? 'review';

  return {
    timeSeconds,
    progress: compiled.durationSeconds > 0 ? timeSeconds / compiled.durationSeconds : 0,
    durationSeconds: compiled.durationSeconds,
    lifecycle,
    players,
    puck,
    firedEventIndices,
  };
}

export function distanceBetweenPuckAndBlade(puck: AnimatedPuck, frame: PlaybackPlayerFrame): number {
  return distance(puck, frame.bladePosition);
}
