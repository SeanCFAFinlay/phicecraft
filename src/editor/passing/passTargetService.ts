// ============================================================================
// WHO CAN BE PASSED TO, AND WHAT WOULD HAPPEN
//
// One service, used by every path that authors a pass - tap, drag, keyboard and
// inspector - so they cannot disagree about what is a legal target.
//
// The defect this replaces: hit-testing evaluated EVERY player and EVERY route
// except the passer's, picked the nearest, and only then handed the winner to
// the domain validator, which rejected opponents. In a crowded small-area drill
// an opponent standing between the passer and a teammate would win the nearest-
// target race and the pass would be refused - making the perfectly valid
// teammate behind them feel untappable, with no way to tell why.
//
// The fix is ordering: eligibility is decided BEFORE ranking. An opponent is
// never a candidate for an ordinary pass, so it can never win. Opponents are
// still reported, separately, so the UI can say "that is the other team"
// instead of silently doing nothing.
// ============================================================================

import type { Drill, ID, Player, Point } from '@/core/types';
import { closestPointOnPolyline, distance } from '@/utils/geometry';
import { expandCurve } from '@/utils/curves';
import { canAddEvents, getCurrentPuckHolder } from '@/engine/puck';
import { predictPassInterceptions } from '@/sim/authoring';

/** How forgiving each kind of target is, in SCREEN pixels. */
export const TOKEN_SNAP_RADIUS = 68;
export const ROUTE_SNAP_RADIUS = 42;
/**
 * A direct hit on a teammate's token beats their route, and beats a route
 * belonging to anyone else, even a closer one. Ranking is in screen pixels, so
 * this is a penalty added to route distances rather than a separate pass.
 */
const ROUTE_RANK_PENALTY = 24;

/** Where the puck would arrive, and whether the receiver can meet it. */
export type CatchQuality = 'clean' | 'assisted' | 'late' | 'unreachable';

/** How far a receiver can be led before the pass only works if they keep going. */
const ASSISTED_LEAD_DISTANCE = 90;
const LATE_ARRIVAL = 0.9;
const UNREACHABLE_ARRIVAL = 0.97;

export interface PassTargetCandidate {
  actorId: ID;
  targetType: 'player' | 'route';
  targetPoint: Point;
  /** Distance from the pointer, in screen pixels, after ranking penalties. */
  screenDistance: number;
  eligibility: 'valid' | 'risky' | 'invalid';
  /** Why this target is not simply valid. Absent when it is. */
  reason?: string;
  predictedArrivalAt: number;
  predictedCatchQuality: CatchQuality;
}

/** What the pointer resolved to. Never a silent nothing. */
export type PassTargetResolution =
  | { kind: 'receiver'; candidate: PassTargetCandidate }
  /** An opponent was under the pointer. Reported so the UI can explain it. */
  | { kind: 'opponent'; player: Player; reason: string }
  /** Deliberate pass to open ice. Only offered when the caller allows it. */
  | { kind: 'space'; point: Point }
  /** Nothing was close enough. Pass mode stays armed. */
  | { kind: 'miss'; reason: string };

export interface PassTargetContext {
  drill: Drill;
  passerId: ID;
  /**
   * Where a player is DRAWN right now. Hit-testing used the authored start
   * coordinates while the rest of the canvas used the scrubbed position, so
   * after moving the playhead the visible player and the pass target diverged.
   */
  positionOf: (playerId: ID) => Point;
  /** World units to screen pixels. */
  zoom: number;
  /** When the puck leaves, as a fraction of the drill. */
  departureAt: number;
  /** Where the puck leaves from. */
  from: Point;
}

function qualityFor(arrivalAt: number, leadDistance: number): CatchQuality {
  if (arrivalAt >= UNREACHABLE_ARRIVAL) return 'unreachable';
  if (arrivalAt > LATE_ARRIVAL) return 'late';
  if (leadDistance > ASSISTED_LEAD_DISTANCE) return 'assisted';
  return 'clean';
}

function reasonFor(quality: CatchQuality): string | undefined {
  switch (quality) {
    case 'unreachable':
      return 'They cannot get there before the drill ends';
    case 'late':
      return 'The puck only just arrives in time';
    case 'assisted':
      return 'They have to keep skating to meet it';
    case 'clean':
      return undefined;
  }
}

function eligibilityFor(quality: CatchQuality): 'valid' | 'risky' | 'invalid' {
  if (quality === 'unreachable') return 'invalid';
  if (quality === 'late' || quality === 'assisted') return 'risky';
  return 'valid';
}

/** Teammates who could legally receive an ordinary pass right now. */
export function eligibleReceiverIds(context: PassTargetContext): ID[] {
  const { drill, passerId } = context;
  const passer = drill.players.find(player => player.id === passerId);
  if (!passer) return [];
  if (!canAddEvents(drill.events)) return [];

  const carrier = getCurrentPuckHolder(drill.players, drill.events);
  if (!carrier || carrier.id !== passerId) return [];

  return drill.players
    .filter(player => player.id !== passerId && player.team === passer.team)
    .map(player => player.id);
}

/**
 * Every eligible teammate, scored. This is what the renderer highlights, and
 * it is computed once when Pass is armed rather than per pointer frame.
 */
export function eligibleReceivers(context: PassTargetContext): PassTargetCandidate[] {
  const ids = eligibleReceiverIds(context);
  if (ids.length === 0) return [];

  const predictions = predictPassInterceptions(
    context.drill,
    context.from,
    context.departureAt,
    ids
  );

  return ids.map(actorId => {
    const prediction = predictions.get(actorId);
    const fallback = context.positionOf(actorId);
    const arrivalAt = prediction?.arrivalAt ?? Math.min(0.98, context.departureAt + 0.08);
    const quality = qualityFor(arrivalAt, prediction?.leadDistance ?? 0);

    return {
      actorId,
      targetType: 'player' as const,
      targetPoint: prediction?.toPoint ?? fallback,
      screenDistance: 0,
      eligibility: eligibilityFor(quality),
      reason: reasonFor(quality),
      predictedArrivalAt: arrivalAt,
      predictedCatchQuality: quality,
    };
  });
}

/**
 * Resolve a pointer position to a pass target.
 *
 * `allowSpace` separates a tap from a drag: tapping empty ice is a miss and
 * keeps Pass armed, while dragging to open ice is a deliberate pass to space.
 * Without that distinction a stray tap would author a pass nobody asked for.
 */
export function resolvePassTarget(
  context: PassTargetContext,
  world: Point,
  options: { allowSpace?: boolean } = {}
): PassTargetResolution {
  const { drill, passerId, zoom, positionOf } = context;
  const passer = drill.players.find(player => player.id === passerId);
  if (!passer) return { kind: 'miss', reason: 'That passer is no longer on the ice.' };

  const eligible = new Set(eligibleReceiverIds(context));

  // Eligibility first. An opponent is not a candidate, so it cannot win the
  // nearest-target race and hide a valid teammate behind it.
  let best: { actorId: ID; targetType: 'player' | 'route'; point: Point; rank: number } | null =
    null;

  for (const player of drill.players) {
    if (!eligible.has(player.id)) continue;
    const at = positionOf(player.id);
    const screen = distance(at, world) * zoom;
    if (screen <= TOKEN_SNAP_RADIUS && (!best || screen < best.rank)) {
      best = { actorId: player.id, targetType: 'player', point: at, rank: screen };
    }
  }

  for (const path of drill.skatePaths) {
    if (!eligible.has(path.ownerId) || (path.points?.length ?? 0) < 2) continue;
    const line = expandCurve(path.points, path.shape ?? 'spline');
    const closest = closestPointOnPolyline(line, world);
    const screen = closest.distance * zoom;
    const ranked = screen + ROUTE_RANK_PENALTY;
    if (screen <= ROUTE_SNAP_RADIUS && (!best || ranked < best.rank)) {
      best = { actorId: path.ownerId, targetType: 'route', point: closest.point, rank: ranked };
    }
  }

  if (best) {
    const predictions = predictPassInterceptions(drill, context.from, context.departureAt, [
      best.actorId,
    ]);
    const prediction = predictions.get(best.actorId);
    const arrivalAt = prediction?.arrivalAt ?? Math.min(0.98, context.departureAt + 0.08);
    const quality = qualityFor(arrivalAt, prediction?.leadDistance ?? 0);

    return {
      kind: 'receiver',
      candidate: {
        actorId: best.actorId,
        targetType: best.targetType,
        // A route hit passes to the point on the line the coach chose; a token
        // hit passes to where the solver says the receiver's blade will be.
        targetPoint: best.targetType === 'route' ? best.point : prediction?.toPoint ?? best.point,
        screenDistance: best.rank,
        eligibility: eligibilityFor(quality),
        reason: reasonFor(quality),
        predictedArrivalAt: arrivalAt,
        predictedCatchQuality: quality,
      },
    };
  }

  // Nothing eligible. Was an opponent under the pointer? Saying so is the
  // difference between a control that refused and a control that did nothing.
  for (const player of drill.players) {
    if (player.id === passerId || player.team === passer.team) continue;
    if (distance(positionOf(player.id), world) * zoom <= TOKEN_SNAP_RADIUS) {
      return {
        kind: 'opponent',
        player,
        reason: `#${player.number} is on the other team — a pass goes to a teammate.`,
      };
    }
  }

  if (options.allowSpace) return { kind: 'space', point: world };

  return { kind: 'miss', reason: 'Choose a highlighted teammate, or drag to open ice.' };
}
