// ============================================================================
// RUNNING A V3 DOCUMENT ON THE V2 ENGINE
//
// A deliberate strangler seam. v3 becomes the stored, authored model now,
// while the simulation and the canvas renderer still speak v2 - so this
// flattens a v3 document into the shape they understand.
//
// Doing it this way means the schema work is USED rather than parked: a
// document keeps its metadata, equipment, phases and multiple segments through
// save and load, even though the current editor cannot yet edit all of them.
// The alternative - swapping the engine at the same time as the schema - would
// change the document model, the simulation, the renderer and every command in
// one step, with no green state in between.
//
// WHAT V2 CANNOT HOLD, and is therefore dropped by the projection but NOT by
// the document:
//
//   - equipment            no representation at all
//   - annotations          no representation at all
//   - phases               v2 is one flat timeline; repeats and simultaneous
//                          groups have nowhere to go
//   - extra puck tracks    v2 has one event chain, so only the first survives
//   - extra segments       v2 has one route per player, so segments are joined
//                          end to end into a single polyline
//   - pass type,           v2 passes are all flat, controlled, actor-targeted
//     receive mode,        passes; a pass to space has no v2 equivalent and is
//     pass-to-space        projected as a dump, which is the closest thing v2
//                          has to "puck sent to a spot with no receiver"
//
// `projectionLosses` reports exactly what was dropped for a given document, so
// the UI can say so rather than the coach discovering it later.
// ============================================================================

import type { Drill, DrillEvent, Player, Point, SkatePath } from '@/core/types';
import {
  isOnIce,
  orderedActions,
  orderedSegments,
  type Actor,
  type DrillDocumentV3,
  type PuckAction,
  type PuckTrack,
} from './types';

/** Something in the v3 document that the v2 engine cannot represent. */
export interface ProjectionLoss {
  kind:
    | 'equipment'
    | 'annotations'
    | 'phases'
    | 'extra-puck-tracks'
    | 'joined-segments'
    | 'pass-to-space'
    | 'pass-detail';
  count: number;
  detail: string;
}

function toPlayer(actor: Actor): Player | null {
  if (!isOnIce(actor)) return null;
  return {
    id: actor.id,
    x: actor.position.x,
    y: actor.position.y,
    team: actor.team,
    number: actor.number,
    role: actor.kind === 'goalie' ? 'G' : actor.role,
    hasPuck: false,
    ...(actor.handedness ? { visual: { handedness: actor.handedness, visor: true } } : {}),
  };
}

/**
 * Join a track's segments into one v2 polyline.
 *
 * A player who skates, stops, receives and goes again has several segments;
 * v2 has room for one route. Joining them end to end keeps the SHAPE of the
 * movement, which is what the renderer needs, and loses the timing between
 * them, which is what `projectionLosses` reports.
 */
function joinSegments(points: Point[][]): Point[] {
  const joined: Point[] = [];
  for (const run of points) {
    for (const point of run) {
      const previous = joined[joined.length - 1];
      // Segments usually start where the previous one ended; do not store the
      // seam twice or the curve gets a stall point in it.
      if (previous && previous.x === point.x && previous.y === point.y) continue;
      joined.push({ x: point.x, y: point.y });
    }
  }
  return joined;
}

function fraction(seconds: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(1, seconds / duration));
}

function toEvent(action: PuckAction, duration: number): DrillEvent | null {
  const base = {
    id: action.id,
    fromPlayerId: action.fromActorId,
    fromPoint: { ...action.fromPoint },
    team: 'home' as const,
    at: fraction(action.releaseAt, duration),
    arrivalAt: fraction(action.arrivalAt, duration),
    ...(action.waypoints.length > 0
      ? { waypoints: action.waypoints.map(point => ({ ...point })) }
      : {}),
    shape: action.shape,
  };

  switch (action.type) {
    case 'pass':
      if (action.targetMode === 'space' || !action.toActorId) {
        // v2's nearest concept to "puck sent to a spot, no receiver".
        return { ...base, type: 'dump', toPoint: { ...action.target }, targetNet: 'dump' };
      }
      return {
        ...base,
        type: 'pass',
        toPlayerId: action.toActorId,
        toPoint: { ...action.target },
        ...(action.catchResult ? { catchResult: action.catchResult } : {}),
      };

    case 'shot':
      return {
        ...base,
        type: 'shot',
        toPoint: { ...action.target },
        targetNet: action.targetNet === 'left' ? 'L' : 'R',
        ...(action.result ? { result: action.result } : {}),
        ...(action.auto ? { auto: true } : {}),
      };

    case 'dump':
      return { ...base, type: 'dump', toPoint: { ...action.target }, targetNet: 'dump' };

    case 'pickup':
      return { ...base, type: 'pickup', toPoint: { ...action.target } };

    case 'turnover':
      // v2 has no turnover. A pass to the other team is refused by the domain,
      // so projecting it as one would produce a document that fails its own
      // validation. It is dropped, and reported.
      return null;
  }
}

/** The team a projected event belongs to, taken from its source actor. */
function teamOf(document: DrillDocumentV3, actorId: string): 'home' | 'away' {
  const actor = document.actors.find(item => item.id === actorId);
  return actor && isOnIce(actor) ? actor.team : 'home';
}

function firstTrack(document: DrillDocumentV3): PuckTrack | null {
  return document.puckTracks[0] ?? null;
}

/**
 * Who holds the puck at the start, expressed the way v2 does it: a flag on a
 * player. A coach source has no v2 equivalent - v2 is why the coach had to be
 * a fake skater in the first place - so the puck is given to the first actor
 * the coach passes or dumps to.
 */
function initialCarrierId(document: DrillDocumentV3): string | null {
  const track = firstTrack(document);
  if (!track) return null;

  const source = track.initialSource;
  if (source.kind === 'actor') return source.actorId;

  if (source.kind === 'coach') {
    const first = orderedActions(track)[0];
    if (!first) return null;
    if (first.type === 'pass' && first.toActorId) return first.toActorId;
    // A coach dump has no receiver; v2 needs somebody flagged, so nobody is.
    return null;
  }

  return null;
}

export interface ProjectionResult {
  drill: Drill;
  losses: ProjectionLoss[];
}

/** Everything the v2 shape cannot hold, for a given document. */
export function projectionLosses(document: DrillDocumentV3): ProjectionLoss[] {
  const losses: ProjectionLoss[] = [];

  if (document.equipment.length > 0) {
    losses.push({
      kind: 'equipment',
      count: document.equipment.length,
      detail: 'Cones, gates, tires and mini-nets are kept in the drill but are not drawn yet.',
    });
  }

  if (document.annotations.length > 0) {
    losses.push({
      kind: 'annotations',
      count: document.annotations.length,
      detail: 'Text and zone annotations are kept in the drill but are not drawn yet.',
    });
  }

  const meaningfulPhases = document.phases.filter(
    phase => phase.repeatCount > 1 || phase.simultaneousGroup
  );
  if (meaningfulPhases.length > 0) {
    losses.push({
      kind: 'phases',
      count: meaningfulPhases.length,
      detail: 'Repeats and simultaneous stations play through once, in order.',
    });
  }

  if (document.puckTracks.length > 1) {
    losses.push({
      kind: 'extra-puck-tracks',
      count: document.puckTracks.length - 1,
      detail: 'Only the first puck is simulated; the rest are kept but not played.',
    });
  }

  const multiSegment = document.actorTracks.filter(track => track.segments.length > 1);
  if (multiSegment.length > 0) {
    losses.push({
      kind: 'joined-segments',
      count: multiSegment.length,
      detail: 'Multi-part routes play as one continuous path; the pauses between are not timed.',
    });
  }

  const track = firstTrack(document);
  if (track) {
    const toSpace = track.actions.filter(
      action => action.type === 'pass' && action.targetMode === 'space'
    ).length;
    if (toSpace > 0) {
      losses.push({
        kind: 'pass-to-space',
        count: toSpace,
        detail: 'Passes to open ice play as a dump until the new engine lands.',
      });
    }

    const detailed = track.actions.filter(
      action =>
        action.type === 'pass' &&
        (action.passType !== 'flat' || action.receiveMode !== 'control')
    ).length;
    if (detailed > 0) {
      losses.push({
        kind: 'pass-detail',
        count: detailed,
        detail: 'Saucer, bank, rim and one-touch passes play as flat controlled passes.',
      });
    }
  }

  return losses;
}

/**
 * Flatten a v3 document into the v2 drill the current engine and renderer run.
 */
export function projectToV2(document: DrillDocumentV3): ProjectionResult {
  const carrierId = initialCarrierId(document);

  const players: Player[] = document.actors
    .map(toPlayer)
    .filter((player): player is Player => player !== null)
    .map(player => (player.id === carrierId ? { ...player, hasPuck: true } : player));

  const skatePaths: SkatePath[] = document.actorTracks
    .map((track): SkatePath | null => {
      const segments = orderedSegments(track);
      if (segments.length === 0) return null;
      const points = joinSegments(segments.map(segment => segment.points));
      if (points.length < 2) return null;
      const owner = players.find(player => player.id === track.actorId);
      if (!owner) return null;

      return {
        id: segments[0].id,
        ownerId: track.actorId,
        team: owner.team,
        points,
        shape: segments[0].curve,
        mode:
          segments[0].movement === 'backward'
            ? ('backward' as const)
            : segments[0].movement === 'glide'
              ? ('glide' as const)
              : ('skate' as const),
        finish: segments[0].finish ?? 'stop',
      };
    })
    .filter((path): path is SkatePath => path !== null);

  const duration = document.presentation.durationSeconds;
  const track = firstTrack(document);
  const events: DrillEvent[] = track
    ? orderedActions(track)
        .map(action => {
          const event = toEvent(action, duration);
          return event ? { ...event, team: teamOf(document, action.fromActorId) } : null;
        })
        .filter((event): event is DrillEvent => event !== null)
    : [];

  const coaches = document.actors
    .filter(actor => actor.kind === 'coach')
    .map(actor => ({
      id: actor.id,
      x: actor.position.x,
      y: actor.position.y,
      ...(actor.kind === 'coach' && actor.name ? { name: actor.name } : {}),
    }));

  const drill: Drill = {
    schemaVersion: 2,
    id: document.id,
    name: document.metadata.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    players,
    skatePaths,
    events,
    coaches,
    settings: {
      assistance: 'standard',
      recovery: 'nearest-teammate',
      timeLimitSeconds: duration,
      reducedEffects: document.presentation.reducedEffects,
      jerseys: { ...document.presentation.jerseys },
      finishPolicy: document.phases[0]?.finishPolicy ?? 'none',
    },
  };

  return { drill, losses: projectionLosses(document) };
}
