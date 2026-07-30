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
import type { DrillDocumentV3 } from '@/domain/v3/types';
import { parseDrillDocumentV3 } from '@/domain/v3/schema';
import { projectToV2 } from '@/domain/v3/projectToV2';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
  /**
   * The untouched v3 document, when the source was one. Carried through so
   * `commitImport` can additionally store it via `saveDocumentV3`, preserving
   * equipment, phases, extra puck tracks and rich metadata that `drill` -
   * the v2 projection - cannot express. `null` for a v2/v1-sourced candidate.
   */
  sourceDocument: DrillDocumentV3 | null;
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

  // Accept a bare drill or document, an array of either, or an exported
  // payload envelope - a version-2 envelope (`documents`, v3 at rest) is
  // checked before a version-1 one (`drills`, v2), since a v2 envelope never
  // has a `documents` field but a hand-edited file could carry both.
  let sourceList: unknown[];
  if (isRecord(parsed) && Array.isArray((parsed as { documents?: unknown }).documents)) {
    sourceList = (parsed as { documents: unknown[] }).documents;
  } else if (isRecord(parsed) && Array.isArray((parsed as { drills?: unknown }).drills)) {
    sourceList = (parsed as { drills: unknown[] }).drills;
  } else if (Array.isArray(parsed)) {
    sourceList = parsed;
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

  /**
   * The shared tail of both origins below: repair whatever was normalized or
   * projected into a structurally complete `Drill`, validate it, gate it
   * against the storage schema, and record either a candidate or a failure.
   * Kept as one path so a defect here - or a defensive branch neither origin
   * can currently trigger - is not duplicated between them.
   */
  function finalizeCandidate(
    sourceIndex: number,
    drill: Drill,
    declaredName: string | null,
    incomingId: ID | null,
    warnings: string[],
    sourceDocument: DrillDocumentV3 | null
  ): void {
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
      sourceDocument,
    });
  }

  // Every item is sniffed independently, whether it came from an envelope, a
  // bare array, or a single bare object: a v3 document declares itself with
  // `schemaVersion: 3`, and anything else takes the v2/v1 path unchanged.
  sourceList.forEach((source, sourceIndex) => {
    if (isRecord(source) && (source as { schemaVersion?: unknown }).schemaVersion === 3) {
      const v3Parse = parseDrillDocumentV3(source);
      if (!v3Parse.ok) {
        failures.push(failure(sourceIndex, null, 'schema-failed', v3Parse.message));
        return;
      }

      const { document } = v3Parse;
      const { drill: projected, losses } = projectToV2(document);
      finalizeCandidate(
        sourceIndex,
        projected,
        document.metadata.title || null,
        document.id,
        losses.map(loss => loss.detail),
        document
      );
      return;
    }

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

    finalizeCandidate(sourceIndex, drill, declaredName, incomingId, warnings, null);
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
  /** v3-origin candidates that made it into `toStore`, for the enrichment pass below. */
  const v3Enrichments: { document: DrillDocumentV3; name: string }[] = [];
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

    if (candidate.sourceDocument) {
      // The v3 document gets the exact id and timestamps `prepared` just
      // settled on, but its own internal actor/track ids are always left as
      // the file authored them - on both the `replace` and `copy` paths -
      // even though the v2 side above gets entirely fresh ones on `copy`
      // (`remapImportedDrill`). That mismatch is deliberate and harmless:
      // nothing reconciles the two shapes by id, a future edit-save round
      // trip replaces actors/tracks wholesale via `mergeEditedIntoStored`
      // instead. Template copies now go further and give both shapes the
      // SAME ids up front (`remapDocumentIds`), because a template is
      // user-facing content a coach reopens and re-saves; an import's
      // file-authored ids are kept for their own sake (P2T5) and were never
      // required to agree with whatever the v2 projection did.
      v3Enrichments.push({
        document: {
          ...candidate.sourceDocument,
          id: storable.drill.id,
          createdAt: storable.drill.createdAt,
          updatedAt: storable.drill.updatedAt,
        },
        name: candidate.name,
      });
    }
  }

  if (toStore.length === 0) {
    return ok({ importedIds: [], replacedIds: [], failures, warnings });
  }

  const stored = await repository.replaceAndSave(toStore, replaceIds);
  if (!stored.ok) return err(stored.error);

  // Best-effort enrichment: the import already succeeded at the v2 shape
  // above, so a failure here is reported as a warning rather than undoing
  // that success - the coach keeps their import, just without the v3-only
  // extras this pass would have added.
  for (const enrichment of v3Enrichments) {
    const saved = await repository.saveDocumentV3(enrichment.document);
    if (!saved.ok) {
      warnings.push(
        `"${enrichment.name}" was imported, but its v3-only details (equipment, phases, extra routes) could not be preserved: ${saved.error.message}`
      );
    }
  }

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
