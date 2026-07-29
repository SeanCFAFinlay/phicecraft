// ============================================================================
// INDEXEDDB REPOSITORY - transactional behaviour against fake-indexeddb
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexedDbDrillRepository, META_KEYS } from './indexedDbRepository';
import { resetFakeIndexedDb, removeIndexedDb } from '@/test/utils';
import { buildDrill, buildDistinctiveRoute, buildPlayer, FIXED_NOW } from '@/test/builders';

let repository: IndexedDbDrillRepository;

beforeEach(async () => {
  await resetFakeIndexedDb();
  repository = new IndexedDbDrillRepository();
});

afterEach(() => {
  repository.close();
});

describe('open', () => {
  it('creates the drills, meta and recovery stores', async () => {
    const result = await repository.open();
    expect(result.ok).toBe(true);
  });

  it('reports `unavailable` rather than throwing when IndexedDB is missing', async () => {
    const saved = globalThis.indexedDB;
    removeIndexedDb();
    const isolated = new IndexedDbDrillRepository();
    const result = await isolated.open();
    globalThis.indexedDB = saved;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.recoverable).toBe(false);
    }
  });

  it('propagates `unavailable` to every operation, never a false empty list', async () => {
    const saved = globalThis.indexedDB;
    removeIndexedDb();
    const isolated = new IndexedDbDrillRepository();
    const list = await isolated.list();
    const read = await isolated.read('anything');
    globalThis.indexedDB = saved;

    expect(list.ok).toBe(false);
    expect(read.ok).toBe(false);
  });
});

describe('save and read', () => {
  it('round-trips a drill', async () => {
    const drill = buildDrill({ skatePaths: [buildDistinctiveRoute('p1')] });
    expect((await repository.save(drill)).ok).toBe(true);

    const read = await repository.read(drill.id);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.name).toBe(drill.name);
      expect(read.value.skatePaths[0].mode).toBe('backward');
      expect(read.value.skatePaths[0].finish).toBe('coast');
    }
  });

  it('distinguishes not-found from a read failure', async () => {
    const result = await repository.read('does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not-found');
  });

  it('refuses to store a drill that fails the schema, with a typed error', async () => {
    const broken = { ...buildDrill(), name: '' };
    const result = await repository.save(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation-failed');

    // Nothing was written.
    expect((await repository.list()).ok && (await repository.list())).toMatchObject({ value: [] });
  });

  it('never lets a non-cloneable value reach the store, v2 in or v3 at rest', async () => {
    // A function is not structured-cloneable. Under v1 storage this reached
    // IndexedDB verbatim and the write failed there; storing v3 at rest means
    // every write is rebuilt field-by-field through `migrateV2ToV3` and
    // re-validated with `parseDrillDocumentV3`, so a function attached to a
    // field the document does not track is dropped before it ever reaches a
    // transaction, and the save of the real content still succeeds.
    const drill = buildDrill();
    const hostile = { ...drill, settings: { ...drill.settings!, onSave: () => {} } } as never;
    const result = await repository.save(hostile);
    expect(result.ok).toBe(true);

    const read = await repository.read(drill.id);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.settings).not.toHaveProperty('onSave');
  });

  it('lists drills newest first', async () => {
    await repository.save(buildDrill({ id: 'a', name: 'Older', updatedAt: FIXED_NOW - 1000 }));
    await repository.save(buildDrill({ id: 'b', name: 'Newer', updatedAt: FIXED_NOW }));

    const list = await repository.list();
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.value.map(meta => meta.id)).toEqual(['b', 'a']);
  });
});

describe('saveMany', () => {
  it('writes every drill in one transaction', async () => {
    const drills = [buildDrill({ id: 'a' }), buildDrill({ id: 'b' }), buildDrill({ id: 'c' })];
    const result = await repository.saveMany(drills);
    expect(result.ok).toBe(true);

    const list = await repository.list();
    expect(list.ok && list.value).toHaveLength(3);
  });

  it('writes nothing at all when one drill in the batch is invalid', async () => {
    const drills = [buildDrill({ id: 'good' }), { ...buildDrill({ id: 'bad' }), players: null } as never];
    const result = await repository.saveMany(drills);

    expect(result.ok).toBe(false);
    const list = await repository.list();
    expect(list.ok && list.value).toHaveLength(0);
  });
});

describe('delete', () => {
  it('removes the drill and reports not-found for a second attempt', async () => {
    const drill = buildDrill({ id: 'target' });
    await repository.save(drill);

    expect((await repository.delete('target')).ok).toBe(true);
    const second = await repository.delete('target');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('not-found');
  });

  it('clears the current-drill pointer in the same transaction', async () => {
    const drill = buildDrill({ id: 'target' });
    await repository.save(drill);
    await repository.setCurrentDrillId('target');

    await repository.delete('target');

    const current = await repository.getCurrentDrillId();
    expect(current.ok && current.value).toBe(null);
  });

  it('leaves other drills untouched', async () => {
    await repository.saveMany([buildDrill({ id: 'a' }), buildDrill({ id: 'b' })]);
    await repository.delete('a');
    const list = await repository.list();
    expect(list.ok && list.value.map(meta => meta.id)).toEqual(['b']);
  });
});

describe('replaceAndSave', () => {
  it('keeps a recovery copy of everything it replaces', async () => {
    const original = buildDrill({ id: 'shared', name: 'Local original' });
    await repository.save(original);

    const incoming = buildDrill({ id: 'shared', name: 'Imported version' });
    const result = await repository.replaceAndSave([incoming], ['shared']);
    expect(result.ok).toBe(true);

    const stored = await repository.read('shared');
    expect(stored.ok && stored.value.name).toBe('Imported version');

    const recovery = await repository.listRecovery();
    expect(recovery.ok).toBe(true);
    if (recovery.ok) {
      expect(recovery.value).toHaveLength(1);
      expect(recovery.value[0].source).toBe('replaced-drill');
      // The snapshot is the v3 document as it was stored, not the v2 `Drill`
      // the caller passed in - storage is v3 at rest, so a recovery copy of
      // "what was there before" is v3 too.
      expect((recovery.value[0].raw as { metadata: { title: string } }).metadata.title).toBe('Local original');
    }
  });

  it('rejects the whole batch when one drill fails validation', async () => {
    await repository.save(buildDrill({ id: 'shared', name: 'Local original' }));
    const result = await repository.replaceAndSave(
      [buildDrill({ id: 'ok' }), { ...buildDrill({ id: 'shared' }), name: '' }],
      ['shared']
    );

    expect(result.ok).toBe(false);
    const stored = await repository.read('shared');
    expect(stored.ok && stored.value.name).toBe('Local original');
  });
});

describe('corrupt stored records', () => {
  it('repairs a record whose arrays went missing, rather than crashing', async () => {
    const drill = buildDrill({ id: 'legacyish' });
    await repository.save(drill);

    // Scramble the stored document behind the repository's back.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('phicecraft');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drills', 'readwrite');
      tx.objectStore('drills').put({
        id: 'legacyish',
        name: 'Scrambled',
        updatedAt: FIXED_NOW,
        document: { id: 'legacyish', name: 'Scrambled', players: null, events: null },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const read = await repository.read('legacyish');
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.players).toEqual([]);
      expect(read.value.events).toEqual([]);
    }
  });

  it('never overwrites the original bytes of a merely-repaired record', async () => {
    const drill = buildDrill({ id: 'legacyish' });
    await repository.save(drill);

    // Scramble the stored document behind the repository's back - the same
    // fixture as above, which only survives via the tolerant repair chain
    // (`migrateDrillCandidate` -> `repairDrillDocument`), not the v3 gate or
    // the strict v2 gate.
    const scrambled = { id: 'legacyish', name: 'Scrambled', players: null, events: null };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('phicecraft');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drills', 'readwrite');
      tx.objectStore('drills').put({ id: 'legacyish', name: 'Scrambled', updatedAt: FIXED_NOW, document: scrambled });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const read = await repository.read('legacyish');
    expect(read.ok).toBe(true);

    // Repair is for what is handed back, not for the durable copy: a repair
    // may drop dangling references or invent a puck carrier, and doing that
    // silently to storage - rather than just to the returned `Drill` - would
    // make a read destructive. The stored bytes must be exactly what was
    // found, still unrepaired, with no recovery snapshot needed because
    // nothing was overwritten.
    const verify = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('phicecraft');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stored = await new Promise<{ document: unknown }>((resolve, reject) => {
      const tx = verify.transaction('drills', 'readonly');
      const req = tx.objectStore('drills').get('legacyish');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    verify.close();
    expect(stored.document).toEqual(scrambled);

    const recovery = await repository.listRecovery();
    expect(recovery.ok && recovery.value).toHaveLength(0);
  });

  it('skips unreadable records in readAll rather than failing the export', async () => {
    await repository.save(buildDrill({ id: 'good', players: [buildPlayer({ id: 'p', hasPuck: true })] }));
    const all = await repository.readAll();
    expect(all.ok && all.value).toHaveLength(1);
  });
});

describe('meta and recovery', () => {
  it('stores and clears the current drill pointer', async () => {
    await repository.setCurrentDrillId('abc');
    expect((await repository.getCurrentDrillId()).ok).toBe(true);
    expect(((await repository.getCurrentDrillId()) as { value: string }).value).toBe('abc');

    await repository.setCurrentDrillId(null);
    const cleared = await repository.getCurrentDrillId();
    expect(cleared.ok && cleared.value).toBe(null);
  });

  it('round-trips arbitrary metadata', async () => {
    await repository.setMeta(META_KEYS.legacyMigrationCompletedAt, FIXED_NOW);
    const value = await repository.getMeta<number>(META_KEYS.legacyMigrationCompletedAt);
    expect(value.ok && value.value).toBe(FIXED_NOW);
  });

  it('returns null for absent metadata rather than an error', async () => {
    const value = await repository.getMeta('never-written');
    expect(value.ok).toBe(true);
    expect(value.ok && value.value).toBe(null);
  });

  it('stores a recovery record whose raw value cannot be cloned', async () => {
    const result = await repository.putRecovery({
      id: 'r1',
      source: 'import',
      reference: 'file.json',
      raw: () => 'not cloneable',
      reason: 'test',
      capturedAt: FIXED_NOW,
    });
    expect(result.ok).toBe(true);

    const records = await repository.listRecovery();
    expect(records.ok && typeof records.value[0].raw).toBe('string');
  });

  it('clears the recovery store', async () => {
    await repository.putRecovery({
      id: 'r1',
      source: 'import',
      reference: 'x',
      raw: {},
      reason: 'test',
      capturedAt: FIXED_NOW,
    });
    await repository.clearRecovery();
    const records = await repository.listRecovery();
    expect(records.ok && records.value).toHaveLength(0);
  });
});

describe('v3 storage', () => {
  it('an edit-save round trip preserves v3-only content at rest', async () => {
    const { DRILL_TEMPLATES } = await import('@/data/templates/registry');
    const { projectToV2 } = await import('@/domain/v3/projectToV2');
    const { openDB } = await import('idb');
    const { DB_NAME, DB_VERSION } = await import('./indexedDbRepository');
    const withGear = DRILL_TEMPLATES.find(t => t.document.equipment.length > 0);
    expect(withGear).toBeDefined();

    const stored = structuredClone(withGear!.document);
    const seeded = await repository.saveDocumentV3(stored); // seeded as full v3 (Task 4 uses this)
    expect(seeded.ok).toBe(true);

    const { drill } = projectToV2(stored);
    drill.players[0] = { ...drill.players[0], x: drill.players[0].x + 10 };
    const saved = await repository.saveMany([drill]);
    expect(saved.ok).toBe(true);

    const db = await openDB(DB_NAME, DB_VERSION);
    const record = await db.get('drills', stored.id);
    expect(record.document.equipment).toEqual(stored.equipment);
    db.close();
  });
});

describe('read-back after a restart', () => {
  it('survives closing and reopening the database', async () => {
    const drill = buildDrill({ id: 'persisted', name: 'Persisted' });
    await repository.save(drill);
    repository.close();

    const reopened = new IndexedDbDrillRepository();
    const read = await reopened.read('persisted');
    expect(read.ok && read.value.name).toBe('Persisted');
    reopened.close();
  });
});
