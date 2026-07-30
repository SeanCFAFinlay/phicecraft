// ============================================================================
// V3 STRUCTURAL SCHEMA
//
// The strict shape a v3 drill document must have to be stored. Everything
// crossing the import boundary is parsed as `unknown` and must survive this
// schema before it is written; nothing here throws on bad input, it reports.
//
// `validateV3Document` (see ./validation.ts) checks graph coherence of an
// already-typed document - actors referring to actors that exist, phases
// referring to phases that exist. This file is upstream of that: it is the
// gate that decides whether the input is even a `DrillDocumentV3` shape at
// all, the way `src/persistence/schema.ts` gates v2.
// ============================================================================

import { z } from 'zod';
import type {
  Actor,
  ActorGroup,
  ActorTrack,
  Annotation,
  DrillDocumentV3,
  DrillMetadata,
  DrillPhase,
  EquipmentItem,
  MovementSegment,
  PresentationSettings,
  PuckAction,
  PuckSource,
  PuckTrack,
  RinkConfiguration,
} from './types';

// ----------------------------------------------------------------------------
// Primitives
// ----------------------------------------------------------------------------

const point = z.object({ x: z.number(), y: z.number() });
const id = z.string().min(1);

const drillCategory = z.enum([
  'passing',
  'warm-up',
  'small-area-game',
  'transition',
  'rush',
  'breakout',
  'forecheck',
  'defensive-zone',
  'power-play',
  'penalty-kill',
  'skating',
  'puck-handling',
  'shooting',
  'goalie',
  'battle',
  'conditioning',
]);

const ageBand = z.enum(['u7', 'u9', 'u11', 'u13', 'u15', 'u18', 'adult']);
const skillLevel = z.enum(['beginner', 'developing', 'advanced', 'elite']);
const rinkArea = z.enum(['full', 'half', 'third', 'quarter', 'station']);
const team = z.enum(['home', 'away']);
const curveShape = z.enum(['spline', 'polyline']);

// ----------------------------------------------------------------------------
// Metadata
// ----------------------------------------------------------------------------

const drillMetadata: z.ZodType<DrillMetadata> = z.object({
  title: z.string(),
  summary: z.string(),
  categories: z.array(drillCategory),
  tags: z.array(z.string()),
  ageBands: z.array(ageBand),
  skillLevel,
  rinkArea,
  durationMinutes: z.number(),
  skaterCount: z.object({ min: z.number(), max: z.number() }),
  goalieCount: z.number(),
  equipmentSummary: z.array(z.string()),
  setupNotes: z.array(z.string()),
  coachingPoints: z.array(z.string()),
  progressions: z.array(z.string()),
  variations: z.array(z.string()),
  source: z
    .object({
      author: z.string(),
      license: z.string(),
      reference: z.string().optional(),
    })
    .optional(),
}) satisfies z.ZodType<DrillMetadata>;

// ----------------------------------------------------------------------------
// Rink
// ----------------------------------------------------------------------------

const rinkConfiguration: z.ZodType<RinkConfiguration> = z.object({
  area: rinkArea,
  orientation: z.enum(['horizontal', 'vertical']),
  nets: z.array(z.enum(['left', 'right'])),
}) satisfies z.ZodType<RinkConfiguration>;

// ----------------------------------------------------------------------------
// Actors
// ----------------------------------------------------------------------------

const skaterPosition = z.enum(['C', 'LW', 'RW', 'D', 'F']);
const handedness = z.enum(['left', 'right']);

const actorBaseFields = {
  id,
  position: point,
  label: z.string().optional(),
};

const skaterActor = z.object({
  ...actorBaseFields,
  kind: z.literal('skater'),
  team,
  number: z.string(),
  role: skaterPosition,
  handedness: handedness.optional(),
  groupId: id.optional(),
});

const goalieActor = z.object({
  ...actorBaseFields,
  kind: z.literal('goalie'),
  team,
  number: z.string(),
  handedness: handedness.optional(),
});

const coachActor = z.object({
  ...actorBaseFields,
  kind: z.literal('coach'),
  name: z.string().optional(),
});

const actor: z.ZodType<Actor> = z.discriminatedUnion('kind', [
  skaterActor,
  goalieActor,
  coachActor,
]) satisfies z.ZodType<Actor>;

const actorGroup: z.ZodType<ActorGroup> = z.object({
  id,
  label: z.string(),
  kind: z.enum(['line', 'pair', 'queue', 'group']),
}) satisfies z.ZodType<ActorGroup>;

// ----------------------------------------------------------------------------
// Equipment
// ----------------------------------------------------------------------------

const equipmentKind = z.enum([
  'cone',
  'tire',
  'gate',
  'mini-net',
  'barrier',
  'puck-pile',
  'start-marker',
  'queue-marker',
  'zone',
]);

const equipmentItem: z.ZodType<EquipmentItem> = z.object({
  id,
  kind: equipmentKind,
  position: point,
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  rotation: z.number().optional(),
  label: z.string().optional(),
  count: z.number().optional(),
}) satisfies z.ZodType<EquipmentItem>;

// ----------------------------------------------------------------------------
// Phases
// ----------------------------------------------------------------------------

const finishPolicy = z.enum([
  'none',
  'stop-after-sequence',
  'loop',
  'finish-with-shot',
  'finish-with-zone-entry',
  'finish-with-possession',
]);

const drillPhase: z.ZodType<DrillPhase> = z.object({
  id,
  label: z.string(),
  order: z.number(),
  startAtSeconds: z.number(),
  durationSeconds: z.number(),
  repeatCount: z.number(),
  simultaneousGroup: z.string().optional(),
  finishPolicy,
  notes: z.string().optional(),
}) satisfies z.ZodType<DrillPhase>;

// ----------------------------------------------------------------------------
// Movement
// ----------------------------------------------------------------------------

const movementKind = z.enum(['forward', 'backward', 'glide', 'pivot', 'stop', 'lateral']);

const movementSegment: z.ZodType<MovementSegment> = z.object({
  id,
  phaseId: id,
  startAtSeconds: z.number(),
  durationSeconds: z.number(),
  points: z.array(point),
  curve: curveShape,
  movement: movementKind,
  finish: z.enum(['coast', 'stop']).optional(),
  loop: z.boolean().optional(),
  delaySeconds: z.number().optional(),
}) satisfies z.ZodType<MovementSegment>;

const actorTrack: z.ZodType<ActorTrack> = z.object({
  actorId: id,
  segments: z.array(movementSegment),
}) satisfies z.ZodType<ActorTrack>;

// ----------------------------------------------------------------------------
// Puck actions
// ----------------------------------------------------------------------------

const passType = z.enum(['flat', 'saucer', 'bank', 'rim', 'one-touch']);
const receiveMode = z.enum(['control', 'one-touch', 'redirect', 'leave']);

const puckActionBaseFields = {
  id,
  phaseId: id,
  fromActorId: id,
  fromPoint: point,
  releaseAt: z.number(),
  arrivalAt: z.number(),
  waypoints: z.array(point),
  shape: curveShape,
  notes: z.string().optional(),
};

const passAction = z.object({
  ...puckActionBaseFields,
  type: z.literal('pass'),
  toActorId: id.optional(),
  targetMode: z.enum(['actor', 'space']),
  target: point,
  passType,
  receiveMode,
  speedFtPerSecond: z.number().optional(),
  catchResult: z.enum(['caught', 'missed']).optional(),
});

const shotAction = z.object({
  ...puckActionBaseFields,
  type: z.literal('shot'),
  target: point,
  targetNet: z.enum(['left', 'right']),
  shotType: z.enum(['wrist', 'snap', 'slap', 'backhand', 'tip']).optional(),
  result: z.enum(['goal', 'save', 'rebound', 'wide', 'post']).optional(),
  auto: z.boolean().optional(),
});

const dumpAction = z.object({
  ...puckActionBaseFields,
  type: z.literal('dump'),
  target: point,
  dumpStyle: z.enum(['dump', 'rim', 'chip', 'flip']),
});

const pickupAction = z.object({
  ...puckActionBaseFields,
  type: z.literal('pickup'),
  target: point,
});

const turnoverAction = z.object({
  ...puckActionBaseFields,
  type: z.literal('turnover'),
  toActorId: id,
  target: point,
});

const puckAction: z.ZodType<PuckAction> = z.discriminatedUnion('type', [
  passAction,
  shotAction,
  dumpAction,
  pickupAction,
  turnoverAction,
]) satisfies z.ZodType<PuckAction>;

const puckSource: z.ZodType<PuckSource> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('actor'), actorId: id }),
  z.object({ kind: z.literal('coach'), actorId: id }),
  z.object({ kind: z.literal('equipment'), equipmentId: id }),
  z.object({ kind: z.literal('loose'), at: point }),
]) satisfies z.ZodType<PuckSource>;

const puckTrack: z.ZodType<PuckTrack> = z.object({
  id,
  label: z.string().optional(),
  initialSource: puckSource,
  actions: z.array(puckAction),
}) satisfies z.ZodType<PuckTrack>;

// ----------------------------------------------------------------------------
// Annotations
// ----------------------------------------------------------------------------

const annotation: z.ZodType<Annotation> = z.object({
  id,
  kind: z.enum(['text', 'arrow', 'zone', 'number']),
  position: point,
  text: z.string().optional(),
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  color: z.string().optional(),
  phaseId: id.optional(),
}) satisfies z.ZodType<Annotation>;

// ----------------------------------------------------------------------------
// Presentation
// ----------------------------------------------------------------------------

const presentationSettings: z.ZodType<PresentationSettings> = z.object({
  durationSeconds: z.number(),
  jerseys: z.object({ home: z.string(), away: z.string() }),
  reducedEffects: z.boolean(),
  defaultView: z.enum(['2d', '3d']),
  showPlayerNumbers: z.boolean(),
}) satisfies z.ZodType<PresentationSettings>;

// ----------------------------------------------------------------------------
// The document
// ----------------------------------------------------------------------------

/**
 * The document shape the repository will store. A value that fails this is
 * never written; it goes to the recovery store instead.
 *
 * The `z.ZodType<DrillDocumentV3>` annotation is the drift guard: `tsc` fails
 * the build if this schema stops matching the interface in `./types`.
 */
export const drillDocumentV3Schema: z.ZodType<DrillDocumentV3> = z.object({
  schemaVersion: z.literal(3),
  id,
  metadata: drillMetadata,
  rink: rinkConfiguration,
  actors: z.array(actor),
  groups: z.array(actorGroup),
  equipment: z.array(equipmentItem),
  phases: z.array(drillPhase),
  actorTracks: z.array(actorTrack),
  puckTracks: z.array(puckTrack),
  annotations: z.array(annotation),
  presentation: presentationSettings,
  createdAt: z.number(),
  updatedAt: z.number(),
  templateId: id.optional(),
}) satisfies z.ZodType<DrillDocumentV3>;

export function parseDrillDocumentV3(
  input: unknown
): { ok: true; document: DrillDocumentV3 } | { ok: false; message: string } {
  const result = drillDocumentV3Schema.safeParse(input);
  if (result.success) return { ok: true, document: result.data };
  return {
    ok: false,
    message: result.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .slice(0, 5)
      .join('; '),
  };
}
