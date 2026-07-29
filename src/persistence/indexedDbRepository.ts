// ============================================================================
// INDEXEDDB REPOSITORY
//
// The durable store. Two rules govern everything here:
//
//   1. A write that touches more than one record happens in ONE transaction.
//      If any part fails, IndexedDB aborts the whole thing and the previous
//      durable state is exactly what it was.
//   2. Nothing returns a bare boolean. A caller can always tell "no such
//      drill" from "the read failed", because only one of those is safe to
//      show as an empty library.
//
// STORAGE IS V3 AT REST. Every method here still speaks the v2 `Drill` the
// engine, the UI and every command understand - that interface does not
// change - but what actually sits in the `drills` store is a
// `DrillDocumentV3`. `reviveStoredDocument` and `saveMany`/`replaceAndSave`
// are the seam: they translate between the two on every read and write.
// ============================================================================

import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type { Drill, DrillMeta, ID } from '@/core/types';
import type { DrillDocumentV3 } from '@/domain/v3/types';
import { generateId } from '@/utils/id';
import {
  classifyThrown,
  err,
  ok,
  persistenceError,
  type DrillRepository,
  type PersistenceResult,
  type RecoveryRecord,
  type StoredDrillRecord,
} from './types';
import { parseStorableDrill, parseStoredDrillRecord } from './schema';
import { migrateDrillCandidate, repairDrillDocument } from './drillPipeline';
import { parseDrillDocumentV3 } from '@/domain/v3/schema';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { mergeEditedIntoStored } from '@/domain/v3/mergeEditedV2';

export const DB_NAME = 'phicecraft';
export const DB_VERSION = 2;

export const META_KEYS = {
  currentDrillId: 'currentDrillId',
  legacyMigrationCompletedAt: 'legacyMigrationCompletedAt',
} as const;

interface PhiceCraftDb extends DBSchema {
  drills: {
    key: ID;
    value: StoredDrillRecord;
    indexes: { updatedAt: number };
  };
  meta: {
    key: string;
    value: unknown;
  };
  recovery: {
    key: string;
    value: RecoveryRecord;
  };
}

function toStoredRecord(document: DrillDocumentV3): StoredDrillRecord {
  return { id: document.id, name: document.metadata.title, updatedAt: document.updatedAt, document };
}

function toMeta(record: StoredDrillRecord): DrillMeta {
  return { id: record.id, name: record.name, updatedAt: record.updatedAt };
}

// ----------------------------------------------------------------------------
// v1 -> v2 database upgrade: rewrite every stored document as v3
// ----------------------------------------------------------------------------

/**
 * Bring one stored (still v2) document up to v3, the way a fresh migration
 * should: no fallback identity is offered, unlike a read where the caller
 * already knows the key it asked for. A record with no usable id of its own
 * is not silently given one here - it is quarantined instead, so a genuinely
 * unreadable record surfaces rather than acquiring an identity nobody
 * authored.
 */
function migrateStoredDocumentToV3(
  document: unknown
): { ok: true; document: DrillDocumentV3 } | { ok: false; reason: string } {
  const { drill } = migrateDrillCandidate(document);
  const repaired = repairDrillDocument(drill, generateId);
  const parsed = parseStorableDrill(repaired);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '),
    };
  }
  return { ok: true, document: migrateV2ToV3(parsed.drill) };
}

/**
 * Cursor over every record in `drills`, rewriting each one's document as v3.
 * Runs inside the version-change transaction itself: every function it calls
 * (`migrateDrillCandidate`, `repairDrillDocument`, `migrateV2ToV3`) is
 * synchronous, so the only asynchronous steps are the store requests that
 * keep this same transaction alive.
 */
async function migrateDrillsToV3(
  tx: IDBPTransaction<PhiceCraftDb, StoreNames<PhiceCraftDb>[], 'versionchange'>
): Promise<void> {
  const drillStore = tx.objectStore('drills');
  const recoveryStore = tx.objectStore('recovery');

  let cursor = await drillStore.openCursor();
  while (cursor) {
    const record = cursor.value as unknown as { id: ID; name: string; updatedAt: number; document: unknown };
    const migrated = migrateStoredDocumentToV3(record.document);
    if (migrated.ok) {
      await cursor.update(toStoredRecord(migrated.document));
    } else {
      await recoveryStore.put({
        id: `corrupt-${record.id}-${Date.now()}`,
        source: 'corrupt-record',
        reference: record.id,
        raw: record.document,
        reason: migrated.reason,
        capturedAt: Date.now(),
      });
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
}

// ----------------------------------------------------------------------------
// Reading a stored record back
// ----------------------------------------------------------------------------

interface RevivedDocument {
  ok: true;
  drill: Drill;
  /**
   * Present when the record was reconstructed from something other than a
   * genuine v3 document (a half-upgraded store, or a scrambled one) - the
   * caller should persist this so the fallback does not run again next time.
   */
  rewrite?: StoredDrillRecord;
}

/**
 * Read a stored document back. Storage is v3 at rest, so the primary path is
 * the v3 gate followed by the v2 projection the current engine runs on. Two
 * fallbacks exist beneath it, in order:
 *
 *   1. A record that fails the v3 gate but is still a well-formed v2
 *      document - belt-and-braces for a store that missed the version-change
 *      migration - is migrated on the fly and rewritten.
 *   2. Anything else goes through the same tolerant repair every stored
 *      document has always gone through (`migrateDrillCandidate` ->
 *      `repairDrillDocument`), because a record written by an older build, or
 *      scrambled on disk, should be repaired rather than crash the editor.
 *      If even that fails, the caller gets a typed `corrupt-data` error
 *      instead of a silent `null`.
 */
function reviveStoredDocument(
  record: StoredDrillRecord | undefined,
  id: ID
): RevivedDocument | { ok: false; reason: string } {
  if (!record) return { ok: false, reason: 'not-found' };

  const gated = parseStoredDrillRecord(record);
  if (gated.ok) {
    const { drill } = projectToV2(gated.record.document);
    return { ok: true, drill: repairDrillDocument(drill, generateId) };
  }

  const legacy = parseStorableDrill(record.document);
  if (legacy.ok) {
    return { ok: true, drill: legacy.drill, rewrite: toStoredRecord(migrateV2ToV3(legacy.drill)) };
  }

  const { drill } = migrateDrillCandidate(record.document, { fallbackId: id, fallbackName: record.name });
  const repaired = repairDrillDocument({ ...drill, id: drill.id || id }, generateId);
  const parsed = parseStorableDrill(repaired);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '),
    };
  }
  return { ok: true, drill: parsed.drill, rewrite: toStoredRecord(migrateV2ToV3(parsed.drill)) };
}

// ----------------------------------------------------------------------------
// Writing: read-merge-validate-write
// ----------------------------------------------------------------------------

/**
 * What a `Drill` the editor hands back should be written as: merged with
 * whatever is already stored under that id, so v3-only content the v2
 * projection cannot express - equipment, annotations, extra puck tracks,
 * phase structure, rich metadata - survives the round trip.
 */
function prepareForWrite(
  drill: Drill,
  existing: StoredDrillRecord | undefined
): { ok: true; record: StoredDrillRecord } | { ok: false; message: string } {
  const migrated = migrateV2ToV3(drill);
  const next = existing ? mergeEditedIntoStored(existing.document, migrated) : migrated;
  const parsed = parseDrillDocumentV3(next);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  return { ok: true, record: toStoredRecord(parsed.document) };
}

export class IndexedDbDrillRepository implements DrillRepository {
  private db: IDBPDatabase<PhiceCraftDb> | null = null;
  private opening: Promise<IDBPDatabase<PhiceCraftDb>> | null = null;

  private async getDb(): Promise<IDBPDatabase<PhiceCraftDb>> {
    if (this.db) return this.db;
    if (!this.opening) {
      if (typeof indexedDB === 'undefined') {
        this.opening = null;
        throw persistenceError('unavailable', 'open', 'IndexedDB is not available in this browser.');
      }
      this.opening = openDB<PhiceCraftDb>(DB_NAME, DB_VERSION, {
        async upgrade(db, oldVersion, _newVersion, transaction) {
          if (!db.objectStoreNames.contains('drills')) {
            const drills = db.createObjectStore('drills', { keyPath: 'id' });
            drills.createIndex('updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta');
          }
          if (!db.objectStoreNames.contains('recovery')) {
            db.createObjectStore('recovery', { keyPath: 'id' });
          }
          if (oldVersion < 2) {
            await migrateDrillsToV3(transaction);
          }
        },
      }).then(db => {
        this.db = db;
        // A tab that gets its database deleted or upgraded elsewhere must not
        // keep a dead handle around and report phantom successes.
        db.addEventListener('close', () => {
          this.db = null;
          this.opening = null;
        });
        return db;
      });
      this.opening.catch(() => {
        this.opening = null;
      });
    }
    return this.opening;
  }

  /** Best-effort: a failed rewrite must never turn a successful read into a failure. */
  private async rewriteStoredRecord(record: StoredDrillRecord): Promise<void> {
    try {
      const db = await this.getDb();
      await db.put('drills', record);
    } catch {
      // The fallback simply runs again on the next read.
    }
  }

  async open(): PersistenceResult<void> {
    try {
      await this.getDb();
      return ok(undefined);
    } catch (cause) {
      return err(
        (cause as { code?: unknown })?.code
          ? (cause as ReturnType<typeof persistenceError>)
          : classifyThrown('open', cause, 'Could not open local storage.')
      );
    }
  }

  async list(): PersistenceResult<DrillMeta[]> {
    try {
      const db = await this.getDb();
      const records = await db.getAllFromIndex('drills', 'updatedAt');
      return ok(records.reverse().map(toMeta));
    } catch (cause) {
      return err(classifyThrown('list', cause, 'Could not read the drill list.'));
    }
  }

  async read(id: ID): PersistenceResult<Drill> {
    try {
      const db = await this.getDb();
      const record = await db.get('drills', id);
      const revived = reviveStoredDocument(record, id);
      if (!revived.ok) {
        if (revived.reason === 'not-found') {
          return err(persistenceError('not-found', 'read', `No drill stored with id ${id}.`));
        }
        await this.putRecovery({
          id: `corrupt-${id}-${Date.now()}`,
          source: 'corrupt-record',
          reference: id,
          raw: record,
          reason: revived.reason,
          capturedAt: Date.now(),
        });
        return err(
          persistenceError('corrupt-data', 'read', `Stored drill ${id} could not be read: ${revived.reason}`)
        );
      }
      if (revived.rewrite) await this.rewriteStoredRecord(revived.rewrite);
      return ok(revived.drill);
    } catch (cause) {
      return err(classifyThrown('read', cause, `Could not read drill ${id}.`));
    }
  }

  async readAll(): PersistenceResult<Drill[]> {
    try {
      const db = await this.getDb();
      const records = await db.getAllFromIndex('drills', 'updatedAt');
      const drills: Drill[] = [];
      for (const record of records.reverse()) {
        const revived = reviveStoredDocument(record, record.id);
        if (revived.ok) {
          drills.push(revived.drill);
          if (revived.rewrite) await this.rewriteStoredRecord(revived.rewrite);
        }
      }
      return ok(drills);
    } catch (cause) {
      return err(classifyThrown('read', cause, 'Could not read stored drills.'));
    }
  }

  async save(drill: Drill): PersistenceResult<void> {
    const result = await this.saveMany([drill]);
    return result.ok ? ok(undefined) : err(result.error);
  }

  async saveMany(drills: Drill[]): PersistenceResult<ID[]> {
    if (drills.length === 0) return ok([]);

    for (const drill of drills) {
      const parsed = parseStorableDrill(drill);
      if (!parsed.ok) {
        return err(
          persistenceError(
            'validation-failed',
            'save',
            `Drill "${drill?.name ?? 'unknown'}" failed validation: ${parsed.issues
              .slice(0, 3)
              .map(issue => `${issue.path} ${issue.message}`)
              .join('; ')}`
          )
        );
      }
    }

    try {
      const db = await this.getDb();
      const tx = db.transaction('drills', 'readwrite');
      const store = tx.store;
      const records: StoredDrillRecord[] = [];
      for (const drill of drills) {
        const existing = await store.get(drill.id);
        const prepared = prepareForWrite(drill, existing);
        if (!prepared.ok) {
          return err(
            persistenceError('validation-failed', 'save', `Drill "${drill.name}" failed validation: ${prepared.message}`)
          );
        }
        records.push(prepared.record);
      }
      // Queue every write, then await the transaction. A failure anywhere
      // aborts all of them together.
      await Promise.all(records.map(record => store.put(record)));
      await tx.done;
      return ok(drills.map(drill => drill.id));
    } catch (cause) {
      return err(classifyThrown('save', cause, 'The drill could not be saved.'));
    }
  }

  async saveDocumentV3(document: DrillDocumentV3): PersistenceResult<void> {
    const parsed = parseDrillDocumentV3(document);
    if (!parsed.ok) {
      return err(
        persistenceError('validation-failed', 'save', `Document "${document?.id ?? 'unknown'}" failed validation: ${parsed.message}`)
      );
    }
    try {
      const db = await this.getDb();
      await db.put('drills', toStoredRecord(parsed.document));
      return ok(undefined);
    } catch (cause) {
      return err(classifyThrown('save', cause, 'The drill could not be saved.'));
    }
  }

  async delete(id: ID): PersistenceResult<void> {
    try {
      const db = await this.getDb();
      const existing = await db.get('drills', id);
      if (!existing) {
        return err(persistenceError('not-found', 'delete', `No drill stored with id ${id}.`));
      }
      const tx = db.transaction(['drills', 'meta'], 'readwrite');
      await tx.objectStore('drills').delete(id);
      const currentId = await tx.objectStore('meta').get(META_KEYS.currentDrillId);
      if (currentId === id) {
        await tx.objectStore('meta').delete(META_KEYS.currentDrillId);
      }
      await tx.done;
      return ok(undefined);
    } catch (cause) {
      return err(classifyThrown('delete', cause, `Drill ${id} could not be deleted.`));
    }
  }

  async replaceAndSave(drills: Drill[], replaceIds: ID[]): PersistenceResult<ID[]> {
    if (drills.length === 0) return ok([]);

    for (const drill of drills) {
      const parsed = parseStorableDrill(drill);
      if (!parsed.ok) {
        return err(
          persistenceError(
            'validation-failed',
            'import',
            `Drill "${drill?.name ?? 'unknown'}" failed validation and nothing was replaced.`
          )
        );
      }
    }

    try {
      const db = await this.getDb();
      const tx = db.transaction(['drills', 'recovery'], 'readwrite');
      const drillStore = tx.objectStore('drills');
      const recoveryStore = tx.objectStore('recovery');

      const records: StoredDrillRecord[] = [];
      for (const drill of drills) {
        const existing = await drillStore.get(drill.id);
        const prepared = prepareForWrite(drill, existing);
        if (!prepared.ok) {
          return err(
            persistenceError(
              'validation-failed',
              'import',
              `Drill "${drill.name}" failed validation and nothing was replaced: ${prepared.message}`
            )
          );
        }
        records.push(prepared.record);
      }

      // Keep a copy of anything about to be overwritten, inside the same
      // transaction, so a replacement can never destroy the only copy.
      for (const id of replaceIds) {
        const existing = await drillStore.get(id);
        if (existing) {
          await recoveryStore.put({
            id: `replaced-${id}-${existing.updatedAt}`,
            source: 'replaced-drill',
            reference: id,
            raw: existing.document,
            reason: 'Replaced by an explicitly confirmed import.',
            capturedAt: Date.now(),
          });
        }
      }

      for (const record of records) {
        await drillStore.put(record);
      }

      await tx.done;
      return ok(drills.map(drill => drill.id));
    } catch (cause) {
      return err(classifyThrown('import', cause, 'The import could not be stored.'));
    }
  }

  async getCurrentDrillId(): PersistenceResult<ID | null> {
    const result = await this.getMeta<ID>(META_KEYS.currentDrillId);
    return result;
  }

  async setCurrentDrillId(id: ID | null): PersistenceResult<void> {
    if (id === null) {
      try {
        const db = await this.getDb();
        await db.delete('meta', META_KEYS.currentDrillId);
        return ok(undefined);
      } catch (cause) {
        return err(classifyThrown('save', cause, 'Could not clear the current drill.'));
      }
    }
    return this.setMeta(META_KEYS.currentDrillId, id);
  }

  async getMeta<T>(key: string): PersistenceResult<T | null> {
    try {
      const db = await this.getDb();
      const value = await db.get('meta', key);
      return ok((value ?? null) as T | null);
    } catch (cause) {
      return err(classifyThrown('read', cause, `Could not read metadata ${key}.`));
    }
  }

  async setMeta(key: string, value: unknown): PersistenceResult<void> {
    try {
      const db = await this.getDb();
      await db.put('meta', value, key);
      return ok(undefined);
    } catch (cause) {
      return err(classifyThrown('save', cause, `Could not write metadata ${key}.`));
    }
  }

  async putRecovery(record: RecoveryRecord): PersistenceResult<void> {
    try {
      const db = await this.getDb();
      // A recovery copy must never itself be the thing that throws, so the raw
      // value is stored as text if it cannot be structured-cloned.
      let raw = record.raw;
      try {
        structuredClone(raw);
      } catch {
        raw = String(raw);
      }
      await db.put('recovery', { ...record, raw });
      return ok(undefined);
    } catch (cause) {
      return err(classifyThrown('save', cause, 'Could not store the recovery copy.'));
    }
  }

  async listRecovery(): PersistenceResult<RecoveryRecord[]> {
    try {
      const db = await this.getDb();
      const records = await db.getAll('recovery');
      return ok(records.sort((a, b) => b.capturedAt - a.capturedAt));
    } catch (cause) {
      return err(classifyThrown('read', cause, 'Could not read the recovery store.'));
    }
  }

  async clearRecovery(): PersistenceResult<void> {
    try {
      const db = await this.getDb();
      await db.clear('recovery');
      return ok(undefined);
    } catch (cause) {
      return err(classifyThrown('delete', cause, 'Could not clear the recovery store.'));
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.opening = null;
  }
}
