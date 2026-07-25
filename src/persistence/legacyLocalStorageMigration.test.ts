// ============================================================================
// LEGACY LOCALSTORAGE MIGRATION
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { migrateLegacyLocalStorage } from './legacyLocalStorageMigration';
import { IndexedDbDrillRepository, META_KEYS } from './indexedDbRepository';
import { STORAGE_KEYS } from '@/core/constants';
import { installFakeLocalStorage, resetFakeIndexedDb, type FakeLocalStorage } from '@/test/utils';
import { buildDrill, FIXED_NOW } from '@/test/builders';
import { FakeRepository } from '@/test/fakeRepository';

let repository: IndexedDbDrillRepository;
let storage: FakeLocalStorage;

function legacyKey(id: string): string {
  return `${STORAGE_KEYS.DRILLS}_${id}`;
}

beforeEach(async () => {
  await resetFakeIndexedDb();
  repository = new IndexedDbDrillRepository();
  storage = installFakeLocalStorage();
});

afterEach(() => {
  repository.close();
});

describe('migrateLegacyLocalStorage', () => {
  it('is a no-op with an empty localStorage, and marks itself complete', async () => {
    const result = await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.migratedIds).toEqual([]);
      expect(result.value.skipped).toBe(false);
    }

    const marker = await repository.getMeta<number>(META_KEYS.legacyMigrationCompletedAt);
    expect(marker.ok && marker.value).toBe(FIXED_NOW);
  });

  it('skips on a second run', async () => {
    await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    const second = await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    expect(second.ok && second.value.skipped).toBe(true);
  });

  it('migrates a complete legacy library', async () => {
    const first = buildDrill({ id: 'legacy-1', name: 'Breakout' });
    const second = buildDrill({ id: 'legacy-2', name: 'Forecheck' });
    storage.setItem(legacyKey('legacy-1'), JSON.stringify(first));
    storage.setItem(legacyKey('legacy-2'), JSON.stringify(second));
    storage.setItem(
      STORAGE_KEYS.DRILLS,
      JSON.stringify([
        { id: 'legacy-1', name: 'Breakout', updatedAt: FIXED_NOW },
        { id: 'legacy-2', name: 'Forecheck', updatedAt: FIXED_NOW },
      ])
    );

    const result = await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.migratedIds.sort()).toEqual(['legacy-1', 'legacy-2']);

    const list = await repository.list();
    expect(list.ok && list.value).toHaveLength(2);
  });

  it('migrates a drill whose document exists but is absent from the metadata list', async () => {
    storage.setItem(legacyKey('orphan'), JSON.stringify(buildDrill({ id: 'orphan', name: 'Orphan' })));
    storage.setItem(STORAGE_KEYS.DRILLS, JSON.stringify([]));

    const result = await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    expect(result.ok && result.value.migratedIds).toEqual(['orphan']);
  });

  it('reports a metadata entry whose document is gone, without failing', async () => {
    storage.setItem(
      STORAGE_KEYS.DRILLS,
      JSON.stringify([{ id: 'ghost', name: 'Ghost', updatedAt: FIXED_NOW }])
    );

    const result = await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.migratedIds).toEqual([]);
      expect(result.value.warnings.some(w => w.includes('no longer holds a value'))).toBe(true);
    }
  });

  it('keeps corrupt JSON in the recovery store instead of discarding it', async () => {
    storage.setItem(legacyKey('broken'), '{"name": "Half a drill",');

    const result = await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    expect(result.ok && result.value.recoveredKeys).toEqual([legacyKey('broken')]);

    const recovery = await repository.listRecovery();
    expect(recovery.ok).toBe(true);
    if (recovery.ok) {
      expect(recovery.value[0].source).toBe('legacy-localstorage');
      expect(recovery.value[0].raw).toBe('{"name": "Half a drill",');
    }
  });

  it('repairs a drill with null arrays rather than losing it', async () => {
    storage.setItem(
      legacyKey('nulls'),
      JSON.stringify({ id: 'nulls', name: 'Null arrays', players: null, events: null, skatePaths: null })
    );

    const result = await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    expect(result.ok && result.value.migratedIds).toEqual(['nulls']);

    const read = await repository.read('nulls');
    expect(read.ok && read.value.players).toEqual([]);
  });

  it('drops dangling references and still stores the drill', async () => {
    storage.setItem(
      legacyKey('dangling'),
      JSON.stringify({
        id: 'dangling',
        name: 'Dangling',
        players: [{ id: 'p1', x: 1, y: 2, team: 'home', number: '11', role: 'C', hasPuck: true }],
        skatePaths: [{ id: 'r1', ownerId: 'missing', team: 'home', points: [{ x: 0, y: 0 }] }],
        events: [],
      })
    );

    const result = await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    expect(result.ok && result.value.migratedIds).toEqual(['dangling']);

    const read = await repository.read('dangling');
    expect(read.ok && read.value.skatePaths).toEqual([]);
  });

  it('carries the legacy current-drill pointer across', async () => {
    storage.setItem(legacyKey('current'), JSON.stringify(buildDrill({ id: 'current' })));
    storage.setItem(STORAGE_KEYS.CURRENT_DRILL, 'current');

    await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    const pointer = await repository.getCurrentDrillId();
    expect(pointer.ok && pointer.value).toBe('current');
  });

  it('produces a raw backup of every legacy value, before any repair', async () => {
    storage.setItem(legacyKey('a'), JSON.stringify({ id: 'a', name: 'A', players: null }));
    const result = await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The backup holds each legacy value byte-for-byte as a string, so the
      // original text survives even if it was never valid JSON.
      expect(result.value.rawBackup).toContain('phicecraft_drills_a');
      expect(result.value.rawBackup).toContain('\\"players\\":null');
    }
  });

  it('never deletes the legacy keys', async () => {
    storage.setItem(legacyKey('kept'), JSON.stringify(buildDrill({ id: 'kept' })));
    await migrateLegacyLocalStorage(repository, { now: FIXED_NOW });
    expect(storage.getItem(legacyKey('kept'))).not.toBe(null);
  });

  it('does not mark itself complete when the transactional write fails', async () => {
    const failing = new FakeRepository();
    failing.failOperation('save', { code: 'quota-exceeded', message: 'full' });
    installFakeLocalStorage({ [legacyKey('x')]: JSON.stringify(buildDrill({ id: 'x' })) });

    const result = await migrateLegacyLocalStorage(failing, { now: FIXED_NOW });
    expect(result.ok).toBe(false);
    expect(failing.meta.get(META_KEYS.legacyMigrationCompletedAt)).toBeUndefined();
  });

  it('does not mark itself complete when the migrated drill cannot be read back', async () => {
    const flaky = new FakeRepository();
    installFakeLocalStorage({ [legacyKey('y')]: JSON.stringify(buildDrill({ id: 'y' })) });

    const originalRead = flaky.read.bind(flaky);
    flaky.read = async () => {
      flaky.read = originalRead;
      return { ok: false, error: { code: 'corrupt-data', message: 'bad', operation: 'read', recoverable: false } };
    };

    const result = await migrateLegacyLocalStorage(flaky, { now: FIXED_NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.operation).toBe('migrate');
    expect(flaky.meta.get(META_KEYS.legacyMigrationCompletedAt)).toBeUndefined();
  });

  it('surfaces a failure to read the completion marker', async () => {
    const failing = new FakeRepository();
    failing.failOperation('read', { code: 'unavailable', message: 'no db' });
    const result = await migrateLegacyLocalStorage(failing, { now: FIXED_NOW });
    expect(result.ok).toBe(false);
  });
});
