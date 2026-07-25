// ============================================================================
// REPOSITORY FAILURE PATHS
//
// Every operation has to survive the database going away mid-session (a tab
// deleting it, a private-mode eviction, a browser upgrade). None of them may
// report success, and none may return an empty list that reads as "you have
// no drills".
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexedDbDrillRepository } from './indexedDbRepository';
import { resetFakeIndexedDb } from '@/test/utils';
import { buildDrill, FIXED_NOW } from '@/test/builders';

let repository: IndexedDbDrillRepository;

/**
 * Close the underlying database behind the repository's back, leaving it with
 * a dead handle - exactly what happens when another tab deletes the database.
 */
async function killUnderlyingDatabase(repo: IndexedDbDrillRepository): Promise<void> {
  // Reach the private handle: the point of the test is the state the app can
  // genuinely end up in, not the encapsulation.
  const handle = (repo as unknown as { db: IDBDatabase | null }).db;
  handle?.close();
  (repo as unknown as { db: IDBDatabase | null }).db = {
    get: () => {
      throw Object.assign(new Error('database is closed'), { name: 'InvalidStateError' });
    },
    getAllFromIndex: () => {
      throw Object.assign(new Error('database is closed'), { name: 'InvalidStateError' });
    },
    getAll: () => {
      throw Object.assign(new Error('database is closed'), { name: 'InvalidStateError' });
    },
    put: () => {
      throw Object.assign(new Error('database is closed'), { name: 'InvalidStateError' });
    },
    delete: () => {
      throw Object.assign(new Error('database is closed'), { name: 'InvalidStateError' });
    },
    clear: () => {
      throw Object.assign(new Error('database is closed'), { name: 'InvalidStateError' });
    },
    transaction: () => {
      throw Object.assign(new Error('database is closed'), { name: 'InvalidStateError' });
    },
    addEventListener: () => {},
    close: () => {},
  } as unknown as IDBDatabase;
}

beforeEach(async () => {
  await resetFakeIndexedDb();
  repository = new IndexedDbDrillRepository();
  await repository.open();
});

afterEach(() => {
  repository.close();
});

describe('a dead database handle', () => {
  it('fails list with a typed transaction error, not an empty library', async () => {
    await killUnderlyingDatabase(repository);
    const result = await repository.list();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('transaction-failed');
  });

  it('fails read without being mistaken for not-found', async () => {
    await killUnderlyingDatabase(repository);
    const result = await repository.read('anything');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).not.toBe('not-found');
  });

  it('fails readAll', async () => {
    await killUnderlyingDatabase(repository);
    expect((await repository.readAll()).ok).toBe(false);
  });

  it('fails saveMany', async () => {
    await killUnderlyingDatabase(repository);
    expect((await repository.saveMany([buildDrill()])).ok).toBe(false);
  });

  it('fails save', async () => {
    await killUnderlyingDatabase(repository);
    expect((await repository.save(buildDrill())).ok).toBe(false);
  });

  it('fails delete', async () => {
    await killUnderlyingDatabase(repository);
    expect((await repository.delete('x')).ok).toBe(false);
  });

  it('fails replaceAndSave', async () => {
    await killUnderlyingDatabase(repository);
    expect((await repository.replaceAndSave([buildDrill()], [])).ok).toBe(false);
  });

  it('fails metadata reads and writes', async () => {
    await killUnderlyingDatabase(repository);
    expect((await repository.getMeta('k')).ok).toBe(false);
    expect((await repository.setMeta('k', 1)).ok).toBe(false);
    expect((await repository.getCurrentDrillId()).ok).toBe(false);
    expect((await repository.setCurrentDrillId('a')).ok).toBe(false);
    expect((await repository.setCurrentDrillId(null)).ok).toBe(false);
  });

  it('fails recovery reads and writes', async () => {
    await killUnderlyingDatabase(repository);
    expect(
      (
        await repository.putRecovery({
          id: 'r',
          source: 'import',
          reference: 'x',
          raw: {},
          reason: 'y',
          capturedAt: FIXED_NOW,
        })
      ).ok
    ).toBe(false);
    expect((await repository.listRecovery()).ok).toBe(false);
    expect((await repository.clearRecovery()).ok).toBe(false);
  });
});

describe('empty inputs', () => {
  it('treats saving nothing as a success that writes nothing', async () => {
    const result = await repository.saveMany([]);
    expect(result.ok && result.value).toEqual([]);
    expect((await repository.list()).ok).toBe(true);
  });

  it('treats replacing nothing as a success', async () => {
    const result = await repository.replaceAndSave([], ['ghost']);
    expect(result.ok && result.value).toEqual([]);
  });

  it('ignores a replace target that no longer exists', async () => {
    const result = await repository.replaceAndSave([buildDrill({ id: 'new' })], ['ghost']);
    expect(result.ok).toBe(true);
    const recovery = await repository.listRecovery();
    expect(recovery.ok && recovery.value).toHaveLength(0);
  });
});

describe('reopening', () => {
  it('opens lazily on first use without an explicit open()', async () => {
    const lazy = new IndexedDbDrillRepository();
    const result = await lazy.list();
    expect(result.ok).toBe(true);
    lazy.close();
  });

  it('is safe to call open() repeatedly', async () => {
    expect((await repository.open()).ok).toBe(true);
    expect((await repository.open()).ok).toBe(true);
  });

  it('reopens after close()', async () => {
    await repository.save(buildDrill({ id: 'kept' }));
    repository.close();
    const read = await repository.read('kept');
    expect(read.ok).toBe(true);
  });
});
