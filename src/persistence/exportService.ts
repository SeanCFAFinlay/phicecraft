// ============================================================================
// EXPORT SERVICE
//
// Export never lies. The flow is:
//
//   flush the current revision
//     -> success: export every durable drill
//     -> failure: ask the user explicitly, and if they choose to continue,
//        merge the in-memory revision in and LABEL the payload as unsaved
//
// The service returns a payload. It does not touch the DOM, so the "Drills
// exported" message can only be shown by the caller after a file was actually
// produced.
// ============================================================================

import type { Drill } from '@/core/types';
import type { DrillDocumentV3 } from '@/domain/v3/types';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { mergeEditedIntoStored } from '@/domain/v3/mergeEditedV2';
import {
  err,
  ok,
  type DrillRepository,
  type ExportPayload,
  type PersistenceError,
  type Result,
} from './types';
import type { SaveCoordinator } from './saveCoordinator';

export type UnsavedExportChoice = 'export-anyway' | 'cancel';

export interface ExportRequest {
  repository: DrillRepository;
  coordinator: SaveCoordinator;
  /**
   * Called only when the pre-export flush fails. Must present a blocking
   * choice; there is no default.
   */
  confirmUnsavedExport: (error: PersistenceError) => Promise<UnsavedExportChoice>;
  now?: number;
}

export type ExportOutcome =
  | { kind: 'exported'; payload: ExportPayload; json: string; filename: string }
  | { kind: 'cancelled' };

export function buildExportPayload(
  documents: DrillDocumentV3[],
  containsUnsavedRevision: boolean,
  now: number = Date.now()
): ExportPayload {
  return {
    format: 'phicecraft-drills',
    version: 2,
    exportedAt: now,
    containsUnsavedRevision,
    documents,
  };
}

function exportFilename(now: number, unsaved: boolean): string {
  const stamp = new Date(now).toISOString().slice(0, 10);
  return unsaved ? `phicecraft-drills-${stamp}-unsaved.json` : `phicecraft-drills-${stamp}.json`;
}

/**
 * Merge the in-memory drill over the durable v3 document of the same ID, so
 * an unsaved export contains the user's latest work exactly once. The merge
 * runs through `mergeEditedIntoStored`, the same seam `prepareForWrite` uses
 * on save, so v3-only content the pending v2 edit cannot express - equipment,
 * phases, extra puck tracks - survives an unsaved export too.
 */
function mergeUnsaved(durable: DrillDocumentV3[], pending: Drill | null): DrillDocumentV3[] {
  if (!pending) return durable;
  const migrated = migrateV2ToV3(pending);
  const index = durable.findIndex(document => document.id === pending.id);
  if (index === -1) return [migrated, ...durable];
  const merged = [...durable];
  merged[index] = mergeEditedIntoStored(durable[index], migrated);
  return merged;
}

export async function exportDrills(
  request: ExportRequest
): Promise<Result<ExportOutcome, PersistenceError>> {
  const { repository, coordinator, confirmUnsavedExport } = request;
  const now = request.now ?? Date.now();

  const flush = await coordinator.flush();
  let containsUnsaved = false;

  if (!flush.ok) {
    const choice = await confirmUnsavedExport(flush.error);
    if (choice === 'cancel') return ok({ kind: 'cancelled' });
    containsUnsaved = true;
  }

  const all = await repository.readAllDocumentsV3();
  if (!all.ok) {
    // The durable read failed too. If there is still an in-memory drill, that
    // is the only thing left worth rescuing.
    const pending = coordinator.pendingDocument;
    if (!pending) return err(all.error);

    const payload = buildExportPayload([migrateV2ToV3(pending)], true, now);
    return ok({
      kind: 'exported',
      payload,
      json: JSON.stringify(payload, null, 2),
      filename: exportFilename(now, true),
    });
  }

  const documents = containsUnsaved ? mergeUnsaved(all.value, coordinator.pendingDocument) : all.value;
  const payload = buildExportPayload(documents, containsUnsaved, now);

  return ok({
    kind: 'exported',
    payload,
    json: JSON.stringify(payload, null, 2),
    filename: exportFilename(now, containsUnsaved),
  });
}
