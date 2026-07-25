// ============================================================================
// RECOVERY SERVICE
//
// Anything that could not be read, could not be imported, or was deliberately
// replaced is kept here verbatim. The user can always download it, so a bad
// file or a corrupt record never means the work is simply gone.
// ============================================================================

import {
  err,
  ok,
  type DrillRepository,
  type PersistenceError,
  type RecoveryRecord,
  type Result,
} from './types';

export interface RecoveryBundle {
  format: 'phicecraft-recovery';
  version: 1;
  exportedAt: number;
  recordCount: number;
  records: RecoveryRecord[];
}

export async function loadRecoveryRecords(
  repository: DrillRepository
): Promise<Result<RecoveryRecord[], PersistenceError>> {
  return repository.listRecovery();
}

export async function buildRecoveryBundle(
  repository: DrillRepository,
  now: number = Date.now()
): Promise<Result<{ bundle: RecoveryBundle; json: string; filename: string }, PersistenceError>> {
  const records = await repository.listRecovery();
  if (!records.ok) return err(records.error);

  const bundle: RecoveryBundle = {
    format: 'phicecraft-recovery',
    version: 1,
    exportedAt: now,
    recordCount: records.value.length,
    records: records.value,
  };

  return ok({
    bundle,
    json: JSON.stringify(bundle, null, 2),
    filename: `phicecraft-recovery-${new Date(now).toISOString().slice(0, 10)}.json`,
  });
}

/** Capture a raw value that could not be used, without interpreting it. */
export async function captureRecovery(
  repository: DrillRepository,
  record: Omit<RecoveryRecord, 'capturedAt'> & { capturedAt?: number }
): Promise<Result<void, PersistenceError>> {
  return repository.putRecovery({ ...record, capturedAt: record.capturedAt ?? Date.now() });
}
