// ============================================================================
// FAKE REPOSITORY - an in-memory DrillRepository with injectable failures
//
// Used to prove that a persistence failure can never surface as success. Real
// IndexedDB behaviour is covered separately against fake-indexeddb.
// ============================================================================

import type { Drill, DrillMeta, ID } from '@/core/types';
import {
  err,
  ok,
  persistenceError,
  type DrillRepository,
  type PersistenceError,
  type PersistenceOperation,
  type PersistenceResult,
  type RecoveryRecord,
} from '@/persistence/types';
import { deferred } from './utils';

export class FakeRepository implements DrillRepository {
  readonly drills = new Map<ID, Drill>();
  readonly meta = new Map<string, unknown>();
  readonly recovery = new Map<string, RecoveryRecord>();

  /** Operations that should fail, and with what. */
  private failures = new Map<PersistenceOperation, PersistenceError>();
  /** Gate that holds saves open so a test can interleave them. */
  private saveGate: { promise: Promise<void>; resolve: (value: void) => void } | null = null;
  /** Every save, in the order they actually completed. */
  readonly completedSaves: ID[] = [];
  readonly saveCallLog: ID[] = [];

  failOperation(operation: PersistenceOperation, error?: Partial<PersistenceError>): void {
    this.failures.set(operation, {
      ...persistenceError('quota-exceeded', operation, 'Injected failure for tests.'),
      ...error,
    });
  }

  clearFailures(): void {
    this.failures.clear();
  }

  /** Hold every subsequent save until `releaseSaves()` is called. */
  blockSaves(): void {
    const gate = deferred<void>();
    this.saveGate = { promise: gate.promise, resolve: gate.resolve };
  }

  releaseSaves(): void {
    this.saveGate?.resolve();
    this.saveGate = null;
  }

  private check(operation: PersistenceOperation): PersistenceError | null {
    return this.failures.get(operation) ?? null;
  }

  async open(): PersistenceResult<void> {
    const failure = this.check('open');
    return failure ? err(failure) : ok(undefined);
  }

  async list(): PersistenceResult<DrillMeta[]> {
    const failure = this.check('list');
    if (failure) return err(failure);
    return ok(
      [...this.drills.values()]
        .map(drill => ({ id: drill.id, name: drill.name, updatedAt: drill.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );
  }

  async read(id: ID): PersistenceResult<Drill> {
    const failure = this.check('read');
    if (failure) return err(failure);
    const drill = this.drills.get(id);
    if (!drill) return err(persistenceError('not-found', 'read', `No drill ${id}.`));
    return ok(structuredClone(drill));
  }

  async readAll(): PersistenceResult<Drill[]> {
    const failure = this.check('read');
    if (failure) return err(failure);
    return ok([...this.drills.values()].map(drill => structuredClone(drill)));
  }

  async save(drill: Drill): PersistenceResult<void> {
    this.saveCallLog.push(drill.id);
    if (this.saveGate) await this.saveGate.promise;
    const failure = this.check('save');
    if (failure) return err(failure);
    this.drills.set(drill.id, structuredClone(drill));
    this.completedSaves.push(drill.id);
    return ok(undefined);
  }

  async saveMany(drills: Drill[]): PersistenceResult<ID[]> {
    const failure = this.check('save');
    // One transaction: a failure writes nothing at all.
    if (failure) return err(failure);
    for (const drill of drills) this.drills.set(drill.id, structuredClone(drill));
    return ok(drills.map(drill => drill.id));
  }

  async delete(id: ID): PersistenceResult<void> {
    const failure = this.check('delete');
    if (failure) return err(failure);
    if (!this.drills.has(id)) return err(persistenceError('not-found', 'delete', `No drill ${id}.`));
    this.drills.delete(id);
    return ok(undefined);
  }

  async replaceAndSave(drills: Drill[], replaceIds: ID[]): PersistenceResult<ID[]> {
    const failure = this.check('import') ?? this.check('save');
    if (failure) return err(failure);
    for (const id of replaceIds) {
      const existing = this.drills.get(id);
      if (existing) {
        this.recovery.set(`replaced-${id}`, {
          id: `replaced-${id}`,
          source: 'replaced-drill',
          reference: id,
          raw: structuredClone(existing),
          reason: 'Replaced by a confirmed import.',
          capturedAt: 0,
        });
      }
    }
    for (const drill of drills) this.drills.set(drill.id, structuredClone(drill));
    return ok(drills.map(drill => drill.id));
  }

  async getCurrentDrillId(): PersistenceResult<ID | null> {
    return ok((this.meta.get('currentDrillId') as ID | undefined) ?? null);
  }

  async setCurrentDrillId(id: ID | null): PersistenceResult<void> {
    if (id === null) this.meta.delete('currentDrillId');
    else this.meta.set('currentDrillId', id);
    return ok(undefined);
  }

  async getMeta<T>(key: string): PersistenceResult<T | null> {
    const failure = this.check('read');
    if (failure) return err(failure);
    return ok((this.meta.get(key) as T | undefined) ?? null);
  }

  async setMeta(key: string, value: unknown): PersistenceResult<void> {
    const failure = this.check('save');
    if (failure) return err(failure);
    this.meta.set(key, value);
    return ok(undefined);
  }

  async putRecovery(record: RecoveryRecord): PersistenceResult<void> {
    this.recovery.set(record.id, record);
    return ok(undefined);
  }

  async listRecovery(): PersistenceResult<RecoveryRecord[]> {
    return ok([...this.recovery.values()]);
  }

  async clearRecovery(): PersistenceResult<void> {
    this.recovery.clear();
    return ok(undefined);
  }

  close(): void {
    // Nothing to release.
  }
}
