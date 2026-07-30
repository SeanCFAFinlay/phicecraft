// ============================================================================
// FAKE REPOSITORY - an in-memory DrillRepository with injectable failures
//
// Used to prove that a persistence failure can never surface as success. Real
// IndexedDB behaviour is covered separately against fake-indexeddb.
//
// Storage is v3 at rest here too, exactly as the real repository is: a single
// `documents` map of `DrillDocumentV3` is the only source of truth, so a test
// that stores equipment, annotations, extra puck tracks or rich metadata (via
// `saveDocumentV3`, or a template-derived save) can read it straight back
// through `readAllDocumentsV3` - no spy on the write call is needed to prove
// what actually landed. `drills`, the v2-typed view every existing test
// already uses, is a thin projection over the same map: `.set()` migrates and
// merges (the same seam `prepareForWrite` uses in the real repository), and
// every read projects back to v2 on the fly.
// ============================================================================

import type { Drill, DrillMeta, ID } from '@/core/types';
import type { DrillDocumentV3 } from '@/domain/v3/types';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { mergeEditedIntoStored } from '@/domain/v3/mergeEditedV2';
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

/**
 * The v2-shaped view of `documents`, kept API-compatible with `Map<ID, Drill>`
 * so every existing test can keep reading and seeding through `repository.drills`
 * unchanged. `set` merges onto whatever is already stored under that id via
 * `mergeEditedIntoStored`, the same way a real save does, so v3-only content
 * seeded a different way (a template's equipment, say) is not silently wiped
 * out by a later v2-shaped write.
 */
class DrillView {
  constructor(private readonly documents: Map<ID, DrillDocumentV3>) {}

  get size(): number {
    return this.documents.size;
  }

  has(id: ID): boolean {
    return this.documents.has(id);
  }

  get(id: ID): Drill | undefined {
    const document = this.documents.get(id);
    return document ? projectToV2(document).drill : undefined;
  }

  set(id: ID, drill: Drill): this {
    const migrated = migrateV2ToV3(structuredClone(drill));
    const existing = this.documents.get(id);
    this.documents.set(id, existing ? mergeEditedIntoStored(existing, migrated) : migrated);
    return this;
  }

  delete(id: ID): boolean {
    return this.documents.delete(id);
  }

  values(): Drill[] {
    return [...this.documents.values()].map(document => projectToV2(document).drill);
  }
}

export class FakeRepository implements DrillRepository {
  /** The only source of truth: storage is v3 at rest here too. */
  readonly documents = new Map<ID, DrillDocumentV3>();
  /** A v2-typed view over `documents` - see `DrillView`. */
  readonly drills = new DrillView(this.documents);
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
      this.drills
        .values()
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
    return ok(this.drills.values().map(drill => structuredClone(drill)));
  }

  async readAllDocumentsV3(): PersistenceResult<DrillDocumentV3[]> {
    const failure = this.check('read');
    if (failure) return err(failure);
    return ok([...this.documents.values()].map(document => structuredClone(document)));
  }

  async readDocumentV3(id: ID): PersistenceResult<DrillDocumentV3> {
    const failure = this.check('read');
    if (failure) return err(failure);
    const document = this.documents.get(id);
    if (!document) return err(persistenceError('not-found', 'read', `No drill ${id}.`));
    return ok(structuredClone(document));
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

  /**
   * Writes the full v3 document directly, bypassing the merge `drills.set`
   * applies - exactly like the real repository's `saveDocumentV3`, which is a
   * raw `put` with no merge either. This is the one door that can seed or
   * overwrite equipment, groups, annotations, phase structure and rich
   * metadata wholesale.
   */
  async saveDocumentV3(document: DrillDocumentV3): PersistenceResult<void> {
    const failure = this.check('save');
    if (failure) return err(failure);
    this.documents.set(document.id, structuredClone(document));
    return ok(undefined);
  }

  async delete(id: ID): PersistenceResult<void> {
    const failure = this.check('delete');
    if (failure) return err(failure);
    if (!this.documents.has(id)) return err(persistenceError('not-found', 'delete', `No drill ${id}.`));
    this.documents.delete(id);
    return ok(undefined);
  }

  async replaceAndSave(drills: Drill[], replaceIds: ID[]): PersistenceResult<ID[]> {
    const failure = this.check('import') ?? this.check('save');
    if (failure) return err(failure);
    for (const id of replaceIds) {
      const existing = this.documents.get(id);
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
