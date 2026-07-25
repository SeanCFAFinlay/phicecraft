// ============================================================================
// SAVE COORDINATOR
//
// Owns the persistence status and serializes every write. Two guarantees:
//
//   1. Two auto-saves can never complete out of order, because they run in a
//      promise queue - one at a time, in the order requested.
//   2. A completed save only reports "saved" if the revision it wrote is still
//      the current revision. A slow save landing after a newer edit leaves the
//      document dirty, not falsely clean.
//
// It is an external store: `subscribe`/`getSnapshot` feed React through
// useSyncExternalStore, so status changes never republish application state.
// ============================================================================

import type { Drill } from '@/core/types';
import {
  INITIAL_PERSISTENCE_STATUS,
  err,
  ok,
  type DrillRepository,
  type PersistenceError,
  type PersistenceStatus,
  type Result,
} from './types';

export type SaveOutcome = Result<void, PersistenceError>;

export class SaveCoordinator {
  private status: PersistenceStatus = INITIAL_PERSISTENCE_STATUS;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private revision = 0;
  /** The most recent document handed to us, used by `flush`. */
  private pending: Drill | null = null;

  constructor(private readonly repository: DrillRepository) {}

  // --------------------------------------------------------------------------
  // External store
  // --------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PersistenceStatus => this.status;

  private setStatus(next: Partial<PersistenceStatus>): void {
    this.status = { ...this.status, ...next };
    for (const listener of this.listeners) listener();
  }

  // --------------------------------------------------------------------------
  // Revisions
  // --------------------------------------------------------------------------

  /** Current in-memory revision number. Increments on every edit. */
  get currentRevision(): number {
    return this.revision;
  }

  /** True when the in-memory document differs from the last durable write. */
  get hasUnsavedChanges(): boolean {
    return this.status.savedRevision < this.revision;
  }

  /**
   * Record that the document changed. The drill is kept so `flush()` can write
   * the latest revision without the caller threading it through again.
   */
  markDirty(drill: Drill): number {
    this.revision += 1;
    this.pending = drill;
    this.setStatus({
      state: this.status.state === 'error' ? 'error' : 'dirty',
      dirtyRevision: this.revision,
    });
    return this.revision;
  }

  /**
   * Adopt a document as already-durable, without writing. Used after loading a
   * drill from storage, so a freshly opened play does not read as unsaved.
   */
  adoptSaved(drill: Drill, savedAt: number = Date.now()): void {
    this.revision += 1;
    this.pending = drill;
    this.setStatus({
      state: 'clean',
      dirtyRevision: this.revision,
      savedRevision: this.revision,
      lastSavedAt: savedAt,
      error: null,
    });
  }

  /** Reset to a clean slate, e.g. after switching documents. */
  reset(): void {
    this.revision = 0;
    this.pending = null;
    this.status = { ...INITIAL_PERSISTENCE_STATUS };
    for (const listener of this.listeners) listener();
  }

  /** Clear a displayed failure once the user has acknowledged it. */
  dismissError(): void {
    if (this.status.state !== 'error') return;
    this.setStatus({
      state: this.hasUnsavedChanges ? 'dirty' : 'clean',
      error: null,
    });
  }

  // --------------------------------------------------------------------------
  // Writing
  // --------------------------------------------------------------------------

  /**
   * Queue a save of `drill`. Resolves with the actual repository result - the
   * caller must not announce success before awaiting this.
   */
  save(drill: Drill): Promise<SaveOutcome> {
    const revision = this.markDirty(drill);
    return this.enqueue(drill, revision);
  }

  /**
   * Write the latest known revision if anything is outstanding. Used before
   * export and before destructive operations.
   */
  async flush(): Promise<SaveOutcome> {
    if (!this.pending || !this.hasUnsavedChanges) {
      // Still drain the queue so an in-flight save is accounted for.
      await this.queue.catch(() => undefined);
      return this.status.state === 'error' && this.status.error
        ? err(this.status.error)
        : ok(undefined);
    }
    return this.enqueue(this.pending, this.revision);
  }

  private enqueue(drill: Drill, revision: number): Promise<SaveOutcome> {
    const run = this.queue.then(
      () => this.performSave(drill, revision),
      () => this.performSave(drill, revision)
    );
    // The queue itself must never reject, or every later save short-circuits.
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async performSave(drill: Drill, revision: number): Promise<SaveOutcome> {
    this.setStatus({ state: 'saving' });

    const result = await this.repository.save(drill);

    if (!result.ok) {
      this.setStatus({ state: 'error', error: result.error });
      return err(result.error);
    }

    // Only the newest write may advance the saved revision, and it only counts
    // as "saved" if nothing has been edited since it was queued.
    const savedRevision = Math.max(this.status.savedRevision, revision);
    const stillCurrent = savedRevision >= this.revision;

    this.setStatus({
      state: stillCurrent ? 'saved' : 'dirty',
      savedRevision,
      lastSavedAt: Date.now(),
      error: null,
    });

    return ok(undefined);
  }

  /** Retry the last failed write. */
  retry(): Promise<SaveOutcome> {
    if (!this.pending) return Promise.resolve(ok(undefined));
    return this.enqueue(this.pending, this.revision);
  }

  /** The most recent in-memory document, for emergency export. */
  get pendingDocument(): Drill | null {
    return this.pending;
  }
}
