// ============================================================================
// PERSISTENCE SCHEMA
//
// The strict shape a drill must have to be stored. Everything crossing the
// import boundary is parsed as `unknown` and must survive this schema before it
// is written; nothing here throws on bad input, it reports.
// ============================================================================

import { z } from 'zod';
import type { Drill } from '@/core/types';

// ----------------------------------------------------------------------------
// Limits
//
// These bound an untrusted file so a hostile or corrupt import cannot exhaust
// memory or wedge the editor. They are deliberately far above any real drill.
// ----------------------------------------------------------------------------

export const IMPORT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxDrills: 100,
  maxPlayersPerDrill: 200,
  maxRoutesPerDrill: 500,
  maxEventsPerDrill: 1000,
  maxPointsPerRoute: 5000,
  /** A puck line bent through more than this is not a drill, it is a scribble. */
  maxWaypointsPerEvent: 50,
  maxCoachesPerDrill: 100,
  maxNameLength: 200,
} as const;

// ----------------------------------------------------------------------------
// Primitives
// ----------------------------------------------------------------------------

const finiteNumber = z.number().refine(Number.isFinite, 'must be a finite number');

const idSchema = z.string().min(1).max(200);

export const PointSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
});

const teamSchema = z.enum(['home', 'away']);
const roleSchema = z.enum(['C', 'LW', 'RW', 'D', 'G', 'F']);

const visualSchema = z.object({
  handedness: z.enum(['left', 'right']),
  visor: z.boolean(),
  jerseyTrim: z.string().max(64).optional(),
});

export const PlayerSchema = z.object({
  id: idSchema,
  x: finiteNumber,
  y: finiteNumber,
  team: teamSchema,
  number: z.string().min(1).max(8),
  role: roleSchema,
  hasPuck: z.boolean(),
  visual: visualSchema.optional(),
});

export const CoachSchema = z.object({
  id: idSchema,
  x: finiteNumber,
  y: finiteNumber,
  name: z.string().max(80).optional(),
});

// Routes and events use loose objects so a document written by a newer version
// of the app keeps its extra fields instead of being silently trimmed.
const shapeSchema = z.enum(['spline', 'polyline']);

export const SkatePathSchema = z.looseObject({
  id: idSchema,
  ownerId: idSchema,
  team: teamSchema,
  points: z.array(PointSchema).min(1).max(IMPORT_LIMITS.maxPointsPerRoute),
  shape: shapeSchema.optional(),
  mode: z.enum(['skate', 'glide', 'backward']).optional(),
  finish: z.enum(['coast', 'stop']).optional(),
});

const baseEventFields = {
  id: idSchema,
  fromPlayerId: idSchema,
  fromPoint: PointSchema,
  toPoint: PointSchema,
  team: teamSchema,
  at: finiteNumber.optional(),
  arrivalAt: finiteNumber.optional(),
  waypoints: z.array(PointSchema).max(IMPORT_LIMITS.maxWaypointsPerEvent).optional(),
  shape: shapeSchema.optional(),
};

export const PassEventSchema = z.looseObject({
  ...baseEventFields,
  type: z.literal('pass'),
  toPlayerId: idSchema,
  catchResult: z.enum(['caught', 'missed']).optional(),
  catchQuality: z.enum(['good', 'assisted', 'unreachable']).optional(),
});

export const ShotEventSchema = z.looseObject({
  ...baseEventFields,
  type: z.literal('shot'),
  targetNet: z.enum(['L', 'R']),
  result: z.enum(['goal', 'save', 'rebound', 'wide', 'post']).optional(),
  // Whether this is the shot the app maintains at the end of the play. It has
  // to survive a save: reloaded without it, a derived shot would read as one
  // the coach authored and would wrongly close the drill to further editing.
  auto: z.boolean().optional(),
});

export const DumpEventSchema = z.looseObject({
  ...baseEventFields,
  type: z.literal('dump'),
  targetNet: z.literal('dump'),
});

export const PickupEventSchema = z.looseObject({
  ...baseEventFields,
  type: z.literal('pickup'),
});

export const DrillEventSchema = z.discriminatedUnion('type', [
  PassEventSchema,
  ShotEventSchema,
  DumpEventSchema,
  PickupEventSchema,
]);

export const DrillSettingsSchema = z.looseObject({
  assistance: z.enum(['off', 'standard', 'high']),
  recovery: z.enum(['authored', 'nearest-teammate']),
  timeLimitSeconds: finiteNumber.min(1).max(600),
  reducedEffects: z.boolean(),
  jerseys: z
    .object({
      home: z.string().min(1).max(32),
      away: z.string().min(1).max(32),
    })
    .optional(),
});

/**
 * The document shape the repository will store. A value that fails this is
 * never written; it goes to the recovery store instead.
 */
export const DrillSchema = z.object({
  schemaVersion: z.literal(2),
  id: idSchema,
  name: z.string().min(1).max(IMPORT_LIMITS.maxNameLength),
  createdAt: finiteNumber,
  updatedAt: finiteNumber,
  players: z.array(PlayerSchema).max(IMPORT_LIMITS.maxPlayersPerDrill),
  skatePaths: z.array(SkatePathSchema).max(IMPORT_LIMITS.maxRoutesPerDrill),
  events: z.array(DrillEventSchema).max(IMPORT_LIMITS.maxEventsPerDrill),
  coaches: z.array(CoachSchema).max(IMPORT_LIMITS.maxCoachesPerDrill),
  settings: DrillSettingsSchema,
});

export type ParsedDrill = z.infer<typeof DrillSchema>;

export interface SchemaIssue {
  path: string;
  message: string;
}

/**
 * Validate a fully normalized drill against the storage schema.
 * Never throws, whatever `value` is.
 */
export function parseStorableDrill(
  value: unknown
): { ok: true; drill: Drill } | { ok: false; issues: SchemaIssue[] } {
  const result = DrillSchema.safeParse(value);
  if (result.success) {
    return { ok: true, drill: result.data as unknown as Drill };
  }
  return {
    ok: false,
    issues: result.error.issues.map(issue => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  };
}
