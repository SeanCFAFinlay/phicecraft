// ============================================================================
// PLAYBACK ENGINE - Timeline animation and drill playback
// ============================================================================

import type {
  Player,
  SkatePath,
  DrillEvent,
  Point,
  ID,
} from '@/core/types';
import { pointAtParameter } from '@/utils/geometry';
import { DEFAULT_DRILL_DURATION, GHOST_TRAIL_MAX_LENGTH } from '@/core/constants';

/**
 * Player snapshot for storing/restoring positions
 */
export interface PlayerSnapshot {
  id: ID;
  x: number;
  y: number;
  hasPuck: boolean;
}

/**
 * Create a snapshot of all player positions
 */
export function createPlayerSnapshot(players: Player[]): PlayerSnapshot[] {
  return players.map(p => ({
    id: p.id,
    x: p.x,
    y: p.y,
    hasPuck: p.hasPuck,
  }));
}

/**
 * Restore players to snapshot positions
 */
export function restorePlayerSnapshot(
  players: Player[],
  snapshot: PlayerSnapshot[]
): Player[] {
  return players.map(player => {
    const snap = snapshot.find(s => s.id === player.id);
    if (snap) {
      return {
        ...player,
        x: snap.x,
        y: snap.y,
        hasPuck: snap.hasPuck,
      };
    }
    return player;
  });
}

/**
 * Get player position at a given playback progress
 * If player has a skate path, interpolate along it
 */
export function getPlayerPositionAtProgress(
  player: Player,
  skatePaths: SkatePath[],
  progress: number
): Point {
  const path = skatePaths.find(sp => sp.ownerId === player.id);

  if (path && path.points.length > 1) {
    // Slightly overshoot to ensure player reaches end
    const adjustedProgress = Math.min(progress * 1.06, 1);
    return pointAtParameter(path.points, adjustedProgress);
  }

  // No path - player stays in place
  return { x: player.x, y: player.y };
}

/**
 * Update player positions based on playback progress
 */
export function updatePlayersAtProgress(
  players: Player[],
  skatePaths: SkatePath[],
  progress: number
): Player[] {
  return players.map(player => {
    const pos = getPlayerPositionAtProgress(player, skatePaths, progress);
    return {
      ...player,
      x: pos.x,
      y: pos.y,
    };
  });
}

/**
 * Calculate timeline position for each event
 * Events are evenly spaced across the timeline
 */
export function getEventTimelinePosition(
  eventIndex: number,
  totalEvents: number
): number {
  if (totalEvents === 0) return 0;
  // Center each event in its time slot
  return (eventIndex + 0.5) / totalEvents;
}

/**
 * Get events that should fire at the current progress
 */
export function getEventsToFire(
  events: DrillEvent[],
  progress: number,
  alreadyFired: number[]
): number[] {
  const toFire: number[] = [];

  events.forEach((_, index) => {
    const eventTime = getEventTimelinePosition(index, events.length);
    if (eventTime <= progress && !alreadyFired.includes(index)) {
      toFire.push(index);
    }
  });

  return toFire;
}

/**
 * Calculate puck animation during playback
 */
export interface PuckAnimation {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  duration: number;
}

export function calculatePuckAnimation(
  event: DrillEvent,
  players: Player[],
  skatePaths: SkatePath[],
  currentProgress: number,
  playbackSpeed: number
): PuckAnimation {
  // Get actual player positions at this moment
  const fromPlayer = players.find(p => p.id === event.fromPlayerId);
  const fromPos = fromPlayer
    ? getPlayerPositionAtProgress(fromPlayer, skatePaths, currentProgress)
    : event.fromPoint;

  let toPos = event.toPoint;

  // For passes, get receiver's current position
  if (event.type === 'pass') {
    const toPlayer = players.find(p => p.id === event.toPlayerId);
    if (toPlayer) {
      toPos = getPlayerPositionAtProgress(toPlayer, skatePaths, currentProgress);
    }
  }

  // Calculate animation duration based on distance
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  let baseDuration: number;
  if (event.type === 'pass') {
    baseDuration = Math.max(200, Math.min(600, distance * 0.9));
  } else {
    baseDuration = 320;
  }

  return {
    fromX: fromPos.x,
    fromY: fromPos.y,
    toX: toPos.x,
    toY: toPos.y,
    duration: baseDuration / playbackSpeed,
  };
}

/**
 * Format time for display (0:00 format)
 */
export function formatTime(progress: number, duration: number = DEFAULT_DRILL_DURATION): string {
  const seconds = Math.floor(progress * duration);
  return `0:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Update ghost trail for a player
 */
export function updateGhostTrail(
  trails: Map<ID, Point[]>,
  playerId: ID,
  position: Point
): Map<ID, Point[]> {
  const newTrails = new Map(trails);
  const trail = newTrails.get(playerId) ?? [];

  trail.push({ ...position });

  // Limit trail length
  while (trail.length > GHOST_TRAIL_MAX_LENGTH) {
    trail.shift();
  }

  newTrails.set(playerId, trail);
  return newTrails;
}

/**
 * Clear all ghost trails
 */
export function clearGhostTrails(): Map<ID, Point[]> {
  return new Map();
}

/**
 * Calculate timeline markers for events
 */
export interface TimelineMarker {
  position: number; // 0-1
  type: 'pass' | 'shot' | 'dump';
  eventIndex: number;
}

export function getTimelineMarkers(events: DrillEvent[]): TimelineMarker[] {
  return events.map((event, index) => ({
    position: getEventTimelinePosition(index, events.length),
    type: event.type,
    eventIndex: index,
  }));
}
