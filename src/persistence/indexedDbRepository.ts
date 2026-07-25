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
// ============================================================================

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Drill, DrillMeta, ID } from '@/core/types';
import { generateId } from '@/utils/id';
import {
  classifyThrown,
  err,
  ok,
  persistenceError,
  type DrillRepository,
  type PersistenceResult,
  type RecoveryRecord,
} from './types';
import { parseStorableDrill } from './schema';
import { migrateDrillCandidate, repairDrillDocument } from './drillPipeline';

export const DB_NAME = 'phicecraft';
export const DB_VERSION = 1;

export const META_KEYS = {
  currentDrillId: 'currentDrillId',
  legacyMigrationCompletedAt: 'legacyMigrationCompletedAt',
} as const;

interface StoredDrillRecord {
  id: ID;
  name: string;
  updatedAt: number;
  /** The full document, exactly as validated. */
  document: Drill;
}

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

function toRecord(drill: Drill): StoredDrillRecord {
  return { id: drill.id, name: drill.name, updatedAt: drill.updatedAt, document: drill };
}

function toMeta(record: StoredDrillRecord): DrillMeta {
  return { id: record.id, name: record.name, updatedAt: record.updatedAt };
}

/**
 * Read a stored document back through the same normalize/repair pipeline used
 * for imports. A record written by an older build, or scrambled on disk, is
 * repaired rather than crashing the editor - and if it cannot be repaired the
 * caller gets a typed `corrupt-data` error instead of a silent `null`.
 */
function reviveStoredDocument(
  record: StoredDrillRecord | undefined,
  id: ID
): { ok: true; drill: Drill } | { ok: false; reason: string } {
  if (!record) return { ok: false, reason: 'not-found' };

  const { drill } = migrateDrillCandidate(record.document, { fallbackId: id, fallbackName: record.name });
  const repaired = repairDrillDocument({ ...drill, id: drill.id || id }, generateId);
  const parsed = parseStorableDrill(repaired);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '),
    };
  }
  return { ok: true, drill: parsed.drill };
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
        upgrade(db) {
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
        if (revived.ok) drills.push(revived.drill);
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
      // Queue every write, then await the transaction. A failure anywhere
      // aborts all of them together.
      await Promise.all(drills.map(drill => tx.store.put(toRecord(drill))));
      await tx.done;
      return ok(drills.map(drill => drill.id));
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

      for (const drill of drills) {
        await drillStore.put(toRecord(drill));
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
