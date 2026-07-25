// ============================================================================
// IMPORT SERVICE
//
// Import is untrusted input, handled in two explicit stages:
//
//   prepareImport()  read -> limits -> JSON -> candidate parse -> normalize ->
//                    migrate -> validate -> repair -> report collisions
//   commitImport()   remap identity (copy mode) or replace a confirmed ID ->
//                    revalidate -> ONE transaction -> return the exact IDs
//
// The default is COPY. Nothing is ever overwritten because two files happen to
// share an ID; a replacement requires an explicit per-drill confirmation.
// ============================================================================

import type { Drill, DrillMeta, ID } from '@/core/types';
import { generateId } from '@/utils/id';
import {
  err,
  ok,
  persistenceError,
  type DrillRepository,
  type ImportFailure,
  type ImportResult,
  type PersistenceError,
  type Result,
} from './types';
import { IMPORT_LIMITS, parseStorableDrill } from './schema';
import {
  migrateDrillCandidate,
  parseDrillCandidate,
  remapImportedDrill,
  repairDrillDocument,
  validateDrillDocument,
} from './drillPipeline';

export type ImportMode = 'copy' | 'replace';

export interface ImportCandidate {
  sourceIndex: number;
  /** The name the file gave it, for display in the preview. */
  name: string;
  /** The ID in the file, if any. Never used as a storage key without consent. */
  incomingId: ID | null;
  /** The local drill this would replace, if the user asks for replacement. */
  collidesWith: DrillMeta | null;
  warnings: string[];
  /** Normalized, migrated, repaired, and schema-valid. Ready to store. */
  drill: Drill;
}

export interface ImportPreview {
  candidates: ImportCandidate[];
  failures: ImportFailure[];
  /** Byte length of the source text, for the size report. */
  byteLength: number;
}

export interface ImportDecision {
  sourceIndex: number;
  mode: ImportMode;
}

function byteLengthOf(text: string): number {
  // Node and the browser both have TextEncoder; fall back to the code-unit
  // count if it is somehow missing, which only over-counts for ASCII.
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length;
}

function failure(sourceIndex: number, name: string | null, code: string, message: string): ImportFailure {
  return { sourceIndex, name, code, message };
}

/**
 * Stage one: parse and validate without writing anything.
 */
export async function prepareImport(
  text: string,
  repository: DrillRepository,
  options: { now?: number } = {}
): Promise<Result<ImportPreview, PersistenceError>> {
  const now = options.now ?? Date.now();
  const byteLength = byteLengthOf(text);

  if (byteLength > IMPORT_LIMITS.maxBytes) {
    return err(
      persistenceError(
        'validation-failed',
        'import',
        `That file is ${(byteLength / 1024 / 1024).toFixed(1)} MiB, above the ${
          IMPORT_LIMITS.maxBytes / 1024 / 1024
        } MiB import limit.`
      )
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return err(
      persistenceError('corrupt-data', 'import', `That file is not valid JSON: ${(cause as Error).message}`, cause)
    );
  }

  // Accept a bare drill, an array of drills, or an exported payload envelope.
  let sourceList: unknown[];
  if (Array.isArray(parsed)) {
    sourceList = parsed;
  } else if (
    parsed !== null &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { drills?: unknown }).drills)
  ) {
    sourceList = (parsed as { drills: unknown[] }).drills;
  } else {
    sourceList = [parsed];
  }

  if (sourceList.length > IMPORT_LIMITS.maxDrills) {
    return err(
      persistenceError(
        'validation-failed',
        'import',
        `That file contains ${sourceList.length} drills, above the ${IMPORT_LIMITS.maxDrills} per-import limit.`
      )
    );
  }

  const existing = await repository.list();
  if (!existing.ok) return err(existing.error);
  const localById = new Map(existing.value.map(meta => [meta.id, meta]));

  const candidates: ImportCandidate[] = [];
  const failures: ImportFailure[] = [];

  sourceList.forEach((source, sourceIndex) => {
    const candidateParse = parseDrillCandidate(source);
    if (!candidateParse.ok) {
      failures.push(failure(sourceIndex, null, candidateParse.code, candidateParse.message));
      return;
    }

    const incomingId =
      typeof candidateParse.candidate.id === 'string' && candidateParse.candidate.id.length > 0
        ? candidateParse.candidate.id
        : null;
    const declaredName =
      typeof candidateParse.candidate.name === 'string' && candidateParse.candidate.name.length > 0
        ? candidateParse.candidate.name
        : null;

    const { drill, warnings } = migrateDrillCandidate(candidateParse.candidate, {
      now,
      fallbackId: generateId(),
      fallbackName: 'Imported Drill',
    });

    const withId: Drill = { ...drill, id: drill.id || generateId() };
    const repaired = repairDrillDocument(withId, generateId);
    const validation = validateDrillDocument(repaired);

    if (!validation.valid) {
      failures.push(
        failure(
          sourceIndex,
          declaredName,
          'validation-failed',
          `Could not be repaired into a valid drill: ${validation.errors.slice(0, 3).join('; ')}`
        )
      );
      return;
    }

    const storable = parseStorableDrill(repaired);
    if (!storable.ok) {
      failures.push(
        failure(
          sourceIndex,
          declaredName,
          'schema-failed',
          storable.issues
            .slice(0, 3)
            .map(issue => `${issue.path}: ${issue.message}`)
            .join('; ')
        )
      );
      return;
    }

    candidates.push({
      sourceIndex,
      name: storable.drill.name,
      incomingId,
      collidesWith: incomingId ? localById.get(incomingId) ?? null : null,
      warnings,
      drill: storable.drill,
    });
  });

  return ok({ candidates, failures, byteLength });
}

/**
 * Stage two: write. `decisions` selects the mode per candidate; anything not
 * listed defaults to `copy`. A `replace` decision is only honoured when the
 * candidate actually collides with a local drill.
 */
export async function commitImport(
  preview: ImportPreview,
  decisions: ImportDecision[],
  repository: DrillRepository,
  options: { now?: number } = {}
): Promise<Result<ImportResult, PersistenceError>> {
  const now = options.now ?? Date.now();
  const modeByIndex = new Map(decisions.map(decision => [decision.sourceIndex, decision.mode]));

  const toStore: Drill[] = [];
  const replaceIds: ID[] = [];
  const importedIds: ID[] = [];
  const replacedIds: ID[] = [];
  const failures: ImportFailure[] = [...preview.failures];
  const warnings: string[] = [];

  for (const candidate of preview.candidates) {
    const requested = modeByIndex.get(candidate.sourceIndex) ?? 'copy';
    const canReplace = requested === 'replace' && candidate.collidesWith !== null;

    if (requested === 'replace' && !canReplace) {
      warnings.push(
        `"${candidate.name}" was imported as a copy: there is no local drill with its ID to replace.`
      );
    }

    let prepared: Drill;
    if (canReplace) {
      // Keep the incoming identity, but re-stamp the timestamp so the list
      // orders it as the newest thing the user did.
      prepared = { ...candidate.drill, id: candidate.collidesWith!.id, updatedAt: now };
      replaceIds.push(prepared.id);
      replacedIds.push(prepared.id);
    } else {
      prepared = remapImportedDrill(candidate.drill, generateId, now);
      importedIds.push(prepared.id);
    }

    // Revalidate after identity work - remapping is the step most likely to
    // introduce a dangling reference, and nothing unvalidated may be stored.
    const validation = validateDrillDocument(prepared);
    const storable = parseStorableDrill(prepared);
    if (!validation.valid || !storable.ok) {
      failures.push(
        failure(
          candidate.sourceIndex,
          candidate.name,
          'remap-failed',
          !storable.ok
            ? storable.issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')
            : validation.errors.join('; ')
        )
      );
      if (canReplace) {
        replaceIds.pop();
        replacedIds.pop();
      } else {
        importedIds.pop();
      }
      continue;
    }

    toStore.push(storable.drill);
    warnings.push(...candidate.warnings.map(warning => `"${candidate.name}": ${warning}`));
  }

  if (toStore.length === 0) {
    return ok({ importedIds: [], replacedIds: [], failures, warnings });
  }

  const stored = await repository.replaceAndSave(toStore, replaceIds);
  if (!stored.ok) return err(stored.error);

  return ok({ importedIds, replacedIds, failures, warnings });
}

/** Convenience for the common "import everything as copies" path. */
export async function importAsCopies(
  text: string,
  repository: DrillRepository,
  options: { now?: number } = {}
): Promise<Result<ImportResult, PersistenceError>> {
  const preview = await prepareImport(text, repository, options);
  if (!preview.ok) return err(preview.error);
  return commitImport(preview.value, [], repository, options);
}
