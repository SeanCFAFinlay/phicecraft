// ============================================================================
// PUCK ENGINE - Core hockey puck possession and chain logic
// ============================================================================

import type {
  Player,
  DrillEvent,
  PuckChainNode,
  ID,
  NetSide,
  Team,
  Point,
} from '@/core/types';
import { FT, NET_LEFT, NET_RIGHT, RINK, RINK_MARKS } from '@/core/constants';

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
      if (event.catchResult === 'missed') {
        chain.push({ player: null, action: 'pass', eventIndex: index });
        return;
      }
      const receiver = players.find(p => p.id === event.toPlayerId);
      if (receiver) {
        chain.push({
          player: receiver,
          action: 'pass',
          eventIndex: index,
        });
      }
    } else if (event.type === 'pickup') {
      const picker = players.find(p => p.id === event.fromPlayerId) ?? null;
      chain.push({ player: picker, action: 'pickup', eventIndex: index });
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
  // The automatic finishing shot is derived from whoever is carrying, so
  // reading it as "the puck is gone" would make the carrier its own cause of
  // disappearing - and the shot would then have nobody to be sourced from.
  const authored = authoredEvents(events);

  // Work backwards through events
  for (let i = authored.length - 1; i >= 0; i--) {
    const event = authored[i];

    // Shot was last event - no one has puck
    if (event.type === 'shot' || event.type === 'dump') {
      return null;
    }

    if (event.type === 'pickup') {
      return players.find(p => p.id === event.fromPlayerId) ?? null;
    }

    // Pass was last event - receiver has puck
    if (event.type === 'pass') {
      if (event.catchResult === 'missed') return null;
      return players.find(p => p.id === event.toPlayerId) ?? null;
    }
  }

  // No events - initial carrier has puck
  return players.find(p => p.hasPuck) ?? null;
}

/** True for the shot the app maintains at the end of a play. */
export function isAutoShot(event: DrillEvent | undefined): boolean {
  return !!event && event.type === 'shot' && event.auto === true;
}

/**
 * The events the coach actually authored.
 *
 * The automatic finishing shot is derived, so every rule that asks about the
 * state of the drill has to look past it. Without this, the trailing shot
 * would make `canAddEvents` false and `getCurrentPuckHolder` null the moment
 * it appeared, and the drill could never be extended again.
 *
 * Every auto shot is stripped, not merely a trailing one: a reducer that
 * appends to `events` puts the new action AFTER the derived shot, stranding it
 * mid-list. Filtering only the last one left the stale shot looking authored,
 * and the drill grew a second one on the next edit.
 *
 * Returns the same array when there is nothing to strip, so callers that
 * compare by identity are not defeated.
 */
export function authoredEvents(events: DrillEvent[]): DrillEvent[] {
  return events.some(isAutoShot) ? events.filter(event => !isAutoShot(event)) : events;
}

/**
 * Check if we can add more events to the drill
 *
 * Returns false if the last AUTHORED event was a shot (drill is complete)
 */
export function canAddEvents(events: DrillEvent[]): boolean {
  const authored = authoredEvents(events);
  if (authored.length === 0) return true;
  const lastEvent = authored[authored.length - 1];
  return lastEvent.type !== 'shot' && lastEvent.type !== 'dump' &&
    !(lastEvent.type === 'pass' && lastEvent.catchResult === 'missed');
}

/**
 * The net a team shoots at.
 *
 * A shot needs no aiming input - there is exactly one net a given team is
 * attacking - so this lives in the domain and any UI can fire a shot in a
 * single tap instead of arming a mode and waiting for a second one.
 */
export function attackingNetFor(team: Team): Point {
  return team === 'home'
    ? { x: RINK.netRightX, y: RINK.netRightY }
    : { x: RINK.netLeftX, y: RINK.netLeftY };
}

/**
 * How many passes one drill may contain.
 *
 * A practice drill that needs a fifth pass is really two drills; past four the
 * diagram stops being something a coach can hold in their head at the whiteboard
 * and the timeline gets too crowded to edit on a phone. The cap lives here, in
 * the domain, so every authoring path inherits it - drag, tap, the Pass button,
 * retarget and dump conversion alike.
 */
export const MAX_PASSES_PER_DRILL = 4;

/** How many passes the drill already has. */
export function countPasses(events: DrillEvent[]): number {
  return events.filter(event => event.type === 'pass').length;
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

  if (countPasses(events) >= MAX_PASSES_PER_DRILL) {
    return {
      valid: false,
      error: `A drill holds ${MAX_PASSES_PER_DRILL} passes. Finish with a shot, or split this into two drills.`,
    };
  }

  // Check if from player has the puck
  const currentHolder = getCurrentPuckHolder(players, events);
  if (!currentHolder) {
    return { valid: false, error: 'The puck is loose — add a recovery before the next pass' };
  }
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

  // An ordinary pass goes to a teammate. Handing the puck to an opponent is a
  // turnover, which is a different event type and not something the author can
  // create by dragging. This check is here - in the domain - so every UI path
  // (two-tap, drag, retarget, dump conversion, inspector) inherits it.
  if (fromPlayer.team !== toPlayer.team) {
    return {
      valid: false,
      error: `#${toPlayer.number} is on the other team — a pass goes to a teammate.`,
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
  if (!currentHolder) {
    return { valid: false, error: 'The puck is loose — recover it before shooting' };
  }
  if (currentHolder && currentHolder.id !== fromPlayer.id) {
    return {
      valid: false,
      error: `#${fromPlayer.number} does not have the puck`,
    };
  }

  return { valid: true, error: null };
}

// ============================================================================
// END / TEAM CONVENTION
//
// One rule, stated once: HOME defends the LEFT net, AWAY defends the RIGHT.
// Default lineups, manual goalie placement, attack direction, validation, and
// the goalie simulation all read it from here so they cannot drift apart.
// ============================================================================

/** The net this team defends - where their goalie stands. */
export function teamDefendingNet(team: Team): NetSide {
  return team === 'home' ? 'L' : 'R';
}

/** The team that defends this net. Inverse of `teamDefendingNet`. */
export function teamForDefendedNet(net: NetSide): Team {
  return net === 'L' ? 'home' : 'away';
}

/** The net this team attacks - the one they shoot at. */
export function teamAttackingNet(team: Team): NetSide {
  return teamDefendingNet(team) === 'L' ? 'R' : 'L';
}

/** Which half of the rink a world x-coordinate falls in. */
export function netSideForPoint(point: Point): NetSide {
  return point.x < RINK.centerX ? 'L' : 'R';
}

/**
 * Get the target net for a team.
 * Home defends left and therefore attacks the right net, and vice versa.
 */
export function getTargetNet(team: Team): Point {
  return teamAttackingNet(team) === 'R' ? NET_RIGHT : NET_LEFT;
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

/** Preserve a dragged shot's vertical aim while constraining it to the mouth. */
export function getAimedNetTarget(point: Point): Point {
  const net = getNearestNet(point);
  const aimLimit = RINK_MARKS.goalHalfWidth - 0.75 * FT;
  return {
    x: net.x,
    y: Math.max(net.y - aimLimit, Math.min(net.y + aimLimit, point.y)),
  };
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
