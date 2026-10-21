// ============================================================================
// PRACTICE SESSION & BUNDLE SCHEMA
//
// Strict Zod validation schemas for practice sessions, custom blocks,
// and portable practice bundles.
// ============================================================================

import { z } from 'zod';
import { drillDocumentV3Schema } from '@/domain/v3/schema';
import type { EquipmentDemand, PracticeBlock, PracticeSession, PracticeBundle } from './types';

const finiteNumber = z.number().refine(Number.isFinite, 'must be a finite number');

export const equipmentDemandSchema = z.object({
  kind: z.string().min(1).max(50),
  count: z.number().int().min(1).max(500),
}) as z.ZodType<EquipmentDemand>;

export const rinkAreaSchema = z.enum([
  'full',
  'half',
  'offensive',
  'defensive',
  'neutral',
  'station',
  'custom',
]);

export const stationSplitSchema = z.enum([
  'full',
  'station_a',
  'station_b',
  'station_c',
  'third_adm',
  'half_cross',
  'four_quadrants',
  'six_stations',
]);

export const practiceBlockSchema = z.object({
  id: z.string().min(1).max(100),
  drillId: z.string().max(100).optional(),
  title: z.string().min(1).max(200),
  durationMinutes: finiteNumber.refine(n => n > 0 && n <= 180, 'duration must be 1-180 minutes'),
  rinkArea: rinkAreaSchema,
  stationSplit: stationSplitSchema.optional(),
  drillSummary: z.string().max(2000).optional(),
  coachingPoints: z.array(z.string().max(500)).max(50),
  equipment: z.array(equipmentDemandSchema).max(50),
  notes: z.string().max(5000).optional(),
  objective: z.string().max(1000).optional(),
  instructions: z.string().max(5000).optional(),
  roles: z.array(z.string().max(50)).max(50).optional(),
  rotations: z.number().int().min(1).max(20).optional(),
  changeoverMinutes: z.number().min(0).max(60).optional(),
  retainedSetup: z.boolean().optional(),
  locked: z.boolean().optional(),
  pinnedRevision: drillDocumentV3Schema.optional(),
}) as z.ZodType<PracticeBlock>;

export const practiceSessionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  team: z.string().max(100),
  targetMinutes: finiteNumber.refine(n => n >= 5 && n <= 300, 'target minutes must be 5-300'),
  date: z.string().max(50).optional(),
  focus: z.string().max(500),
  blocks: z.array(practiceBlockSchema).max(100),
  createdAt: z.string().max(100),
  updatedAt: z.string().max(100),
  notes: z.string().max(5000).optional(),
}) as z.ZodType<PracticeSession>;

export const practiceBundleManifestSchema = z.object({
  formatVersion: z.literal('phicecraft-practice-bundle-v1'),
  exportedAt: z.string().max(100),
  appVersion: z.string().max(50),
  sessionCount: finiteNumber,
  snapshotCount: finiteNumber,
});

export const practiceBundleSchema = z.object({
  manifest: practiceBundleManifestSchema,
  practice: practiceSessionSchema,
  drillSnapshots: z.record(z.string(), drillDocumentV3Schema),
}) as z.ZodType<PracticeBundle>;

export interface SchemaIssue {
  path: string;
  message: string;
}

export function parsePracticeSession(
  value: unknown
): { ok: true; session: PracticeSession } | { ok: false; issues: SchemaIssue[] } {
  const result = practiceSessionSchema.safeParse(value);
  if (result.success) {
    return { ok: true, session: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map(issue => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  };
}

export function parsePracticeBundle(
  value: unknown
): { ok: true; bundle: PracticeBundle } | { ok: false; issues: SchemaIssue[] } {
  const result = practiceBundleSchema.safeParse(value);
  if (result.success) {
    return { ok: true, bundle: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map(issue => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  };
}
