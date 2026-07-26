// ============================================================================
// THE SHOT AT THE END OF THE PLAY, WHEN THE PLAY ASKS FOR ONE
//
// A drill whose finish policy is `finish-with-shot` gets its last event
// derived: whoever ends up with the puck shoots at the net their team is
// attacking, and the shot follows the puck as passes are added, retargeted or
// removed. The coach never authors it.
//
// Every other policy derives NOTHING. This file used to assert that "a play
// finishes with a shot" unconditionally, which is false for possession games,
// passing warm-ups, races, stickhandling stations, breakouts that end at a zone
// exit, drills meant to loop, and small-area games with no goalie - and it made
// those drills impossible to represent honestly.
//
// This runs from `appReducer`, which is the one place every drill mutation
// passes through - commands, undo, redo, import and load alike. Two properties
// it must have, because it runs that often:
//
//   PURE       no ids from a random source, no clock. Undo restores a snapshot
//              and re-deriving from it has to produce exactly what was there,
//              or undo would itself count as an edit.
//   CHEAP      `MOVE_PLAYER` fires once per animation frame while a player is
//              being dragged. Nothing here may compile the drill; the geometry
//              is taken straight from the authored route and player positions.
//
// It also has to be IDEMPOTENT and referentially stable: when the derived shot
// already matches, the very same `Drill` object is returned, because
// `appReducer` treats a new object as a document change and would otherwise
// bump the revision - and invalidate the review - on every action.
// ============================================================================

import type { Drill, DrillEvent, Player, Point, ShotEvent } from '@/core/types';
import { RINK } from '@/core/constants';
import { attackingNetFor, authoredEvents, getCurrentPuckHolder, isAutoShot } from './puck';
import { generateId } from '@/utils/id';

/** Puck speed used to time the finishing shot, in feet per second. */
const SHOT_FEET_PER_SECOND = 75;
/** One foot of real ice is five world units. */
const UNITS_PER_FOOT = 5;
const DEFAULT_DURATION_SECONDS = 8;
/** The earliest a shot may be released, as a fraction of the drill. */
const EARLIEST_RELEASE = 0.12;
/** Breathing room between the previous event arriving and the shot leaving. */
const RELEASE_GAP = 0.04;
const LATEST_RELEASE = 0.94;

/** Whether the coach has asked for a derived finishing shot. */
export function wantsFinishingShot(drill: Drill): boolean {
  return drill.settings?.finishPolicy === 'finish-with-shot';
}

/**
 * Whether this drill represents a play at all.
 *
 * An untouched board is a lineup, not a play, and giving it a shot would mean
 * every new drill opened with an event nobody authored. A play starts once the
 * puck has moved or the carrier has somewhere to skate.
 */
function isAPlay(drill: Drill, carrier: Player): boolean {
  return (
    authoredEvents(drill.events).length > 0 ||
    drill.skatePaths.some(path => path.ownerId === carrier.id && path.points.length >= 2)
  );
}

/** Where the shooter releases from: the end of their route, or where they stand. */
function releasePoint(drill: Drill, carrier: Player): Point {
  const route = drill.skatePaths.find(path => path.ownerId === carrier.id);
  const last = route?.points?.[route.points.length - 1];
  return last ? { x: last.x, y: last.y } : { x: carrier.x, y: carrier.y };
}

function releaseProgress(authored: DrillEvent[]): number {
  const previousArrival = authored.length ? authored[authored.length - 1].arrivalAt ?? 0 : 0;
  return Math.min(LATEST_RELEASE, Math.max(EARLIEST_RELEASE, previousArrival + RELEASE_GAP));
}

function durationSeconds(drill: Drill): number {
  const limit = drill.settings?.timeLimitSeconds;
  return limit && limit > 0 ? limit : DEFAULT_DURATION_SECONDS;
}

function buildShot(drill: Drill, carrier: Player, authored: DrillEvent[], id: string): ShotEvent {
  const from = releasePoint(drill, carrier);
  const target = attackingNetFor(carrier.team);
  const at = releaseProgress(authored);
  const feet = Math.hypot(target.x - from.x, target.y - from.y) / UNITS_PER_FOOT;
  const flight = Math.max(0.025, feet / SHOT_FEET_PER_SECOND / durationSeconds(drill));

  return {
    id,
    type: 'shot',
    auto: true,
    fromPlayerId: carrier.id,
    fromPoint: from,
    toPoint: target,
    targetNet: target.x < RINK.centerX ? 'L' : 'R',
    team: carrier.team,
    at,
    arrivalAt: Math.min(1, at + flight),
  };
}

/** Whether re-deriving would produce the shot that is already there. */
function matches(existing: ShotEvent, desired: ShotEvent): boolean {
  return (
    existing.fromPlayerId === desired.fromPlayerId &&
    existing.team === desired.team &&
    existing.targetNet === desired.targetNet &&
    existing.at === desired.at &&
    existing.arrivalAt === desired.arrivalAt &&
    existing.fromPoint.x === desired.fromPoint.x &&
    existing.fromPoint.y === desired.fromPoint.y &&
    existing.toPoint.x === desired.toPoint.x &&
    existing.toPoint.y === desired.toPoint.y
  );
}

/**
 * Return `drill` with its automatic finishing shot correct, or `drill` itself
 * when it already is.
 */
export function withFinishingShot(drill: Drill): Drill {
  const authored = authoredEvents(drill.events);

  // Not this drill's ending. Strip any derived shot left over from a policy
  // change, and never add one.
  if (!wantsFinishingShot(drill)) {
    return authored === drill.events ? drill : { ...drill, events: authored };
  }

  const lastAuthored = authored[authored.length - 1];

  // A shot the coach authored, or an imported one, ends the drill on its own
  // terms and is left exactly as it is.
  if (lastAuthored?.type === 'shot') {
    return authored === drill.events ? drill : { ...drill, events: authored };
  }

  // Reuse the id wherever the previous derived shot ended up, so re-deriving
  // is stable and undo snapshots keep matching.
  const existing = (drill.events.find(isAutoShot) as ShotEvent | undefined) ?? null;
  const carrier = getCurrentPuckHolder(drill.players, authored);

  // Nobody to shoot, or nothing drawn yet: there should be no derived shot.
  if (!carrier || !isAPlay(drill, carrier)) {
    return authored === drill.events ? drill : { ...drill, events: authored };
  }

  const desired = buildShot(drill, carrier, authored, existing?.id ?? generateId());
  const current = drill.events[drill.events.length - 1];
  if (isAutoShot(current) && authored.length === drill.events.length - 1 && matches(current as ShotEvent, desired)) {
    return drill;
  }

  return { ...drill, events: [...authored, desired] };
}
