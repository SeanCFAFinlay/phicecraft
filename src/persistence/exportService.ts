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
  drills: Drill[],
  containsUnsavedRevision: boolean,
  now: number = Date.now()
): ExportPayload {
  return {
    format: 'phicecraft-drills',
    version: 1,
    exportedAt: now,
    containsUnsavedRevision,
    drills,
  };
}

function exportFilename(now: number, unsaved: boolean): string {
  const stamp = new Date(now).toISOString().slice(0, 10);
  return unsaved ? `phicecraft-drills-${stamp}-unsaved.json` : `phicecraft-drills-${stamp}.json`;
}

/**
 * Merge the in-memory drill over the durable copy of the same ID, so an
 * unsaved export contains the user's latest work exactly once.
 */
function mergeUnsaved(durable: Drill[], pending: Drill | null): Drill[] {
  if (!pending) return durable;
  const index = durable.findIndex(drill => drill.id === pending.id);
  if (index === -1) return [pending, ...durable];
  const merged = [...durable];
  merged[index] = pending;
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

  const all = await repository.readAll();
  if (!all.ok) {
    // The durable read failed too. If there is still an in-memory drill, that
    // is the only thing left worth rescuing.
    const pending = coordinator.pendingDocument;
    if (!pending) return err(all.error);

    const payload = buildExportPayload([pending], true, now);
    return ok({
      kind: 'exported',
      payload,
      json: JSON.stringify(payload, null, 2),
      filename: exportFilename(now, true),
    });
  }

  const drills = containsUnsaved ? mergeUnsaved(all.value, coordinator.pendingDocument) : all.value;
  const payload = buildExportPayload(drills, containsUnsaved, now);

  return ok({
    kind: 'exported',
    payload,
    json: JSON.stringify(payload, null, 2),
    filename: exportFilename(now, containsUnsaved),
  });
}
