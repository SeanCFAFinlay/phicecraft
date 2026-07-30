// ============================================================================
// PERSISTENCE TYPES
//
// Every persistence operation returns a typed Result. No bare booleans, and no
// `null` standing in for "something went wrong" - a caller must be able to tell
// "there is no such drill" apart from "the database could not be read", because
// only one of those is safe to treat as an empty library.
// ============================================================================

import type { Drill, DrillMeta, ID } from '@/core/types';
import type { DrillDocumentV3 } from '@/domain/v3/types';

// ----------------------------------------------------------------------------
// Result
// ----------------------------------------------------------------------------

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

export type PersistenceErrorCode =
  | 'unavailable'
  | 'quota-exceeded'
  | 'transaction-failed'
  | 'not-found'
  | 'corrupt-data'
  | 'validation-failed'
  | 'unknown';

export type PersistenceOperation =
  | 'open'
  | 'list'
  | 'read'
  | 'save'
  | 'delete'
  | 'import'
  | 'export'
  | 'migrate';

export interface PersistenceError {
  code: PersistenceErrorCode;
  message: string;
  operation: PersistenceOperation;
  cause?: unknown;
  recoverable: boolean;
}

/** Errors the user can act on: retry, free space, export a copy. */
const RECOVERABLE_CODES: ReadonlySet<PersistenceErrorCode> = new Set([
  'quota-exceeded',
  'transaction-failed',
  'unknown',
]);

export function persistenceError(
  code: PersistenceErrorCode,
  operation: PersistenceOperation,
  message: string,
  cause?: unknown
): PersistenceError {
  return { code, operation, message, cause, recoverable: RECOVERABLE_CODES.has(code) };
}

/**
 * Classify a thrown value from IndexedDB or the storage APIs. Quota failures
 * are the one case worth naming precisely, because the recovery ("export your
 * work, then free space") is different from a plain retry.
 */
export function classifyThrown(
  operation: PersistenceOperation,
  cause: unknown,
  fallbackMessage: string
): PersistenceError {
  const name = (cause as { name?: string } | null)?.name;
  const message = (cause as { message?: string } | null)?.message ?? fallbackMessage;

  if (name === 'QuotaExceededError' || /quota/i.test(message)) {
    return persistenceError('quota-exceeded', operation, 'Device storage is full.', cause);
  }
  if (name === 'AbortError' || name === 'TransactionInactiveError' || name === 'InvalidStateError') {
    return persistenceError('transaction-failed', operation, message, cause);
  }
  if (name === 'DataError' || name === 'DataCloneError' || name === 'SyntaxError') {
    return persistenceError('corrupt-data', operation, message, cause);
  }
  return persistenceError('unknown', operation, message, cause);
}

/** Human-facing sentence for an error, used by toasts and the status bar. */
export function describePersistenceError(error: PersistenceError): string {
  switch (error.code) {
    case 'unavailable':
      return 'Storage is unavailable in this browser. Export your work to keep it.';
    case 'quota-exceeded':
      return 'Device storage is full. Export your drills, then free space and retry.';
    case 'transaction-failed':
      return 'The save could not be completed. Your previous version is intact.';
    case 'not-found':
      return 'That drill is no longer in storage.';
    case 'corrupt-data':
      return 'That stored data could not be read. A copy has been kept for recovery.';
    case 'validation-failed':
      return 'That drill did not pass validation and was not stored.';
    default:
      return error.message || 'Something went wrong talking to storage.';
  }
}

// ----------------------------------------------------------------------------
// Status
// ----------------------------------------------------------------------------

export interface PersistenceStatus {
  state: 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
  dirtyRevision: number;
  savedRevision: number;
  lastSavedAt: number | null;
  error: PersistenceError | null;
}

export const INITIAL_PERSISTENCE_STATUS: PersistenceStatus = {
  state: 'clean',
  dirtyRevision: 0,
  savedRevision: 0,
  lastSavedAt: null,
  error: null,
};

// ----------------------------------------------------------------------------
// Import / export
// ----------------------------------------------------------------------------

export interface ImportFailure {
  sourceIndex: number;
  name: string | null;
  code: string;
  message: string;
}

export interface ImportResult {
  importedIds: ID[];
  replacedIds: ID[];
  failures: ImportFailure[];
  warnings: string[];
}

export interface ExportPayload {
  format: 'phicecraft-drills';
  version: 2;
  exportedAt: number;
  /** True when the payload includes an in-memory revision that is not durable. */
  containsUnsavedRevision: boolean;
  documents: DrillDocumentV3[];
}

/** The envelope shape every export produced before v3 documents existed. */
export interface LegacyExportPayloadV1 {
  format: 'phicecraft-drills';
  version: 1;
  exportedAt: number;
  containsUnsavedRevision: boolean;
  drills: Drill[];
}

// ----------------------------------------------------------------------------
// Recovery
// ----------------------------------------------------------------------------

export interface RecoveryRecord {
  id: string;
  /** Where the unreadable value came from. */
  source: 'legacy-localstorage' | 'import' | 'replaced-drill' | 'corrupt-record' | 'version-skew';
  /** The original key or index, so a human can find it again. */
  reference: string;
  /** The raw value exactly as it was found, never repaired. */
  raw: unknown;
  reason: string;
  capturedAt: number;
}

// ----------------------------------------------------------------------------
// Storage
//
// The shape actually persisted. The document is `DrillDocumentV3`: the
// repository stores v3 at rest even though every method below still speaks
// the v2 `Drill` the engine and UI understand - `name`/`updatedAt` are kept
// denormalized alongside it so the `drills` list can be read without
// deserializing every document.
// ----------------------------------------------------------------------------

export interface StoredDrillRecord {
  id: ID;
  name: string;
  updatedAt: number;
  /** The full document, exactly as validated, at the current schema version. */
  document: DrillDocumentV3;
}

// ----------------------------------------------------------------------------
// Repository
// ----------------------------------------------------------------------------

export type PersistenceResult<T> = Promise<Result<T, PersistenceError>>;

export interface DrillRepository {
  /** Open (and if needed create/upgrade) the database. Safe to call repeatedly. */
  open(): PersistenceResult<void>;
  list(): PersistenceResult<DrillMeta[]>;
  /** `not-found` error when the drill does not exist; other codes mean read failure. */
  read(id: ID): PersistenceResult<Drill>;
  readAll(): PersistenceResult<Drill[]>;
  /**
   * Reads every stored document at its full v3 shape, without projecting to
   * v2. Export uses this instead of `readAll` so equipment, phases, extra
   * puck tracks and rich metadata survive into a backup.
   */
  readAllDocumentsV3(): PersistenceResult<DrillDocumentV3[]>;
  /** Writes the drill and its list entry in one transaction. */
  save(drill: Drill): PersistenceResult<void>;
  /** Writes every drill in a single transaction; all or nothing. */
  saveMany(drills: Drill[]): PersistenceResult<ID[]>;
  /**
   * Writes a full v3 document directly, bypassing the v2 `Drill` merge path.
   * The only v3-typed door into the repository - used for seeding a drill
   * from a template, where there is no v2 edit to merge against.
   */
  saveDocumentV3(document: DrillDocumentV3): PersistenceResult<void>;
  /** Removes the drill and its list entry in one transaction. */
  delete(id: ID): PersistenceResult<void>;
  /**
   * Replaces `replaceIds` and inserts `drills` in one transaction, capturing a
   * recovery copy of each replaced value first.
   */
  replaceAndSave(drills: Drill[], replaceIds: ID[]): PersistenceResult<ID[]>;
  getCurrentDrillId(): PersistenceResult<ID | null>;
  setCurrentDrillId(id: ID | null): PersistenceResult<void>;
  getMeta<T>(key: string): PersistenceResult<T | null>;
  setMeta(key: string, value: unknown): PersistenceResult<void>;
  putRecovery(record: RecoveryRecord): PersistenceResult<void>;
  listRecovery(): PersistenceResult<RecoveryRecord[]>;
  clearRecovery(): PersistenceResult<void>;
  close(): void;
}
