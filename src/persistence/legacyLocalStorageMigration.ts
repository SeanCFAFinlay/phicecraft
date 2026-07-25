// ============================================================================
// LEGACY LOCALSTORAGE MIGRATION
//
// Moves drills written by the pre-IndexedDB build into the new database. The
// order matters and is the whole safety story:
//
//   read raw -> keep the raw copy -> parse as unknown -> normalize/migrate ->
//   validate -> repair -> ONE transaction -> read back -> only then mark done
//
// Legacy keys are never deleted here. They are the backup until the user has
// had at least one successful session on the new store.
// ============================================================================

import type { Drill, ID } from '@/core/types';
import { STORAGE_KEYS } from '@/core/constants';
import { generateId } from '@/utils/id';
import {
  err,
  ok,
  persistenceError,
  type DrillRepository,
  type PersistenceResult,
  type RecoveryRecord,
} from './types';
import { migrateDrillCandidate, repairDrillDocument, validateDrillDocument } from './drillPipeline';
import { parseStorableDrill } from './schema';
import { META_KEYS } from './indexedDbRepository';

export interface LegacyMigrationReport {
  /** True when there was nothing to migrate, or it had already been done. */
  skipped: boolean;
  migratedIds: ID[];
  recoveredKeys: string[];
  warnings: string[];
  /** A JSON copy of every legacy value found, before any repair. */
  rawBackup: string | null;
}

const LEGACY_DRILL_PREFIX = `${STORAGE_KEYS.DRILLS}_`;

function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Every legacy drill key present, from the metadata list AND a raw key scan. */
function findLegacyDrillKeys(): string[] {
  const keys = new Set<string>();

  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && key.startsWith(LEGACY_DRILL_PREFIX)) keys.add(key);
    }
  } catch {
    // A blocked localStorage simply yields no legacy keys.
  }

  // The metadata list may reference drills whose key scan failed, and may list
  // drills whose documents are gone. Both cases are worth surfacing.
  const listRaw = readLocalStorage(STORAGE_KEYS.DRILLS);
  if (listRaw) {
    try {
      const list = JSON.parse(listRaw);
      if (Array.isArray(list)) {
        for (const entry of list) {
          if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
            keys.add(`${LEGACY_DRILL_PREFIX}${entry.id}`);
          }
        }
      }
    } catch {
      // Handled by the caller as a recovery record.
    }
  }

  return [...keys];
}

/**
 * Migrate legacy localStorage drills into `repository`.
 *
 * Safe to call on every start: it exits immediately once the completion marker
 * is durable.
 */
export async function migrateLegacyLocalStorage(
  repository: DrillRepository,
  options: { now?: number; force?: boolean } = {}
): PersistenceResult<LegacyMigrationReport> {
  const now = options.now ?? Date.now();

  const markerResult = await repository.getMeta<number>(META_KEYS.legacyMigrationCompletedAt);
  if (!markerResult.ok) return err(markerResult.error);
  if (markerResult.value !== null && !options.force) {
    return ok({ skipped: true, migratedIds: [], recoveredKeys: [], warnings: [], rawBackup: null });
  }

  if (typeof localStorage === 'undefined') {
    const marked = await repository.setMeta(META_KEYS.legacyMigrationCompletedAt, now);
    if (!marked.ok) return err(marked.error);
    return ok({ skipped: true, migratedIds: [], recoveredKeys: [], warnings: [], rawBackup: null });
  }

  const keys = findLegacyDrillKeys();
  const listRaw = readLocalStorage(STORAGE_KEYS.DRILLS);
  const rawValues: Record<string, string | null> = {};
  if (listRaw !== null) rawValues[STORAGE_KEYS.DRILLS] = listRaw;

  const warnings: string[] = [];
  const recoverable: RecoveryRecord[] = [];
  const drills: Drill[] = [];

  for (const key of keys) {
    const raw = readLocalStorage(key);
    rawValues[key] = raw;

    if (raw === null) {
      warnings.push(`${key} was listed but no longer holds a value.`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      recoverable.push({
        id: `legacy-${key}`,
        source: 'legacy-localstorage',
        reference: key,
        raw,
        reason: `Not valid JSON: ${(cause as Error).message}`,
        capturedAt: now,
      });
      continue;
    }

    const fallbackId = key.slice(LEGACY_DRILL_PREFIX.length) || generateId();
    const { drill, warnings: normalizeWarnings } = migrateDrillCandidate(parsed, {
      now,
      fallbackId,
      fallbackName: 'Recovered Drill',
    });
    warnings.push(...normalizeWarnings.map(warning => `${key}: ${warning}`));

    const withId: Drill = { ...drill, id: drill.id || fallbackId };
    const repaired = repairDrillDocument(withId, generateId);
    const validation = validateDrillDocument(repaired);
    const storable = parseStorableDrill(repaired);

    if (!validation.valid || !storable.ok) {
      recoverable.push({
        id: `legacy-${key}`,
        source: 'legacy-localstorage',
        reference: key,
        raw: parsed,
        reason: !storable.ok
          ? storable.issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')
          : validation.errors.join('; '),
        capturedAt: now,
      });
      continue;
    }

    drills.push(storable.drill);
  }

  const rawBackup = Object.keys(rawValues).length > 0 ? JSON.stringify(rawValues, null, 2) : null;

  // One transaction for every recovered drill: either the whole legacy library
  // lands, or none of it does and the legacy keys are still the only truth.
  if (drills.length > 0) {
    const saved = await repository.saveMany(drills);
    if (!saved.ok) return err(saved.error);
  }

  for (const record of recoverable) {
    const stored = await repository.putRecovery(record);
    if (!stored.ok) return err(stored.error);
  }

  // Read back before declaring victory. A write that reports success but
  // cannot be read is not a migration.
  for (const drill of drills) {
    const readBack = await repository.read(drill.id);
    if (!readBack.ok) {
      return err(
        persistenceError(
          'transaction-failed',
          'migrate',
          `Migrated drill ${drill.id} could not be read back; legacy data has been left untouched.`,
          readBack.error
        )
      );
    }
  }

  // Carry the legacy "current drill" pointer across, if it still exists.
  const legacyCurrent = readLocalStorage(STORAGE_KEYS.CURRENT_DRILL);
  if (legacyCurrent && drills.some(drill => drill.id === legacyCurrent)) {
    await repository.setCurrentDrillId(legacyCurrent);
  }

  const marked = await repository.setMeta(META_KEYS.legacyMigrationCompletedAt, now);
  if (!marked.ok) return err(marked.error);

  return ok({
    skipped: false,
    migratedIds: drills.map(drill => drill.id),
    recoveredKeys: recoverable.map(record => record.reference),
    warnings,
    rawBackup,
  });
}
