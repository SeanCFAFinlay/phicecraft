// ============================================================================
// DRILL DOCUMENT, VERSION 3
//
// The document a coach actually authors, described independently of any
// renderer. Version 2 could not represent the drills this product exists to
// hold, and the limits were structural rather than cosmetic:
//
//   - ONE route per player, so nobody could skate, receive, pivot and go again
//   - ONE linear puck chain, so two stations could not run at once and there
//     could never be two pucks
//   - no phases, so nothing could repeat, loop, or be grouped
//   - no equipment, so cones, gates, tires and mini-nets did not exist
//   - no metadata, so a library could not search, filter or describe anything
//   - a coach had to be modelled as a skater with `hasPuck` to start a drill
//
// Every one of those is a hockey concept, not a UI concern, so they live here.
//
// Nothing in this file knows about canvases, Pixi, Three, React or IndexedDB.
// The rule that kept v2 honest applies here too: rules about hockey belong in
// the domain, and everything else reads them.
// ============================================================================

import type { CurveShape, Point, Team } from '@/core/types';

export type ID = string;

export const DRILL_SCHEMA_VERSION_3 = 3 as const;

// ----------------------------------------------------------------------------
// Metadata — what makes a drill findable and usable
// ----------------------------------------------------------------------------

export type DrillCategory =
  | 'passing'
  | 'warm-up'
  | 'small-area-game'
  | 'transition'
  | 'rush'
  | 'breakout'
  | 'forecheck'
  | 'defensive-zone'
  | 'power-play'
  | 'penalty-kill'
  | 'skating'
  | 'puck-handling'
  | 'shooting'
  | 'goalie'
  | 'battle'
  | 'conditioning';

/** Grouped the way youth associations actually band ages. */
export type AgeBand = 'u7' | 'u9' | 'u11' | 'u13' | 'u15' | 'u18' | 'adult';

export type SkillLevel = 'beginner' | 'developing' | 'advanced' | 'elite';

/** How much sheet the drill needs. Drives the portrait view choice. */
export type RinkArea = 'full' | 'half' | 'third' | 'quarter' | 'station';

export interface DrillMetadata {
  title: string;
  summary: string;
  categories: DrillCategory[];
  tags: string[];
  ageBands: AgeBand[];
  skillLevel: SkillLevel;
  rinkArea: RinkArea;
  durationMinutes: number;
  skaterCount: { min: number; max: number };
  goalieCount: number;
  equipmentSummary: string[];
  setupNotes: string[];
  coachingPoints: string[];
  progressions: string[];
  variations: string[];
  /**
   * Where the drill came from. Required for anything shipped in the catalogue:
   * a template with no recorded provenance is not cleared to distribute.
   */
  source?: { author: string; license: string; reference?: string };
}

// ----------------------------------------------------------------------------
// Rink
// ----------------------------------------------------------------------------

export interface RinkConfiguration {
  /** Which part of the sheet the drill is authored on. */
  area: RinkArea;
  /**
   * Authoring orientation. A portrait phone showing a full sheet horizontally
   * gets a strip; rotating the board is one of the two fixes for that.
   */
  orientation: 'horizontal' | 'vertical';
  /** Nets present on the ice. A small-area game may have none, or two mini-nets. */
  nets: ('left' | 'right')[];
}

// ----------------------------------------------------------------------------
// Actors
//
// Everyone on the ice, including people who never skate. A coach used to be
// faked as a skater with `hasPuck: true` purely so a drill could start with a
// coach dump - a model workaround that made the coach a pass target, a
// simulated body and a member of a team.
// ----------------------------------------------------------------------------

export type SkaterPosition = 'C' | 'LW' | 'RW' | 'D' | 'F';

interface ActorBase {
  id: ID;
  /** Where the actor starts. */
  position: Point;
  label?: string;
}

export interface SkaterActor extends ActorBase {
  kind: 'skater';
  team: Team;
  number: string;
  role: SkaterPosition;
  handedness?: 'left' | 'right';
  /**
   * Which group this actor belongs to - a forward line, a D pair, or the queue
   * at a particular cone. Groups are what let a drill say "the next three go".
   */
  groupId?: ID;
}

export interface GoalieActor extends ActorBase {
  kind: 'goalie';
  team: Team;
  number: string;
  handedness?: 'left' | 'right';
}

/**
 * A coach. Never skates, never receives a pass, never appears in possession -
 * but MAY start a puck track, which is the whole reason the v2 hack existed.
 */
export interface CoachActor extends ActorBase {
  kind: 'coach';
  name?: string;
}

export type Actor = SkaterActor | GoalieActor | CoachActor;

export function isSkater(actor: Actor): actor is SkaterActor {
  return actor.kind === 'skater';
}
export function isGoalie(actor: Actor): actor is GoalieActor {
  return actor.kind === 'goalie';
}
export function isCoach(actor: Actor): actor is CoachActor {
  return actor.kind === 'coach';
}
/** Actors that occupy the ice as players. Coaches do not. */
export function isOnIce(actor: Actor): actor is SkaterActor | GoalieActor {
  return actor.kind === 'skater' || actor.kind === 'goalie';
}

/** A line, a D pair, or a queue waiting at a cone. */
export interface ActorGroup {
  id: ID;
  label: string;
  kind: 'line' | 'pair' | 'queue' | 'group';
}

// ----------------------------------------------------------------------------
// Equipment
//
// Absent entirely from v2, which is why gates drills, tire targets, cone
// courses and station circuits could not be drawn at all.
// ----------------------------------------------------------------------------

export type EquipmentKind =
  | 'cone'
  | 'tire'
  | 'gate'
  | 'mini-net'
  | 'barrier'
  | 'puck-pile'
  | 'start-marker'
  | 'queue-marker'
  | 'zone';

export interface EquipmentItem {
  id: ID;
  kind: EquipmentKind;
  position: Point;
  /** Gates, barriers and zones have extent; a cone does not. */
  size?: { width: number; height: number };
  rotation?: number;
  label?: string;
  /** How many pucks are in the pile. Only meaningful for `puck-pile`. */
  count?: number;
}

// ----------------------------------------------------------------------------
// Phases
//
// A phase is a slice of the drill that can repeat, loop, or run at the same
// time as another. Without them every authored action was globally sequential,
// so two stations could not operate at once and nothing could cycle.
// ----------------------------------------------------------------------------

/**
 * How a phase, and therefore a drill, is meant to end.
 *
 * Only `finish-with-shot` derives a puck action. The rest record intent. This
 * mirrors `FinishPolicy` in the v2 settings, which was the Phase 1 stopgap.
 */
export type FinishPolicy =
  | 'none'
  | 'stop-after-sequence'
  | 'loop'
  | 'finish-with-shot'
  | 'finish-with-zone-entry'
  | 'finish-with-possession';

export interface DrillPhase {
  id: ID;
  label: string;
  order: number;
  startAtSeconds: number;
  durationSeconds: number;
  /** 1 means "run it once". Higher values are a cycle. */
  repeatCount: number;
  /**
   * Phases sharing a group run CONCURRENTLY. This is how a drill says "these
   * two stations operate at the same time" rather than one after the other.
   */
  simultaneousGroup?: string;
  finishPolicy: FinishPolicy;
  notes?: string;
}

// ----------------------------------------------------------------------------
// Movement
//
// v2 stored one `SkatePath` per player and the reducer replaced it whenever a
// second was drawn, so a player could never skate, stop, receive, pivot and go
// again. A track is a list of segments, each anchored to a phase and a time.
// ----------------------------------------------------------------------------

export type MovementKind = 'forward' | 'backward' | 'glide' | 'pivot' | 'stop' | 'lateral';

export interface MovementSegment {
  id: ID;
  phaseId: ID;
  startAtSeconds: number;
  durationSeconds: number;
  /** Control points, expanded through `curve` by the renderer and the sim. */
  points: Point[];
  curve: CurveShape;
  movement: MovementKind;
  /** Repeat this segment until the phase ends - a shuttle or a circle. */
  loop?: boolean;
  /** Wait here before starting, e.g. a queue releasing on a whistle. */
  delaySeconds?: number;
}

export interface ActorTrack {
  actorId: ID;
  segments: MovementSegment[];
}

// ----------------------------------------------------------------------------
// Puck actions
//
// v2 had pass, shot, dump and pickup on ONE chain. A drill may have several
// pucks moving independently, and a pass is not one thing: a saucer over a
// stick, a bank off the boards and a rim around them are different coaching
// points and should not all be drawn as a straight line.
// ----------------------------------------------------------------------------

export type PassType = 'flat' | 'saucer' | 'bank' | 'rim' | 'one-touch';

/** What the receiver is expected to do with it. */
export type ReceiveMode = 'control' | 'one-touch' | 'redirect' | 'leave';

interface PuckActionBase {
  id: ID;
  phaseId: ID;
  fromActorId: ID;
  fromPoint: Point;
  releaseAt: number;
  arrivalAt: number;
  /** Control points between the endpoints. The puck flies this line. */
  waypoints: Point[];
  shape: CurveShape;
  notes?: string;
}

export interface PassAction extends PuckActionBase {
  type: 'pass';
  /**
   * Absent when `targetMode` is `space`. A pass to open ice is a first-class
   * hockey action - the coach is passing to where a player WILL be - and not a
   * failed pass to a person.
   */
  toActorId?: ID;
  targetMode: 'actor' | 'space';
  target: Point;
  passType: PassType;
  receiveMode: ReceiveMode;
  /** Authored puck speed. Absent means the engine chooses. */
  speedFtPerSecond?: number;
  catchResult?: 'caught' | 'missed';
}

export interface ShotAction extends PuckActionBase {
  type: 'shot';
  target: Point;
  targetNet: 'left' | 'right';
  shotType?: 'wrist' | 'snap' | 'slap' | 'backhand' | 'tip';
  result?: 'goal' | 'save' | 'rebound' | 'wide' | 'post';
  /** True when the phase's finish policy derived this rather than the coach. */
  auto?: boolean;
}

/** Puck sent to an area with no intended receiver: a dump-in or a chip out. */
export interface DumpAction extends PuckActionBase {
  type: 'dump';
  target: Point;
  dumpStyle: 'dump' | 'rim' | 'chip' | 'flip';
}

export interface PickupAction extends PuckActionBase {
  type: 'pickup';
  target: Point;
}

/** Possession changes hands. Small-area games are full of these. */
export interface TurnoverAction extends PuckActionBase {
  type: 'turnover';
  toActorId: ID;
  target: Point;
}

export type PuckAction =
  | PassAction
  | ShotAction
  | DumpAction
  | PickupAction
  | TurnoverAction;

/** Where a puck track begins. A coach source is why `CoachActor` exists. */
export type PuckSource =
  | { kind: 'actor'; actorId: ID }
  | { kind: 'coach'; actorId: ID }
  | { kind: 'equipment'; equipmentId: ID }
  | { kind: 'loose'; at: Point };

export interface PuckTrack {
  id: ID;
  label?: string;
  initialSource: PuckSource;
  actions: PuckAction[];
}

// ----------------------------------------------------------------------------
// Annotations
// ----------------------------------------------------------------------------

export interface Annotation {
  id: ID;
  kind: 'text' | 'arrow' | 'zone' | 'number';
  position: Point;
  text?: string;
  size?: { width: number; height: number };
  color?: string;
  phaseId?: ID;
}

// ----------------------------------------------------------------------------
// Presentation
// ----------------------------------------------------------------------------

export interface PresentationSettings {
  /** Seconds the whole drill runs for at 1x. */
  durationSeconds: number;
  jerseys: { home: string; away: string };
  reducedEffects: boolean;
  /** Preferred playback view. 3D is optional and never required. */
  defaultView: '2d' | '3d';
  showPlayerNumbers: boolean;
}

// ----------------------------------------------------------------------------
// The document
// ----------------------------------------------------------------------------

export interface DrillDocumentV3 {
  schemaVersion: typeof DRILL_SCHEMA_VERSION_3;
  id: ID;
  metadata: DrillMetadata;
  rink: RinkConfiguration;
  actors: Actor[];
  groups: ActorGroup[];
  equipment: EquipmentItem[];
  phases: DrillPhase[];
  actorTracks: ActorTrack[];
  puckTracks: PuckTrack[];
  annotations: Annotation[];
  presentation: PresentationSettings;
  createdAt: number;
  updatedAt: number;
  /**
   * Templates are immutable. Using one creates a user-owned copy with fresh
   * ids, and this records where the copy came from.
   */
  templateId?: ID;
}

// ----------------------------------------------------------------------------
// Convenience
// ----------------------------------------------------------------------------

export function findActor(document: DrillDocumentV3, actorId: ID): Actor | null {
  return document.actors.find(actor => actor.id === actorId) ?? null;
}

/** Segments in the order they are skated. */
export function orderedSegments(track: ActorTrack): MovementSegment[] {
  return [...track.segments].sort((a, b) => a.startAtSeconds - b.startAtSeconds);
}

/** Actions in the order the puck takes them. */
export function orderedActions(track: PuckTrack): PuckAction[] {
  return [...track.actions].sort((a, b) => a.releaseAt - b.releaseAt);
}

/** Phases in running order, with concurrent ones kept adjacent. */
export function orderedPhases(document: DrillDocumentV3): DrillPhase[] {
  return [...document.phases].sort((a, b) => a.order - b.order || a.startAtSeconds - b.startAtSeconds);
}

/** Phases that run at the same time as `phase`, excluding itself. */
export function concurrentPhases(document: DrillDocumentV3, phase: DrillPhase): DrillPhase[] {
  if (!phase.simultaneousGroup) return [];
  return document.phases.filter(
    other => other.id !== phase.id && other.simultaneousGroup === phase.simultaneousGroup
  );
}

/** Every puck in the drill. More than one is normal, not exceptional. */
export function puckCount(document: DrillDocumentV3): number {
  return document.puckTracks.length;
}
