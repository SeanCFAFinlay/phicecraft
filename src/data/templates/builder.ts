// ============================================================================
// AUTHORING A TEMPLATE
//
// A drill template is a v3 document plus the metadata that makes it findable.
// Written out longhand, each one is a couple of hundred lines of ids, phase
// references and timing arithmetic - which is how a catalogue ends up with
// four drills in it.
//
// These helpers exist so a template reads as the drill it describes: who is on
// the ice, where they skate, and what the puck does. Ids, phase wiring and
// timing are derived. Everything produced here is a real `DrillDocumentV3` and
// is checked by `validateV3Document` in the registry test, so a shorthand that
// produces an incoherent document fails the build rather than shipping.
//
// LANDMARKS, so drills can be placed on real ice rather than by eye:
//
//   goal lines      x = 55  and 945          blue lines   x = 375 and 625
//   centre          (500, 212.5)             end faceoff  x = 155 and 845
//   faceoff y       102.5 and 322.5          neutral dots x = 350 and 650
//   boards          y = 0 and 425
// ============================================================================

import type { Point, Team } from '@/core/types';
import {
  DRILL_SCHEMA_VERSION_3,
  type Actor,
  type ActorTrack,
  type AgeBand,
  type Annotation,
  type DrillCategory,
  type DrillDocumentV3,
  type DrillPhase,
  type EquipmentItem,
  type EquipmentKind,
  type FinishPolicy,
  type MovementKind,
  type MovementSegment,
  type PassType,
  type PuckAction,
  type PuckSource,
  type PuckTrack,
  type RinkArea,
  type SkaterPosition,
  type SkillLevel,
} from '@/domain/v3/types';

export const RINK_LANDMARKS = {
  goalLineLeft: 55,
  goalLineRight: 945,
  blueLineLeft: 375,
  blueLineRight: 625,
  centreX: 500,
  centreY: 212.5,
  faceoffLeftX: 155,
  faceoffRightX: 845,
  faceoffTopY: 102.5,
  faceoffBottomY: 322.5,
  neutralLeftX: 350,
  neutralRightX: 650,
  topBoards: 40,
  bottomBoards: 385,
} as const;

const PHASE_ID = 'main';

// ----------------------------------------------------------------------------
// Actors
// ----------------------------------------------------------------------------

export function skater(
  id: string,
  team: Team,
  number: string,
  at: Point,
  role: SkaterPosition = 'F'
): Actor {
  return { kind: 'skater', id, team, number, role, position: { ...at } };
}

export function goalie(id: string, team: Team, number: string, at: Point): Actor {
  return { kind: 'goalie', id, team, number, position: { ...at } };
}

export function coach(id: string, at: Point, name = 'Coach'): Actor {
  return { kind: 'coach', id, name, position: { ...at } };
}

// ----------------------------------------------------------------------------
// Equipment
// ----------------------------------------------------------------------------

export function gear(
  id: string,
  kind: EquipmentKind,
  at: Point,
  extra: Partial<EquipmentItem> = {}
): EquipmentItem {
  return { id, kind, position: { ...at }, ...extra };
}

/** A line of cones, evenly spaced between two points. */
export function coneLine(idPrefix: string, from: Point, to: Point, count: number): EquipmentItem[] {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    return gear(`${idPrefix}-${index + 1}`, 'cone', {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
  });
}

// ----------------------------------------------------------------------------
// Movement
// ----------------------------------------------------------------------------

export interface RouteSpec {
  actorId: string;
  points: Point[];
  movement?: MovementKind;
  /** Seconds into the drill this leg begins. Defaults to following the last. */
  startAt?: number;
  durationSeconds?: number;
}

/** A single leg of skating. Several for one actor become several segments. */
export function route(
  actorId: string,
  points: Point[],
  options: Omit<RouteSpec, 'actorId' | 'points'> = {}
): RouteSpec {
  return { actorId, points, ...options };
}

// ----------------------------------------------------------------------------
// Puck actions
// ----------------------------------------------------------------------------

export interface ActionSpec {
  kind: 'pass' | 'shot' | 'dump' | 'pickup';
  from: string;
  to?: string;
  /** Where the puck ends up. Defaults to the receiver, or the attacked net. */
  target?: Point;
  passType?: PassType;
  /** Seconds. Defaults to following the previous action. */
  at?: number;
  flightSeconds?: number;
  waypoints?: Point[];
}

export function pass(from: string, to: string, options: Partial<ActionSpec> = {}): ActionSpec {
  return { kind: 'pass', from, to, ...options };
}

export function passToSpace(from: string, target: Point, options: Partial<ActionSpec> = {}): ActionSpec {
  return { kind: 'pass', from, target, ...options };
}

export function shot(from: string, options: Partial<ActionSpec> = {}): ActionSpec {
  return { kind: 'shot', from, ...options };
}

export function dump(from: string, target: Point, options: Partial<ActionSpec> = {}): ActionSpec {
  return { kind: 'dump', from, target, ...options };
}

export function pickup(from: string, options: Partial<ActionSpec> = {}): ActionSpec {
  return { kind: 'pickup', from, ...options };
}

// ----------------------------------------------------------------------------
// The template
// ----------------------------------------------------------------------------

export interface TemplateSpec {
  id: string;
  title: string;
  summary: string;
  categories: DrillCategory[];
  tags: string[];
  ageBands: AgeBand[];
  skillLevel: SkillLevel;
  rinkArea: RinkArea;
  durationMinutes: number;
  goalieCount?: number;
  setupNotes: string[];
  coachingPoints: string[];
  progressions?: string[];
  variations?: string[];
  equipmentSummary?: string[];

  actors: Actor[];
  equipment?: EquipmentItem[];
  routes?: RouteSpec[];
  annotations?: Annotation[];

  /** Where the puck starts, and what happens to it. */
  puck?: { from: string; actions: ActionSpec[] };
  /** Extra pucks, for drills that run two at once. */
  extraPucks?: { from: string; actions: ActionSpec[] }[];

  finishPolicy: FinishPolicy;
  /** Seconds the drill runs for. Defaults to something sensible for its size. */
  durationSeconds?: number;
}

export interface DrillTemplate {
  id: string;
  document: DrillDocumentV3;
}

function attackedNet(actors: Actor[], actorId: string): Point {
  const actor = actors.find(item => item.id === actorId);
  const team = actor && actor.kind !== 'coach' ? actor.team : 'home';
  return team === 'home'
    ? { x: RINK_LANDMARKS.goalLineRight, y: RINK_LANDMARKS.centreY }
    : { x: RINK_LANDMARKS.goalLineLeft, y: RINK_LANDMARKS.centreY };
}

function positionOf(spec: TemplateSpec, actorId: string): Point {
  const actor = spec.actors.find(item => item.id === actorId);
  if (actor) return actor.position;
  return { x: RINK_LANDMARKS.centreX, y: RINK_LANDMARKS.centreY };
}

/**
 * Where an actor is when the puck reaches them.
 *
 * If they have a route, the puck meets them at the end of it, not at the spot
 * they started from - which is the difference between a drill that reads
 * correctly on the board and one where every pass points at an empty patch of
 * ice the receiver left several seconds ago.
 */
function arrivalPointFor(spec: TemplateSpec, actorId: string): Point {
  const routes = (spec.routes ?? []).filter(item => item.actorId === actorId);
  const last = routes[routes.length - 1];
  const end = last?.points[last.points.length - 1];
  return end ? { ...end } : positionOf(spec, actorId);
}

function buildTracks(spec: TemplateSpec, duration: number): ActorTrack[] {
  const byActor = new Map<string, MovementSegment[]>();

  for (const [index, item] of (spec.routes ?? []).entries()) {
    if (item.points.length < 2) continue;
    const existing = byActor.get(item.actorId) ?? [];
    // Legs run back to back unless the author placed one explicitly.
    const previous = existing[existing.length - 1];
    const startAt =
      item.startAt ?? (previous ? previous.startAtSeconds + previous.durationSeconds : 0);
    const durationSeconds = item.durationSeconds ?? Math.max(1, duration - startAt);

    existing.push({
      id: `seg-${item.actorId}-${index + 1}`,
      phaseId: PHASE_ID,
      startAtSeconds: startAt,
      durationSeconds,
      points: item.points.map(point => ({ ...point })),
      curve: 'spline',
      movement: item.movement ?? 'forward',
    });
    byActor.set(item.actorId, existing);
  }

  return [...byActor.entries()].map(([actorId, segments]) => ({ actorId, segments }));
}

function buildActions(
  spec: TemplateSpec,
  chain: { from: string; actions: ActionSpec[] },
  duration: number,
  idPrefix: string
): PuckAction[] {
  const actions: PuckAction[] = [];
  let clock = 0;

  for (const [index, item] of chain.actions.entries()) {
    const releaseAt = item.at ?? Math.max(clock + 0.25, 0.5);
    const flight = item.flightSeconds ?? 0.9;
    const arrivalAt = Math.min(duration, releaseAt + flight);
    clock = arrivalAt;

    const from = index === 0 ? positionOf(spec, item.from) : arrivalPointFor(spec, item.from);
    const base = {
      id: `${idPrefix}-${index + 1}`,
      phaseId: PHASE_ID,
      fromActorId: item.from,
      fromPoint: { ...from },
      releaseAt,
      arrivalAt,
      waypoints: (item.waypoints ?? []).map(point => ({ ...point })),
      shape: 'spline' as const,
    };

    if (item.kind === 'pass') {
      const target = item.target ?? (item.to ? arrivalPointFor(spec, item.to) : from);
      actions.push({
        ...base,
        type: 'pass',
        ...(item.to ? { toActorId: item.to } : {}),
        targetMode: item.to ? 'actor' : 'space',
        target: { ...target },
        passType: item.passType ?? 'flat',
        receiveMode: item.passType === 'one-touch' ? 'one-touch' : 'control',
      });
      continue;
    }

    if (item.kind === 'shot') {
      const target = item.target ?? attackedNet(spec.actors, item.from);
      actions.push({
        ...base,
        type: 'shot',
        target: { ...target },
        targetNet: target.x < RINK_LANDMARKS.centreX ? 'left' : 'right',
      });
      continue;
    }

    if (item.kind === 'dump') {
      actions.push({
        ...base,
        type: 'dump',
        target: { ...(item.target ?? from) },
        dumpStyle: 'dump',
      });
      continue;
    }

    actions.push({ ...base, type: 'pickup', target: { ...(item.target ?? from) } });
  }

  return actions;
}

function sourceFor(spec: TemplateSpec, actorId: string): PuckSource {
  const actor = spec.actors.find(item => item.id === actorId);
  return actor?.kind === 'coach'
    ? { kind: 'coach', actorId }
    : { kind: 'actor', actorId };
}

export function template(spec: TemplateSpec): DrillTemplate {
  const duration = spec.durationSeconds ?? (spec.rinkArea === 'full' ? 12 : 9);
  const skaters = spec.actors.filter(actor => actor.kind === 'skater').length;
  const goalies = spec.actors.filter(actor => actor.kind === 'goalie').length;

  const phase: DrillPhase = {
    id: PHASE_ID,
    label: spec.title,
    order: 0,
    startAtSeconds: 0,
    durationSeconds: duration,
    repeatCount: 1,
    finishPolicy: spec.finishPolicy,
  };

  const puckTracks: PuckTrack[] = [];
  if (spec.puck) {
    puckTracks.push({
      id: 'puck-1',
      initialSource: sourceFor(spec, spec.puck.from),
      actions: buildActions(spec, spec.puck, duration, 'act'),
    });
  }
  for (const [index, chain] of (spec.extraPucks ?? []).entries()) {
    puckTracks.push({
      id: `puck-${index + 2}`,
      initialSource: sourceFor(spec, chain.from),
      actions: buildActions(spec, chain, duration, `act${index + 2}`),
    });
  }

  const document: DrillDocumentV3 = {
    schemaVersion: DRILL_SCHEMA_VERSION_3,
    id: spec.id,
    metadata: {
      title: spec.title,
      summary: spec.summary,
      categories: spec.categories,
      tags: spec.tags,
      ageBands: spec.ageBands,
      skillLevel: spec.skillLevel,
      rinkArea: spec.rinkArea,
      durationMinutes: spec.durationMinutes,
      skaterCount: { min: skaters, max: skaters },
      goalieCount: spec.goalieCount ?? goalies,
      equipmentSummary: spec.equipmentSummary ?? [],
      setupNotes: spec.setupNotes,
      coachingPoints: spec.coachingPoints,
      progressions: spec.progressions ?? [],
      variations: spec.variations ?? [],
      source: { author: 'PhiceCraft', license: 'First-party' },
    },
    rink: {
      area: spec.rinkArea,
      orientation: 'horizontal',
      nets: ['left', 'right'],
    },
    actors: spec.actors,
    groups: [],
    equipment: spec.equipment ?? [],
    phases: [phase],
    actorTracks: buildTracks(spec, duration),
    puckTracks,
    annotations: spec.annotations ?? [],
    presentation: {
      durationSeconds: duration,
      jerseys: { home: '#e63946', away: '#2f80ed' },
      reducedEffects: false,
      defaultView: '2d',
      showPlayerNumbers: true,
    },
    createdAt: 0,
    updatedAt: 0,
  };

  return { id: spec.id, document };
}
