// ============================================================================
// V1 -> V2 DATABASE UPGRADE - the stored document becomes v3, in place
// ============================================================================

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB, type IDBPDatabase } from 'idb';
import { IndexedDbDrillRepository, DB_NAME, DB_VERSION } from './indexedDbRepository';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { resetFakeIndexedDb } from '@/test/utils';

async function seedV1Database() {
  // Build the schema exactly as DB_VERSION 1 did, with a v2 document inside.
  const db = await openDB(DB_NAME, 1, {
    upgrade(database) {
      const drills = database.createObjectStore('drills', { keyPath: 'id' });
      drills.createIndex('updatedAt', 'updatedAt');
      database.createObjectStore('meta');
      database.createObjectStore('recovery', { keyPath: 'id' });
    },
  });
  const drill = structuredClone(giveAndGoRegressionDrill);
  await db.put('drills', { id: drill.id, name: drill.name, updatedAt: drill.updatedAt, document: drill });
  // No `id` inside the document itself, and no fallback is offered during a
  // version-change migration - unlike a read, which always knows the key it
  // asked for. That is what makes this one genuinely unmigratable.
  await db.put('drills', { id: 'corrupt', name: 'bad', updatedAt: 1, document: { schemaVersion: 2, players: 'nope' } });
  db.close();
}

let repository: IndexedDbDrillRepository | null = null;

describe('DB v1 -> v2 upgrade', () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase(DB_NAME);
    await seedV1Database();
  });

  afterEach(() => {
    repository?.close();
    repository = null;
  });

  it('bumps to version 2', () => {
    expect(DB_VERSION).toBe(2);
  });

  it('rewrites stored v2 documents as v3 and the app still loads them', async () => {
    repository = new IndexedDbDrillRepository();
    const loaded = await repository.readAll();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const revived = loaded.value.find(d => d.id === giveAndGoRegressionDrill.id);
      expect(revived).toBeDefined();
      expect(revived!.schemaVersion).toBe(2); // the app still receives v2
      expect(revived!.players.length).toBe(giveAndGoRegressionDrill.players.length);
    }
    repository.close();
    repository = null;

    const db = await openDB(DB_NAME, DB_VERSION);
    const record = await db.get('drills', giveAndGoRegressionDrill.id);
    expect(record.document.schemaVersion).toBe(3); // ...but storage holds v3
    db.close();
  });

  it('quarantines an unmigratable record into recovery instead of dying', async () => {
    repository = new IndexedDbDrillRepository();
    const loaded = await repository.readAll();
    expect(loaded.ok).toBe(true);
    repository.close();
    repository = null;

    const db = await openDB(DB_NAME, DB_VERSION);
    const remaining = await db.get('drills', 'corrupt');
    const recovery = await db.getAll('recovery');
    expect(remaining).toBeUndefined();
    expect(recovery.some(r => r.source === 'corrupt-record')).toBe(true);
    db.close();
  });
});

describe('a record that missed the version-change migration', () => {
  let repository: IndexedDbDrillRepository;

  beforeEach(async () => {
    await resetFakeIndexedDb();
    repository = new IndexedDbDrillRepository();
    await repository.open();
  });

  afterEach(() => {
    repository.close();
  });

  /**
   * Write a still-v2 record straight into an already-v2 (DB_VERSION 2) store -
   * a genuinely complete, valid v2 document (`coaches` included: the strict
   * v2 schema requires it even though the domain type leaves it optional for
   * backward compatibility), so this exercises the belt-and-braces "well-formed
   * v2" tier rather than falling through to the tolerant-repair tier.
   */
  async function insertRawV2Record() {
    const drill = { ...structuredClone(giveAndGoRegressionDrill), coaches: [] };
    const db = await openDB(DB_NAME, DB_VERSION);
    await db.put('drills', { id: drill.id, name: drill.name, updatedAt: drill.updatedAt, document: drill });
    db.close();
    return drill;
  }

  it('migrates it on the fly and rewrites it as v3', async () => {
    const drill = await insertRawV2Record();

    const loaded = await repository.readAll();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const revived = loaded.value.find(d => d.id === drill.id);
      expect(revived).toBeDefined();
      expect(revived!.players.length).toBe(drill.players.length);
    }

    const db = await openDB(DB_NAME, DB_VERSION);
    const record = await db.get('drills', drill.id);
    expect(record.document.schemaVersion).toBe(3);
    db.close();
  });

  it('saving over it merges instead of throwing on the still-v2 stored document', async () => {
    const drill = await insertRawV2Record();

    // `existing.document` here is still the raw v2 `Drill`, not a
    // `DrillDocumentV3` - `prepareForWrite` must gate it before handing it to
    // `mergeEditedIntoStored`, or the merge throws on `stored.phases.length`
    // and the edit is silently dropped.
    const edited = { ...drill, name: 'Edited via v2 editor', updatedAt: drill.updatedAt + 1 };
    const result = await repository.save(edited);
    expect(result.ok).toBe(true);

    const read = await repository.read(drill.id);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.name).toBe('Edited via v2 editor');
  });

  it('migrates a still-v2 record on the fly for readAllDocumentsV3 too', async () => {
    const drill = await insertRawV2Record();

    const loaded = await repository.readAllDocumentsV3();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const revived = loaded.value.find(document => document.id === drill.id);
      expect(revived).toBeDefined();
      expect(revived!.schemaVersion).toBe(3);
      expect(revived!.actors.length).toBe(drill.players.length);
    }

    const db = await openDB(DB_NAME, DB_VERSION);
    const record = await db.get('drills', drill.id);
    expect(record.document.schemaVersion).toBe(3);
    db.close();
  });

  it('does not fail the read when the rewrite itself cannot be persisted', async () => {
    const drill = await insertRawV2Record();

    // The rewrite is best-effort: make the write half of it fail without
    // touching the read that comes first, and confirm the read still succeeds.
    const handle = (repository as unknown as { db: IDBPDatabase<unknown> }).db;
    handle.put = (() => {
      throw new Error('simulated write failure');
    }) as typeof handle.put;

    const result = await repository.read(drill.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.players.length).toBe(drill.players.length);
  });
});

describe('a record whose stored wrapper id does not match its document id', () => {
  const GOOD_ID = giveAndGoRegressionDrill.id;
  const MISMATCHED_WRAPPER_ID = 'wrapper-mismatch';
  const MISMATCHED_DOCUMENT_ID = 'fixture-give-and-go-2';

  // `migrateStoredDocumentToV3` has no fallback identity during a
  // version-change migration (unlike a read, which always knows the key it
  // asked for) - see the comment on that function. That means when a
  // document's own `id` field disagrees with the wrapper's key, the migrated
  // record is written back keyed by the DOCUMENT's id (`toStoredRecord`
  // always uses `document.id`), which no longer matches the cursor's actual
  // primary key. That is exactly the tampered-record shape that makes
  // `cursor.update` throw `DataError`, without needing a document that fails
  // the migration pipeline outright (which is total for any input).
  async function seedMismatchedDatabase() {
    const db = await openDB(DB_NAME, 1, {
      upgrade(database) {
        const drills = database.createObjectStore('drills', { keyPath: 'id' });
        drills.createIndex('updatedAt', 'updatedAt');
        database.createObjectStore('meta');
        database.createObjectStore('recovery', { keyPath: 'id' });
      },
    });

    const good = structuredClone(giveAndGoRegressionDrill);
    await db.put('drills', { id: good.id, name: good.name, updatedAt: good.updatedAt, document: good });

    const mismatched = { ...structuredClone(giveAndGoRegressionDrill), id: MISMATCHED_DOCUMENT_ID };
    await db.put('drills', {
      id: MISMATCHED_WRAPPER_ID,
      name: mismatched.name,
      updatedAt: mismatched.updatedAt,
      document: mismatched,
    });

    db.close();
  }

  let repository: IndexedDbDrillRepository | null = null;

  beforeEach(async () => {
    indexedDB.deleteDatabase(DB_NAME);
    await seedMismatchedDatabase();
  });

  afterEach(() => {
    repository?.close();
    repository = null;
  });

  it('quarantines the mismatched record and still migrates every other record', async () => {
    repository = new IndexedDbDrillRepository();
    const loaded = await repository.readAll();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      // One bad record does not prevent the rest of the store from migrating.
      const revived = loaded.value.find(d => d.id === GOOD_ID);
      expect(revived).toBeDefined();
      expect(revived!.players.length).toBe(giveAndGoRegressionDrill.players.length);
      expect(loaded.value.some(d => d.id === MISMATCHED_DOCUMENT_ID)).toBe(false);
    }
    repository.close();
    repository = null;

    const db = await openDB(DB_NAME, DB_VERSION);
    const remainingGood = await db.get('drills', GOOD_ID);
    expect(remainingGood?.document.schemaVersion).toBe(3);

    const remainingMismatched = await db.get('drills', MISMATCHED_WRAPPER_ID);
    expect(remainingMismatched).toBeUndefined();

    const recovery = await db.getAll('recovery');
    const quarantined = recovery.find(r => r.reference === MISMATCHED_WRAPPER_ID);
    expect(quarantined).toBeDefined();
    expect(quarantined?.source).toBe('corrupt-record');
    db.close();
  });
});
