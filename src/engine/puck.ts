// ============================================================================
// PUCK ENGINE - Core hockey puck possession and chain logic
// ============================================================================

import type {
  Player,
  DrillEvent,
  PuckChainNode,
  ID,
  Team,
  Point,
} from '@/core/types';
import { NET_LEFT, NET_RIGHT } from '@/core/constants';

/**
 * Get the complete puck chain - sequence of who has/had the puck
 *
 * The chain starts with the initial puck carrier (player with hasPuck=true)
 * and follows through each pass event. A shot event terminates the chain.
 */
export function getPuckChain(players: Player[], events: DrillEvent[]): PuckChainNode[] {
  const chain: PuckChainNode[] = [];

  // Find initial puck carrier
  const initialCarrier = players.find(p => p.hasPuck);
  if (initialCarrier) {
    chain.push({
      player: initialCarrier,
      action: null,
      eventIndex: null,
    });
  }

  // Process each event
  events.forEach((event, index) => {
    if (event.type === 'pass') {
      const receiver = players.find(p => p.id === event.toPlayerId);
      if (receiver) {
        chain.push({
          player: receiver,
          action: 'pass',
          eventIndex: index,
        });
      }
    } else if (event.type === 'shot' || event.type === 'dump') {
      chain.push({
        player: null,
        action: event.type,
        eventIndex: index,
      });
    }
  });

  return chain;
}

/**
 * Get the current puck holder based on all events
 *
 * Works backwards through events to find who currently has the puck.
 * Returns null if the last event was a shot (puck is in/at the net)
 */
export function getCurrentPuckHolder(players: Player[], events: DrillEvent[]): Player | null {
  // Work backwards through events
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];

    // Shot was last event - no one has puck
    if (event.type === 'shot' || event.type === 'dump') {
      return null;
    }

    // Pass was last event - receiver has puck
    if (event.type === 'pass') {
      return players.find(p => p.id === event.toPlayerId) ?? null;
    }
  }

  // No events - initial carrier has puck
  return players.find(p => p.hasPuck) ?? null;
}

/**
 * Check if we can add more events to the drill
 *
 * Returns false if the last event was a shot (drill is complete)
 */
export function canAddEvents(events: DrillEvent[]): boolean {
  if (events.length === 0) return true;
  const lastEvent = events[events.length - 1];
  return lastEvent.type !== 'shot' && lastEvent.type !== 'dump';
}

/**
 * Validate if a pass can be made
 */
export interface PassValidation {
  valid: boolean;
  error: string | null;
}

export function validatePass(
  fromPlayer: Player,
  toPlayer: Player,
  players: Player[],
  events: DrillEvent[]
): PassValidation {
  // Check if events can still be added
  if (!canAddEvents(events)) {
    return {
      valid: false,
      error: 'Drill already ended with a shot',
    };
  }

  // Check if from player has the puck
  const currentHolder = getCurrentPuckHolder(players, events);
  if (currentHolder && currentHolder.id !== fromPlayer.id) {
    return {
      valid: false,
      error: `#${fromPlayer.number} does not have the puck. #${currentHolder.number} has it.`,
    };
  }

  // Can't pass to self
  if (fromPlayer.id === toPlayer.id) {
    return {
      valid: false,
      error: 'Cannot pass to self',
    };
  }

  return { valid: true, error: null };
}

/**
 * Validate if a shot can be made
 */
export interface ShotValidation {
  valid: boolean;
  error: string | null;
}

export function validateShot(
  fromPlayer: Player,
  players: Player[],
  events: DrillEvent[]
): ShotValidation {
  // Check if events can still be added
  if (!canAddEvents(events)) {
    return {
      valid: false,
      error: 'Already ended with a shot - undo to change',
    };
  }

  // Check if from player has the puck
  const currentHolder = getCurrentPuckHolder(players, events);
  if (currentHolder && currentHolder.id !== fromPlayer.id) {
    return {
      valid: false,
      error: `#${fromPlayer.number} does not have the puck`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Get the target net for a team
 * Home team attacks right net, away attacks left
 */
export function getTargetNet(team: Team): Point {
  return team === 'home' ? NET_RIGHT : NET_LEFT;
}

/**
 * Get the nearest net to a point
 */
export function getNearestNet(point: Point): Point {
  const distToLeft = Math.sqrt(
    (point.x - NET_LEFT.x) ** 2 + (point.y - NET_LEFT.y) ** 2
  );
  const distToRight = Math.sqrt(
    (point.x - NET_RIGHT.x) ** 2 + (point.y - NET_RIGHT.y) ** 2
  );
  return distToLeft < distToRight ? NET_LEFT : NET_RIGHT;
}

/**
 * Check if a player has the puck (considering all events)
 */
export function playerHasPuck(
  player: Player,
  players: Player[],
  events: DrillEvent[]
): boolean {
  const holder = getCurrentPuckHolder(players, events);
  return holder !== null && holder.id === player.id;
}

/**
 * Recalculate events after player removal
 * Removes any events that reference the deleted player
 */
export function removePlayerFromEvents(
  playerId: ID,
  events: DrillEvent[]
): DrillEvent[] {
  return events.filter(event => {
    if (event.fromPlayerId === playerId) return false;
    if (event.type === 'pass' && event.toPlayerId === playerId) return false;
    return true;
  });
}

/**
 * Get puck holder at a specific event index (for playback)
 */
export function getPuckHolderAtEvent(
  players: Player[],
  events: DrillEvent[],
  eventIndex: number
): Player | null {
  if (eventIndex < 0) {
    return players.find(p => p.hasPuck) ?? null;
  }

  const eventsUpToIndex = events.slice(0, eventIndex + 1);
  return getCurrentPuckHolder(players, eventsUpToIndex);
}
