// ============================================================================
// PLAYBACK ENGINE - Timeline animation and drill playback
//
// Everything here is a pure function of (drill data, progress). Playback never
// mutates the drill: the component asks for positions at a progress value and
// renders them. That keeps scrubbing, replay, and testing all trivially
// consistent, and means an interrupted playback can never persist animation
// frames as the drill's real state.
// ============================================================================

import type {
  Player,
  SkatePath,
  DrillEvent,
  AnimatedPuck,
  Point,
  ID,
} from '@/core/types';
import { pointAtParameter, distance } from '@/utils/geometry';
import {
  DEFAULT_DRILL_DURATION,
  GHOST_TRAIL_MAX_LENGTH,
  PUCK_FLIGHT_FRACTION,
  RINK,
} from '@/core/constants';

const PUCK_BOARD_MARGIN = 14;

function reflectInsideBoards(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return min;
  const period = span * 2;
  const wrapped = ((value - min) % period + period) % period;
  return wrapped <= span ? min + wrapped : max - (wrapped - span);
}

/**
 * Continue a loose puck with ice friction while keeping it inside the boards.
 * Time is capped at the physical stop time so the puck never reverses itself
 * after friction has removed all velocity.
 */
export function getLoosePuckPosition(
  start: Point,
  directionPoint: Point,
  elapsedSeconds: number,
  initialSpeed: number,
  friction = 85
): Point {
  const dx = directionPoint.x - start.x;
  const dy = directionPoint.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const movingSeconds = Math.min(Math.max(0, elapsedSeconds), initialSpeed / friction);
  const travel = initialSpeed * movingSeconds - 0.5 * friction * movingSeconds * movingSeconds;
  const rawX = start.x + (dx / len) * travel;
  const rawY = start.y + (dy / len) * travel;

  return {
    x: reflectInsideBoards(rawX, PUCK_BOARD_MARGIN, RINK.width - PUCK_BOARD_MARGIN),
    y: reflectInsideBoards(rawY, PUCK_BOARD_MARGIN, RINK.height - PUCK_BOARD_MARGIN),
  };
}

/**
 * Get player position at a given playback progress.
 * If the player has a skate path, interpolate along it; otherwise they stand still.
 */
export function getPlayerPositionAtProgress(
  player: Player,
  skatePaths: SkatePath[],
  progress: number
): Point {
  const path = skatePaths.find(sp => sp.ownerId === player.id);

  if (path && path.points.length > 1) {
    return pointAtParameter(path.points, getSkatingProgress(progress));
  }

  return { x: player.x, y: player.y };
}

/**
 * Distance travelled by a skater over normalized time. A skater pushes into
 * speed, holds a long glide, then checks speed approaching the drill endpoint.
 * The curve is monotonic and lands exactly at both endpoints.
 */
export function getSkatingProgress(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  const phase = 0.18;
  const phaseDistance = 0.12;

  if (t < phase) {
    const u = t / phase;
    return phaseDistance * u * u;
  }
  if (t > 1 - phase) {
    const u = (1 - t) / phase;
    return 1 - phaseDistance * u * u;
  }

  const cruiseT = (t - phase) / (1 - phase * 2);
  return phaseDistance + cruiseT * (1 - phaseDistance * 2);
}

/** Inverse of getSkatingProgress, used to time an action placed on a route. */
export function getTimeForSkatingProgress(pathProgress: number): number {
  const target = Math.max(0, Math.min(1, pathProgress));
  let low = 0;
  let high = 1;
  for (let i = 0; i < 28; i++) {
    const mid = (low + high) / 2;
    if (getSkatingProgress(mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Facing direction along the skating route, in radians. */
export function getPlayerHeadingAtProgress(
  player: Player,
  skatePaths: SkatePath[],
  progress: number
): number {
  const before = getPlayerPositionAtProgress(player, skatePaths, Math.max(0, progress - 0.008));
  const after = getPlayerPositionAtProgress(player, skatePaths, Math.min(1, progress + 0.008));
  return Math.atan2(after.y - before.y, after.x - before.x);
}

/** Position of the stick blade used as the puck attachment/catch socket. */
export function getPlayerStickPositionAtProgress(
  player: Player,
  skatePaths: SkatePath[],
  progress: number
): Point {
  const center = getPlayerPositionAtProgress(player, skatePaths, progress);
  const heading = getPlayerHeadingAtProgress(player, skatePaths, progress);
  const forward = 25;
  const lateral = player.team === 'home' ? 8 : -8;
  return {
    x: center.x + Math.cos(heading) * forward - Math.sin(heading) * lateral,
    y: center.y + Math.sin(heading) * forward + Math.cos(heading) * lateral,
  };
}

/**
 * Solve a moving-player interception. The puck endpoint is the receiver's
 * predicted position at arrival, so the drawn pass line, puck and player meet
 * at one point without snapping after the catch.
 */
export function getPassInterception(
  fromPoint: Point,
  receiver: Player,
  skatePaths: SkatePath[],
  departureAt: number,
  drillDurationSeconds: number,
  puckSpeedFeetPerSecond = 55
): { toPoint: Point; arrivalAt: number } {
  let arrivalAt = Math.min(0.98, departureAt + 0.06);
  let toPoint = getPlayerStickPositionAtProgress(receiver, skatePaths, arrivalAt);

  for (let i = 0; i < 8; i++) {
    toPoint = getPlayerStickPositionAtProgress(receiver, skatePaths, arrivalAt);
    const flightSeconds = (distance(fromPoint, toPoint) / 5) / puckSpeedFeetPerSecond;
    arrivalAt = Math.min(0.98, departureAt + Math.max(0.035, flightSeconds / drillDurationSeconds));
  }

  toPoint = getPlayerStickPositionAtProgress(receiver, skatePaths, arrivalAt);
  return { toPoint, arrivalAt };
}

/**
 * Positions for every player at a progress value, keyed by player id.
 * This is the render-time overlay used during playback.
 */
export function getPlaybackPositions(
  players: Player[],
  skatePaths: SkatePath[],
  progress: number
): Record<ID, Point> {
  const positions: Record<ID, Point> = {};
  for (const player of players) {
    positions[player.id] = getPlayerPositionAtProgress(player, skatePaths, progress);
  }
  return positions;
}

/**
 * Timeline position for an event. Events are evenly spaced and centred in
 * their slot, so with 2 events they fire at 0.25 and 0.75.
 */
export function getEventTimelinePosition(
  eventIndex: number,
  totalEvents: number
): number {
  if (totalEvents === 0) return 0;
  return (eventIndex + 0.5) / totalEvents;
}


export function getEventDepartureTime(
  event: DrillEvent,
  eventIndex: number,
  totalEvents: number
): number {
  return event.at ?? getEventTimelinePosition(eventIndex, totalEvents);
}

export function getEventArrivalTime(
  event: DrillEvent,
  eventIndex: number,
  totalEvents: number
): number {
  const departure = getEventDepartureTime(event, eventIndex, totalEvents);
  return event.arrivalAt ?? Math.min(1, departure + PUCK_FLIGHT_FRACTION / Math.max(totalEvents, 1));
}

/**
 * Indices of every event that has fired at or before `progress`.
 * Derived, not accumulated, so scrubbing backwards works correctly.
 */
export function getFiredEventIndices(
  events: DrillEvent[],
  progress: number
): number[] {
  const fired: number[] = [];
  events.forEach((_, index) => {
    if (getEventDepartureTime(events[index], index, events.length) <= progress) {
      fired.push(index);
    }
  });
  return fired;
}

/**
 * Where an event's puck starts and ends, using live player positions at
 * `progress` so a pass tracks a moving receiver.
 */
function getEventEndpoints(
  event: DrillEvent,
  players: Player[],
  skatePaths: SkatePath[],
  progress: number
): { from: Point; to: Point } {
  // Event geometry is authoritative. The coach chose these exact points on
  // the skating routes, and the puck must follow the line shown in the editor.
  // Player animation remains independent and can continue along its route.
  void players;
  void skatePaths;
  void progress;
  return { from: event.fromPoint, to: event.toPoint };
}

/**
 * Puck position at a progress value.
 *
 * Before the first event the puck rides the initial carrier. When event i fires
 * the puck flies from passer to target over PUCK_FLIGHT_FRACTION of the event's
 * slot, then rests on the receiver (or in the net) until the next event.
 */
export function getPuckStateAtProgress(
  players: Player[],
  skatePaths: SkatePath[],
  events: DrillEvent[],
  progress: number
): AnimatedPuck | null {
  // No events: puck sits with whoever starts with it.
  if (events.length === 0) {
    const carrier = players.find(p => p.hasPuck);
    if (!carrier) return null;
    const pos = getPlayerStickPositionAtProgress(carrier, skatePaths, progress);
    return { x: pos.x, y: pos.y, visible: true, state: 'possessed', carrierId: carrier.id };
  }

  const fired = getFiredEventIndices(events, progress);

  // Nothing has fired yet: puck is still on the initial carrier.
  if (fired.length === 0) {
    const carrier = players.find(p => p.hasPuck);
    if (!carrier) return null;
    const pos = getPlayerStickPositionAtProgress(carrier, skatePaths, progress);
    return { x: pos.x, y: pos.y, visible: true, state: 'possessed', carrierId: carrier.id };
  }

  const index = fired[fired.length - 1];
  const event = events[index];
  const { from, to } = getEventEndpoints(event, players, skatePaths, progress);

  const firedAt = getEventDepartureTime(event, index, events.length);
  const arrivalAt = getEventArrivalTime(event, index, events.length);
  const flightDuration = arrivalAt - firedAt;
  const flightT = flightDuration > 0
    ? Math.min((progress - firedAt) / flightDuration, 1)
    : 1;

  if (flightT < 1) {
    return {
      x: from.x + (to.x - from.x) * flightT,
      y: from.y + (to.y - from.y) * flightT,
      visible: true,
      state: event.type === 'shot' ? 'shot' : event.type === 'pickup' ? 'loose' : 'in_flight',
      intendedReceiverId: event.type === 'pass' ? event.toPlayerId : undefined,
    };
  }

  if (event.type === 'pickup') {
    const picker = players.find(player => player.id === event.fromPlayerId);
    const stick = picker
      ? getPlayerStickPositionAtProgress(picker, skatePaths, progress)
      : to;
    return { x: stick.x, y: stick.y, visible: true, state: 'possessed', carrierId: picker?.id };
  }

  if (event.type === 'dump' || (event.type === 'pass' && event.catchResult === 'missed')) {
    const elapsedSeconds = Math.max(0, progress - arrivalAt) * DEFAULT_DRILL_DURATION;
    const initialSpeed = Math.max(
      18,
      distance(from, to) / Math.max((arrivalAt - firedAt) * DEFAULT_DRILL_DURATION, 0.05)
    );
    const loose = getLoosePuckPosition(to, {
      x: to.x + (to.x - from.x),
      y: to.y + (to.y - from.y),
    }, elapsedSeconds, initialSpeed);
    return {
      x: loose.x,
      y: loose.y,
      visible: true,
      state: 'loose',
      intendedReceiverId: event.type === 'pass' ? event.toPlayerId : undefined,
    };
  }

  if (event.type === 'shot') {
    if (event.result === 'rebound') {
      const rebound = getLoosePuckPosition(
        to,
        from,
        Math.max(0, progress - arrivalAt) * DEFAULT_DRILL_DURATION,
        70,
        42
      );
      return {
        x: rebound.x,
        y: rebound.y,
        visible: true,
        state: 'loose',
      };
    }
    return { x: to.x, y: to.y, visible: true, state: 'dead' };
  }

  // Once received, the puck stays attached to the receiver as they continue
  // skating. Possession and the rendered puck therefore remain synchronized.
  const receiver = players.find(player => player.id === event.toPlayerId);
  const carried = receiver
    ? getPlayerStickPositionAtProgress(receiver, skatePaths, progress)
    : to;
  return { x: carried.x, y: carried.y, visible: true, state: 'possessed', carrierId: receiver?.id };
}

/**
 * Append a point to a player's ghost trail, trimming to the max length.
 * Returns a new Map with new arrays - never mutates the input.
 */
export function updateGhostTrail(
  trails: Map<ID, Point[]>,
  playerId: ID,
  position: Point
): Map<ID, Point[]> {
  const next = new Map(trails);
  const existing = next.get(playerId) ?? [];
  const trail = [...existing, { x: position.x, y: position.y }];

  next.set(
    playerId,
    trail.length > GHOST_TRAIL_MAX_LENGTH
      ? trail.slice(trail.length - GHOST_TRAIL_MAX_LENGTH)
      : trail
  );

  return next;
}

export function clearGhostTrails(): Map<ID, Point[]> {
  return new Map();
}

/**
 * Format progress as a 0:00 clock reading.
 */
export function formatTime(progress: number, duration: number = DEFAULT_DRILL_DURATION): string {
  const seconds = Math.floor(progress * duration);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Marker positions for the timeline scrubber.
 */
export interface TimelineMarker {
  position: number; // 0-1
  type: 'pass' | 'shot' | 'dump' | 'pickup';
  eventIndex: number;
}

export function getTimelineMarkers(events: DrillEvent[]): TimelineMarker[] {
  return events.map((event, index) => ({
    position: getEventDepartureTime(event, index, events.length),
    type: event.type,
    eventIndex: index,
  }));
}
