import type {
  AnimatedPuck,
  ID,
  PassEvent,
  PlaybackPlayerFrame,
  Point,
  ShotEvent,
} from '@/core/types';
import { RINK } from '@/core/constants';
import { distance } from '@/utils/geometry';
import { evaluateReception } from './receptionSolver';
import { contactPhase, getBladePosition, lerpAngle, sampleSkater, strideWeight } from './skaterMotor';
import { sampleGoalie } from './goalieSolver';
import { solveLoosePuck } from './puckSolver';
import { getFlightPath, puckAlongFlight } from './flightPath';
import { resolveShotResult, shotVelocity } from './shotSolver';
import { chooseNearestPursuer } from './pursuitSolver';
import { canCollectPuck } from './pickupSolver';
import type {
  CompiledDrill,
  CompiledEvent,
  EventExecution,
  SimulationFrame,
} from './types';

type PuckResult = AnimatedPuck['result'];

type StablePuckState =
  | {
      mode: 'possessed';
      carrierId: ID;
      result?: PuckResult;
    }
  | {
      mode: 'loose';
      position: Point;
      velocity: Point;
      sinceSeconds: number;
      pickupAvailableAt: number;
      excludedCollectorId?: ID;
      intendedReceiverId?: ID;
      result?: PuckResult;
    }
  | {
      mode: 'dead';
      position: Point;
      velocity: Point;
      result: PuckResult;
    };

interface PuckResolution {
  puck: AnimatedPuck | null;
  firedEventIndices: number[];
  eventExecutions: EventExecution[];
  lastShotResult?: NonNullable<ShotEvent['result']>;
}

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

function puckFromStableState(
  compiled: CompiledDrill,
  state: StablePuckState,
  timeSeconds: number
): AnimatedPuck | null {
  if (state.mode === 'possessed') {
    const carrier = playerFrameAt(compiled, state.carrierId, timeSeconds);
    return carrier
      ? {
          ...carrier.bladePosition,
          visible: true,
          state: 'possessed',
          carrierId: carrier.id,
          velocity: carrier.velocity,
          result: state.result,
        }
      : null;
  }

  if (state.mode === 'dead') {
    return {
      ...state.position,
      visible: true,
      state: 'dead',
      velocity: state.velocity,
      result: state.result,
    };
  }

  const motion = solveLoosePuck(
    state.position,
    state.velocity,
    Math.max(0, timeSeconds - state.sinceSeconds),
    compiled.config
  );
  return {
    ...motion.position,
    visible: true,
    state: 'loose',
    velocity: motion.velocity,
    intendedReceiverId: state.intendedReceiverId,
    result: state.result,
  };
}

/**
 * Advance a loose puck through fixed steps and grant control only when a
 * skater's blade actually enters the pickup radius. A short post-release
 * lockout prevents the passer or missed receiver from instantly snapping the
 * puck back onto their stick.
 */
function advanceStableState(
  compiled: CompiledDrill,
  state: StablePuckState,
  targetSeconds: number
): StablePuckState {
  if (
    state.mode !== 'loose' ||
    compiled.config.recovery !== 'nearest-teammate' ||
    targetSeconds <= state.sinceSeconds
  ) {
    return state;
  }

  let position = { ...state.position };
  let velocity = { ...state.velocity };
  let time = state.sinceSeconds;
  const collectionStep = 1 / 30;
  const skaterIds = compiled.source.players
    .filter(player => player.role !== 'G')
    .map(player => player.id);

  while (time < targetSeconds - 0.000001) {
    const dt = Math.min(collectionStep, targetSeconds - time);
    const motion = solveLoosePuck(position, velocity, dt, compiled.config);
    position = motion.position;
    velocity = motion.velocity;
    time += dt;

    if (time + 0.000001 < state.pickupAvailableAt) continue;
    const frames: Record<ID, PlaybackPlayerFrame> = {};
    for (const id of skaterIds) {
      const frame = playerFrameAt(compiled, id, time);
      if (frame) frames[id] = frame;
    }
    const eligibleIds = skaterIds.filter(id => id !== state.excludedCollectorId);
    const pursuerId = chooseNearestPursuer(frames, eligibleIds, position);
    const pursuer = pursuerId ? frames[pursuerId] : null;
    if (pursuer && canCollectPuck(pursuer, position, compiled.config.pickupRadius)) {
      return { mode: 'possessed', carrierId: pursuer.id, result: 'caught' };
    }
  }

  return {
    ...state,
    position,
    velocity,
    sinceSeconds: targetSeconds,
  };
}

function defendingGoalieAt(
  compiled: CompiledDrill,
  shot: ShotEvent,
  timeSeconds: number
): PlaybackPlayerFrame | null {
  const goalX = shot.targetNet === 'L' ? RINK.goalLineLeftX : RINK.goalLineRightX;
  const candidates = compiled.source.players
    .filter(player => player.role === 'G' && player.team !== shot.team)
    .map(player => ({
      frame: playerFrameAt(compiled, player.id, timeSeconds),
      gap: Math.abs(player.x - goalX),
    }))
    .filter((candidate): candidate is { frame: PlaybackPlayerFrame; gap: number } => Boolean(candidate.frame));
  return candidates.sort((a, b) => a.gap - b.gap)[0]?.frame ?? null;
}

/**
 * Walk the puck along the AUTHORED line rather than straight to the target.
 *
 * The puck covers the curve's arc length over the event's flight window, so
 * its speed is constant along a bent path and the drawn line is exactly the
 * trajectory.
 */
function interpolateFlight(
  event: CompiledEvent,
  from: Point,
  to: Point,
  timeSeconds: number
): AnimatedPuck {
  const duration = Math.max(0.001, event.arrivalSeconds - event.departureSeconds);
  const t = Math.max(0, Math.min(1, (timeSeconds - event.departureSeconds) / duration));

  const flight = getFlightPath(event.source, from, to);
  const sampled = puckAlongFlight(flight, t);
  const speed = flight.length / duration;

  return {
    x: sampled.position.x,
    y: sampled.position.y,
    visible: true,
    state: event.source.type === 'shot' ? 'shot' : 'in_flight',
    intendedReceiverId: event.source.type === 'pass' ? event.source.toPlayerId : undefined,
    velocity: { x: sampled.tangent.x * speed, y: sampled.tangent.y * speed },
  };
}

/**
 * The puck's velocity as it arrives, used for rebounds and missed receptions.
 *
 * Taken from the tangent at the end of the flight path: a pass bent around a
 * defender arrives travelling along the curve, not along the straight line
 * back to where it was released.
 */
function arrivalVelocity(event: CompiledEvent, from: Point, to: Point): Point {
  const duration = Math.max(0.001, event.arrivalSeconds - event.departureSeconds);
  const flight = getFlightPath(event.source, from, to);
  const sampled = puckAlongFlight(flight, 1);
  const speed = flight.length / duration;
  return { x: sampled.tangent.x * speed, y: sampled.tangent.y * speed };
}

function samplePuck(compiled: CompiledDrill, timeSeconds: number): PuckResolution {
  const initialCarrier = compiled.source.players.find(player => player.hasPuck);
  const initialLoosePuck = compiled.source.initialPuck;
  let state: StablePuckState | null = initialCarrier
    ? { mode: 'possessed', carrierId: initialCarrier.id }
    : initialLoosePuck
      ? {
          mode: 'loose',
          position: { ...initialLoosePuck },
          velocity: { x: 0, y: 0 },
          sinceSeconds: 0,
          pickupAvailableAt: 0,
        }
      : null;
  const firedEventIndices: number[] = [];
  const eventExecutions: EventExecution[] = compiled.events.map(event => ({
    eventId: event.source.id,
    index: event.index,
    status: 'pending',
  }));
  let lastShotResult: NonNullable<ShotEvent['result']> | undefined;

  for (const event of compiled.events) {
    if (event.departureSeconds > timeSeconds + 0.000001) break;
    const execution = eventExecutions[event.index];
    if (!state) {
      execution.status = 'blocked';
      execution.reason = 'No puck exists at release time.';
      continue;
    }

    state = advanceStableState(compiled, state, event.departureSeconds);

    if (event.source.type === 'pickup') {
      if (state.mode !== 'loose') {
        execution.status = 'blocked';
        execution.reason = state.mode === 'possessed'
          ? `Puck is already controlled by ${state.carrierId}.`
          : 'Puck is dead and cannot be recovered.';
        continue;
      }

      firedEventIndices.push(event.index);
      if (timeSeconds < event.arrivalSeconds - 0.000001) {
        execution.status = 'active';
        return {
          puck: puckFromStableState(compiled, state, timeSeconds),
          firedEventIndices,
          eventExecutions,
          lastShotResult,
        };
      }

      const looseAtArrival = puckFromStableState(compiled, state, event.arrivalSeconds);
      const picker = playerFrameAt(compiled, event.source.fromPlayerId, event.arrivalSeconds);
      const assistMultiplier = compiled.config.assistance === 'high'
        ? 1.8
        : compiled.config.assistance === 'standard'
          ? 1.35
          : 1;
      const reachable = Boolean(
        looseAtArrival &&
        picker &&
        distance(looseAtArrival, picker.bladePosition) <= compiled.config.pickupRadius * assistMultiplier
      );

      if (compiled.config.recovery === 'authored' || reachable) {
        state = { mode: 'possessed', carrierId: event.source.fromPlayerId, result: 'caught' };
        execution.status = 'completed';
        execution.outcome = 'recovered';
      } else {
        state = advanceStableState(compiled, state, event.arrivalSeconds);
        execution.status = 'completed';
        execution.outcome = 'missed';
        execution.reason = 'The player never brought the blade within pickup range.';
      }
      continue;
    }

    if (state.mode !== 'possessed' || state.carrierId !== event.source.fromPlayerId) {
      execution.status = 'blocked';
      execution.reason = state.mode === 'possessed'
        ? `${event.source.fromPlayerId} cannot release a puck controlled by ${state.carrierId}.`
        : 'The puck is loose or dead at release time.';
      continue;
    }

    firedEventIndices.push(event.index);
    const { from, to } = getCompiledEventEndpoints(compiled, event);
    if (timeSeconds < event.arrivalSeconds - 0.000001) {
      execution.status = 'active';
      return {
        puck: interpolateFlight(event, from, to, timeSeconds),
        firedEventIndices,
        eventExecutions,
        lastShotResult,
      };
    }

    const flightVelocity = arrivalVelocity(event, from, to);
    execution.status = 'completed';

    if (event.source.type === 'pass') {
      const receiver = playerFrameAt(compiled, event.source.toPlayerId, event.arrivalSeconds);
      if (!receiver) {
        state = {
          mode: 'loose',
          position: to,
          velocity: { x: flightVelocity.x * 0.55, y: flightVelocity.y * 0.55 },
          sinceSeconds: event.arrivalSeconds,
          pickupAvailableAt: event.arrivalSeconds + 0.35,
          intendedReceiverId: event.source.toPlayerId,
          result: 'missed',
        };
        execution.outcome = 'missed';
        execution.reason = 'Receiver is missing from the drill.';
        continue;
      }

      const evaluation = evaluateReception(
        event.source as PassEvent,
        to,
        flightVelocity,
        receiver,
        compiled.config
      );
      if (evaluation.caught) {
        state = { mode: 'possessed', carrierId: receiver.id, result: 'caught' };
        execution.outcome = 'caught';
      } else {
        state = {
          mode: 'loose',
          position: to,
          velocity: { x: flightVelocity.x * 0.55, y: flightVelocity.y * 0.55 },
          sinceSeconds: event.arrivalSeconds,
          pickupAvailableAt: event.arrivalSeconds + 0.35,
          excludedCollectorId: receiver.id,
          intendedReceiverId: receiver.id,
          result: 'missed',
        };
        execution.outcome = 'missed';
        execution.reason = `Reception failed by ${evaluation.gap.toFixed(1)} units at ${evaluation.relativeSpeed.toFixed(1)} units/s.`;
      }
      continue;
    }

    if (event.source.type === 'dump') {
      state = {
        mode: 'loose',
        position: to,
        velocity: shotVelocity(from, to, compiled.config.passSpeed * 0.35),
        sinceSeconds: event.arrivalSeconds,
        pickupAvailableAt: event.arrivalSeconds,
      };
      execution.outcome = 'released';
      continue;
    }

    const shot = event.source as ShotEvent;
    const result = resolveShotResult(shot, compiled.config, {
      from,
      to,
      goalie: defendingGoalieAt(compiled, shot, event.arrivalSeconds),
    });
    lastShotResult = result;
    execution.outcome = result;

    if (result === 'rebound' || result === 'post') {
      state = {
        mode: 'loose',
        position: to,
        velocity: shotVelocity(to, from, compiled.config.shotSpeed * 0.42),
        sinceSeconds: event.arrivalSeconds,
        pickupAvailableAt: event.arrivalSeconds + 0.15,
        result,
      };
    } else if (result === 'wide') {
      state = {
        mode: 'loose',
        position: to,
        velocity: shotVelocity(from, to, compiled.config.shotSpeed * 0.5),
        sinceSeconds: event.arrivalSeconds,
        pickupAvailableAt: event.arrivalSeconds + 0.15,
        result,
      };
    } else {
      state = {
        mode: 'dead',
        position: to,
        velocity: result === 'goal'
          ? shotVelocity(from, to, compiled.config.shotSpeed)
          : { x: 0, y: 0 },
        result,
      };
    }
  }

  if (!state) {
    return { puck: null, firedEventIndices, eventExecutions, lastShotResult };
  }
  state = advanceStableState(compiled, state, timeSeconds);
  return {
    puck: puckFromStableState(compiled, state, timeSeconds),
    firedEventIndices,
    eventExecutions,
    lastShotResult,
  };
}

/**
 * The frame before turns are eased: positions and events are identical to
 * `sampleFrame`, only headings may snap. For analysis that samples a play
 * many times and never draws it.
 */
export function sampleRawFrame(compiled: CompiledDrill, requestedTimeSeconds: number): SimulationFrame {
  const timeSeconds = Math.max(0, Math.min(compiled.durationSeconds, requestedTimeSeconds));
  const players: Record<ID, PlaybackPlayerFrame> = {};
  for (const [id, player] of compiled.players) {
    const route = compiled.routes.get(id);
    if (route) players[id] = sampleSkater(player, route, timeSeconds, compiled.events);
  }

  const resolution = samplePuck(compiled, timeSeconds);
  for (const [id, player] of compiled.players) {
    const base = players[id];
    if (!base) continue;
    if (player.role === 'G') {
      // React only to a shot that actually released, for this net's defending
      // goalie. The pose is a save attempt, never a manufactured shot outcome.
      const incoming = compiled.events.find(event =>
        event.source.type === 'shot' &&
        timeSeconds >= event.arrivalSeconds - 0.35 &&
        timeSeconds <= event.arrivalSeconds + 0.55 &&
        resolution.firedEventIndices.includes(event.index) &&
        defendingGoalieAt(compiled, event.source as ShotEvent, event.arrivalSeconds)?.id === id
      );
      const goalieRoute = compiled.routes.get(id);
      const authored = Boolean(goalieRoute && goalieRoute.totalLength > 0);
      const goalie = sampleGoalie(base, resolution.puck, Boolean(incoming), authored);
      players[id] = {
        ...base,
        position: goalie.position,
        heading: goalie.heading,
        goalieAction: goalie.action,
        actionPhase: incoming ? contactPhase(timeSeconds, incoming.arrivalSeconds, 0.35, 0.55) : undefined,
        bladePosition: getBladePosition(player, goalie.position, goalie.heading),
      };
    } else {
      // Skater heading intelligence: stationary skaters track the puck carrier or loose puck rather than staring eastward.
      const route = compiled.routes.get(id);
      const hasRoute = !!route && route.totalLength > 0;
      // Eased by speed, not cut off: a skater slowing to a stop turns to the
      // play over the last few feet instead of snapping round in one frame.
      const stride = hasRoute ? strideWeight(base.speed) : 0;
      if (stride < 1 && base.action !== 'shot' && base.action !== 'pass') {
        let targetHeading: number | null = null;
        if (base.action === 'recover' && resolution.puck?.carrierId !== id) {
          // Picking a puck up from a stand: set the body the way it will carry
          // the puck, so the blade - not the chest - meets it at the pickup.
          targetHeading = player.team === 'away' ? Math.PI : 0;
        } else if (resolution.puck && resolution.puck.carrierId !== id) {
          const dx = resolution.puck.x - base.position.x;
          const dy = resolution.puck.y - base.position.y;
          if (dx * dx + dy * dy > 25) {
            targetHeading = Math.atan2(dy, dx);
          }
        } else if (resolution.puck?.carrierId === id) {
          targetHeading = player.team === 'away' ? Math.PI : 0;
        } else if (!route || route.totalLength <= 0) {
          targetHeading = player.team === 'away' ? Math.PI : 0;
        }
        if (targetHeading !== null) {
          const heading = lerpAngle(targetHeading, base.heading, stride);
          players[id] = {
            ...base,
            heading,
            bladePosition: getBladePosition(player, base.position, heading),
          };
        }
      }
    }
  }
  const terminal = timeSeconds >= compiled.durationSeconds - 0.000001;
  const hasAuthoredShot = compiled.events.some(event => event.source.type === 'shot');
  const lifecycle = !terminal
    ? timeSeconds <= 0
      ? 'ready'
      : 'active'
    : resolution.lastShotResult
      ? resolution.lastShotResult === 'goal'
        ? 'success'
        : 'failure'
      : hasAuthoredShot
        ? 'failure'
        : 'review';

  return {
    timeSeconds,
    progress: compiled.durationSeconds > 0 ? timeSeconds / compiled.durationSeconds : 0,
    durationSeconds: compiled.durationSeconds,
    lifecycle,
    players,
    puck: resolution.puck,
    firedEventIndices: resolution.firedEventIndices,
    eventExecutions: resolution.eventExecutions,
  };
}

// ----------------------------------------------------------------------------
// Turning
//
// The raw sample decides where each skater WANTS to face, and that can change
// in one step: a receiver catches the puck and wants to face the net, a
// carrier starts a pass and wants to face the receiver. Drawn as is, the body
// snaps round in a single frame. A skater turns at a human rate instead.
//
// Playback must stay a pure function of time (scrubbing, the video and 3D all
// sample it), so the turn is integrated on a fixed clock - every TURN_STEP
// seconds from the start of the drill - and the result cached per compiled
// drill. Any frame then reads the integrated heading at the last tick and
// eases the rest of the way to its own time, so frames agree whether they are
// played, scrubbed or sampled out of order. During playback each frame costs
// about one extra raw sample.
// ----------------------------------------------------------------------------

/** Fastest body turn, radians a second: half a turn in about a quarter second. */
const MAX_TURN_RATE = 12;
/** Time constant of the ease into the wanted heading, in seconds. */
const TURN_EASE = 0.06;
const TURN_STEP = 1 / 40;
/**
 * Slowest the last of a turn settles, radians a second. The ease alone never
 * quite arrives; with this floor every turn finishes outright - a half turn in
 * under 0.3 s, inside the window every pass, shot, catch and pickup gives the
 * body to face the puck - so at the contact the blade is exactly on it.
 */
const MIN_TURN_RATE = 5;

function turnToward(current: number, wanted: number, dt: number): number {
  const diff = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
  const step = Math.min(Math.max(Math.abs(diff) * (1 - Math.exp(-dt / TURN_EASE)), MIN_TURN_RATE * dt), MAX_TURN_RATE * dt);
  return Math.abs(diff) <= step ? wanted : current + Math.sign(diff) * step;
}

interface TurnTrack {
  skaters: ID[];
  /** ticks[k] holds each skater's turned heading at k * TURN_STEP. */
  ticks: Float64Array[];
}

const turnTracks = new WeakMap<CompiledDrill, TurnTrack>();

function turnedHeadingsAtTick(compiled: CompiledDrill, tick: number): { skaters: ID[]; headings: Float64Array } {
  let track = turnTracks.get(compiled);
  if (!track) {
    const skaters: ID[] = [];
    const initial = sampleRawFrame(compiled, 0);
    for (const [id, player] of compiled.players) if (player.role !== 'G' && initial.players[id]) skaters.push(id);
    track = { skaters, ticks: [Float64Array.from(skaters, id => initial.players[id].heading)] };
    turnTracks.set(compiled, track);
  }
  while (track.ticks.length <= tick) {
    const k = track.ticks.length;
    const previous = track.ticks[k - 1];
    const wanted = sampleRawFrame(compiled, k * TURN_STEP);
    track.ticks.push(
      Float64Array.from(track.skaters, (id, index) => {
        const target = wanted.players[id]?.heading;
        return target === undefined ? previous[index] : turnToward(previous[index], target, TURN_STEP);
      })
    );
  }
  return { skaters: track.skaters, headings: track.ticks[tick] };
}

export function sampleFrame(compiled: CompiledDrill, requestedTimeSeconds: number): SimulationFrame {
  const frame = sampleRawFrame(compiled, requestedTimeSeconds);
  const time = frame.timeSeconds;
  if (time <= 0) return frame;

  const tick = Math.floor(time / TURN_STEP + 1e-9);
  const remainder = time - tick * TURN_STEP;
  const { skaters, headings } = turnedHeadingsAtTick(compiled, tick);
  if (skaters.length === 0) return frame;

  const players = { ...frame.players };
  skaters.forEach((id, index) => {
    const base = players[id];
    if (!base) return;
    const turned = remainder > 1e-9 ? turnToward(headings[index], base.heading, remainder) : headings[index];
    const heading = Math.atan2(Math.sin(turned), Math.cos(turned));
    if (Math.abs(Math.atan2(Math.sin(heading - base.heading), Math.cos(heading - base.heading))) < 1e-4) return;
    players[id] = { ...base, heading, bladePosition: getBladePosition(compiled.players.get(id)!, base.position, heading) };
  });

  // The puck stays on the stick of whoever is carrying it, through the turn.
  let puck = frame.puck;
  if (puck && puck.state === 'possessed' && puck.carrierId && players[puck.carrierId]) {
    const blade = players[puck.carrierId].bladePosition;
    puck = { ...puck, x: blade.x, y: blade.y };
  }
  return { ...frame, players, puck };
}

export function distanceBetweenPuckAndBlade(puck: AnimatedPuck, frame: PlaybackPlayerFrame): number {
  return distance(puck, frame.bladePosition);
}
