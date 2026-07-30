// ============================================================================
// VERSION 2 TO VERSION 3
//
// Every drill a coach has already saved must open in the new model without
// losing anything. The mapping is mostly mechanical, but four cases are
// judgement calls and each one is a place a naive migration would quietly
// corrupt somebody's work:
//
//   1. A COACH modelled as a skater. v2 had no way to say "a coach starts this
//      drill", so the fixtures created a player with id `coach`, role `F` and
//      `hasPuck: true`. Migrated as a skater, that coach would stay a pass
//      target, a simulated body and a member of a team forever. It becomes a
//      `CoachActor` and a `coach` puck source instead.
//
//   2. A DERIVED shot. Phase 1 made the finishing shot opt-in. A v2 drill
//      containing one was authored while it was compulsory, so the intent
//      travels as `finish-with-shot` on the phase rather than the shot being
//      re-derived or dropped.
//
//   3. GOALIES. v2 marked them with `role: 'G'` on the same Player type. They
//      become `GoalieActor`, which is what stops them being offered as an
//      ordinary pass target by anything reading the actor list.
//
//   4. TIMING. v2 stored `at` and `arrivalAt` as fractions of an unspecified
//      duration. v3 stores seconds, so every fraction is multiplied by the
//      drill's own duration rather than by a constant.
//
// The migration is IDEMPOTENT: running it on its own output returns an
// equivalent document. That matters because it runs on load, and a document
// that drifts on every open is a document that eventually breaks.
// ============================================================================

import type { Drill, DrillEvent, Player, Point, SkatePath } from '@/core/types';
import { DEFAULT_DRILL_DURATION } from '@/core/constants';
import { DEFAULT_JERSEYS } from '@/core/types';
import {
  DRILL_SCHEMA_VERSION_3,
  type Actor,
  type ActorTrack,
  type DrillDocumentV3,
  type DrillPhase,
  type FinishPolicy,
  type MovementSegment,
  type PuckAction,
  type PuckSource,
  type PuckTrack,
  type SkaterPosition,
} from './types';

/** The single phase a migrated v2 drill becomes. */
export const MIGRATED_PHASE_ID = 'phase-1';

/**
 * Heuristic for the coach-as-player hack.
 *
 * Deliberately narrow. A real player numbered "C" playing centre is common, so
 * the id is the discriminator: the fixtures use the literal id `coach`, and a
 * player whose id says coach and who is not a goalie is the workaround rather
 * than a skater somebody happened to name that.
 */
export function looksLikeCoachHack(player: Player): boolean {
  return player.id.toLowerCase() === 'coach' && player.role !== 'G';
}

function durationOf(drill: Drill): number {
  const limit = drill.settings?.timeLimitSeconds;
  return limit && limit > 0 ? limit : DEFAULT_DRILL_DURATION;
}

function toActor(player: Player, duration: number): Actor {
  void duration;
  if (looksLikeCoachHack(player)) {
    return {
      kind: 'coach',
      id: player.id,
      position: { x: player.x, y: player.y },
      name: 'Coach',
    };
  }

  if (player.role === 'G') {
    return {
      kind: 'goalie',
      id: player.id,
      position: { x: player.x, y: player.y },
      team: player.team,
      number: player.number,
      handedness: player.visual?.handedness,
    };
  }

  return {
    kind: 'skater',
    id: player.id,
    position: { x: player.x, y: player.y },
    team: player.team,
    number: player.number,
    role: player.role as SkaterPosition,
    handedness: player.visual?.handedness,
  };
}

function toSegment(path: SkatePath, duration: number): MovementSegment {
  return {
    id: path.id,
    phaseId: MIGRATED_PHASE_ID,
    startAtSeconds: 0,
    // A v2 route had no authored duration; it took as long as the drill did.
    durationSeconds: duration,
    points: path.points.map(point => ({ ...point })),
    curve: path.shape ?? 'spline',
    movement:
      path.mode === 'backward' ? 'backward' : path.mode === 'glide' ? 'glide' : 'forward',
    finish: path.finish,
  };
}

function seconds(fraction: number | undefined, duration: number, fallback: number): number {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return fallback;
  return Math.max(0, fraction) * duration;
}

function toPuckAction(event: DrillEvent, duration: number): PuckAction {
  const base = {
    id: event.id,
    phaseId: MIGRATED_PHASE_ID,
    fromActorId: event.fromPlayerId,
    fromPoint: { ...event.fromPoint },
    releaseAt: seconds(event.at, duration, 0),
    arrivalAt: seconds(event.arrivalAt, duration, duration),
    waypoints: (event.waypoints ?? []).map(point => ({ ...point })),
    shape: event.shape ?? ('spline' as const),
  };

  switch (event.type) {
    case 'pass':
      return {
        ...base,
        type: 'pass',
        toActorId: event.toPlayerId,
        // Every v2 pass named a receiver; there was no way to author one to
        // space, which is why `space` never appears in a migrated document.
        targetMode: 'actor',
        target: { ...event.toPoint },
        passType: 'flat',
        receiveMode: 'control',
        ...(event.catchResult ? { catchResult: event.catchResult } : {}),
      };

    case 'shot':
      return {
        ...base,
        type: 'shot',
        target: { ...event.toPoint },
        targetNet: event.targetNet === 'L' ? 'left' : 'right',
        ...(event.result ? { result: event.result } : {}),
        ...(event.auto ? { auto: true } : {}),
      };

    case 'dump':
      return {
        ...base,
        type: 'dump',
        target: { ...event.toPoint },
        dumpStyle: 'dump',
      };

    case 'pickup':
      return { ...base, type: 'pickup', target: { ...event.toPoint } };
  }
}

/**
 * Where the puck starts.
 *
 * A coach source is the point of the exercise: the v2 fixtures had to give a
 * fake skater the puck because there was no other way to say it.
 */
function initialSourceFor(drill: Drill, actors: Actor[]): PuckSource {
  const carrier = drill.players.find(player => player.hasPuck);
  if (!carrier) {
    const first = drill.events[0];
    return first
      ? { kind: 'actor', actorId: first.fromPlayerId }
      : { kind: 'loose', at: { x: 0, y: 0 } };
  }

  const actor = actors.find(item => item.id === carrier.id);
  return actor?.kind === 'coach'
    ? { kind: 'coach', actorId: carrier.id }
    : { kind: 'actor', actorId: carrier.id };
}

/**
 * The finish policy this drill was authored under.
 *
 * A v2 settings value wins. Otherwise a derived shot in the event list is the
 * evidence: the drill was built while every play was forced to end with one.
 */
function finishPolicyFor(drill: Drill): FinishPolicy {
  const stored = drill.settings?.finishPolicy;
  if (stored) return stored;
  return drill.events.some(event => event.type === 'shot' && event.auto === true)
    ? 'finish-with-shot'
    : 'none';
}

function countSkaters(actors: Actor[]): number {
  return actors.filter(actor => actor.kind === 'skater').length;
}

// ----------------------------------------------------------------------------

/** True when the value is already a v3 document. */
export function isV3(value: unknown): value is DrillDocumentV3 {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { schemaVersion?: unknown }).schemaVersion === DRILL_SCHEMA_VERSION_3
  );
}

/**
 * Migrate a v2 drill to v3.
 *
 * Idempotent: given a v3 document it is returned unchanged, so this is safe to
 * call on every load without the document drifting.
 */
export function migrateV2ToV3(input: Drill | DrillDocumentV3): DrillDocumentV3 {
  if (isV3(input)) return input;

  const drill = input;
  const duration = durationOf(drill);
  const actors: Actor[] = drill.players.map(player => toActor(player, duration));

  // v2 coach markers were decoration - they could not source a puck - but they
  // are still people on the ice and become coach actors too.
  for (const marker of drill.coaches ?? []) {
    actors.push({
      kind: 'coach',
      id: marker.id,
      position: { x: marker.x, y: marker.y },
      name: marker.name,
    });
  }

  const finishPolicy = finishPolicyFor(drill);

  const phase: DrillPhase = {
    id: MIGRATED_PHASE_ID,
    label: 'Whole drill',
    order: 0,
    startAtSeconds: 0,
    durationSeconds: duration,
    // One pass through. v2 had no way to express a repeat, so claiming one
    // here would be inventing coaching intent that was never authored.
    repeatCount: 1,
    finishPolicy,
  };

  // One route per player becomes one track with one segment. The point of v3
  // is that a second segment can now be added; the migration does not add one.
  const trackByActor = new Map<string, ActorTrack>();
  for (const path of drill.skatePaths) {
    if (!path.points || path.points.length < 2) continue;
    const existing = trackByActor.get(path.ownerId);
    const segment = toSegment(path, duration);
    if (existing) existing.segments.push(segment);
    else trackByActor.set(path.ownerId, { actorId: path.ownerId, segments: [segment] });
  }

  // The single linear event chain becomes exactly one puck track. A drill with
  // two pucks is now expressible, but a v2 drill never had two.
  const puckTracks: PuckTrack[] = [];
  if (drill.events.length > 0 || drill.players.some(player => player.hasPuck)) {
    puckTracks.push({
      id: 'puck-1',
      initialSource: initialSourceFor(drill, actors),
      actions: drill.events.map(event => toPuckAction(event, duration)),
    });
  }

  const skaters = countSkaters(actors);
  const goalies = actors.filter(actor => actor.kind === 'goalie').length;

  return {
    schemaVersion: DRILL_SCHEMA_VERSION_3,
    id: drill.id,
    metadata: {
      title: drill.name,
      summary: '',
      categories: [],
      tags: [],
      ageBands: [],
      skillLevel: 'developing',
      rinkArea: 'full',
      durationMinutes: Math.max(1, Math.round(duration / 60)),
      skaterCount: { min: skaters, max: skaters },
      goalieCount: goalies,
      equipmentSummary: [],
      setupNotes: [],
      coachingPoints: [],
      progressions: [],
      variations: [],
    },
    rink: { area: 'full', orientation: 'horizontal', nets: ['left', 'right'] },
    actors,
    groups: [],
    // v2 had no equipment at all, so there is none to carry across.
    equipment: [],
    phases: [phase],
    actorTracks: [...trackByActor.values()],
    puckTracks,
    annotations: [],
    presentation: {
      durationSeconds: duration,
      jerseys: {
        home: drill.settings?.jerseys?.home ?? DEFAULT_JERSEYS.home,
        away: drill.settings?.jerseys?.away ?? DEFAULT_JERSEYS.away,
      },
      reducedEffects: drill.settings?.reducedEffects ?? false,
      defaultView: '2d',
      showPlayerNumbers: true,
    },
    createdAt: drill.createdAt,
    updatedAt: drill.updatedAt,
  };
}

/** Points cloned so a migrated document never aliases its source. */
export function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}
