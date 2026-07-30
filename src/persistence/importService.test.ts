// ============================================================================
// IMPORT SERVICE
//
// The defects these lock down:
//   - an ID-less drill was stored under `undefined`
//   - a matching ID silently overwrote local work
//   - the app opened `getDrillList()[0]` and hoped that was the import
//   - child IDs and references were never remapped
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { commitImport, importAsCopies, prepareImport } from './importService';
import { FakeRepository } from '@/test/fakeRepository';
import { buildDrill, buildDistinctiveRoute, buildPass, buildPlayer, FIXED_NOW } from '@/test/builders';
import { IMPORT_LIMITS } from './schema';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import type { DrillDocumentV3 } from '@/domain/v3/types';
import { err, persistenceError, type PersistenceResult } from './types';

let repository: FakeRepository;

beforeEach(() => {
  repository = new FakeRepository();
});

function json(value: unknown): string {
  return JSON.stringify(value);
}

describe('prepareImport limits and shapes', () => {
  it('rejects a file above the byte limit', async () => {
    const huge = 'x'.repeat(IMPORT_LIMITS.maxBytes + 1);
    const result = await prepareImport(huge, repository);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('import limit');
  });

  it('rejects invalid JSON with a corrupt-data error', async () => {
    const result = await prepareImport('{ not json', repository);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('corrupt-data');
  });

  it('rejects more drills than the per-import limit', async () => {
    const many = Array.from({ length: IMPORT_LIMITS.maxDrills + 1 }, (_, index) =>
      buildDrill({ id: `d${index}` })
    );
    const result = await prepareImport(json(many), repository);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('per-import limit');
  });

  it('accepts a bare drill, an array, and an exported envelope', async () => {
    const drill = buildDrill();
    for (const payload of [drill, [drill], { format: 'phicecraft-drills', drills: [drill] }]) {
      const result = await prepareImport(json(payload), repository);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.candidates).toHaveLength(1);
    }
  });

  it('reports a per-entry failure without discarding the valid entries', async () => {
    const result = await prepareImport(json([buildDrill({ id: 'good' }), 42, null]), repository);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.candidates).toHaveLength(1);
      expect(result.value.failures).toHaveLength(2);
      expect(result.value.failures[0].sourceIndex).toBe(1);
    }
  });

  it('surfaces a failure to read the local list rather than guessing there are no collisions', async () => {
    repository.failOperation('list', { code: 'unavailable', message: 'no db' });
    const result = await prepareImport(json(buildDrill()), repository);
    expect(result.ok).toBe(false);
  });

  it('propagates a prepare failure through importAsCopies rather than committing anything', async () => {
    repository.failOperation('list', { code: 'unavailable', message: 'no db' });
    const result = await importAsCopies(json(buildDrill()), repository);
    expect(result.ok).toBe(false);
    expect(repository.drills.size).toBe(0);
  });
});

describe('copy mode (the default)', () => {
  it('gives an ID-less drill a fresh ID and lists it', async () => {
    const source = { name: 'No ID', players: [], skatePaths: [], events: [] };
    const result = await importAsCopies(json(source), repository, { now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.importedIds).toHaveLength(1);

    const id = result.value.importedIds[0];
    expect(id).toBeTruthy();
    expect(id).not.toBe('undefined');
    expect(repository.drills.has(id)).toBe(true);

    const list = await repository.list();
    expect(list.ok && list.value.map(meta => meta.id)).toEqual([id]);
  });

  it('never stores anything under the literal key "undefined"', async () => {
    await importAsCopies(json({ name: 'No ID' }), repository, { now: FIXED_NOW });
    expect(repository.drills.has('undefined' as string)).toBe(false);
  });

  it('leaves a colliding local drill untouched and imports a copy', async () => {
    const local = buildDrill({ id: 'shared', name: 'My local work' });
    repository.drills.set('shared', local);

    const incoming = buildDrill({ id: 'shared', name: 'Someone else' });
    const result = await importAsCopies(json([incoming]), repository, { now: FIXED_NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replacedIds).toEqual([]);
    expect(repository.drills.get('shared')!.name).toBe('My local work');

    const importedId = result.value.importedIds[0];
    expect(importedId).not.toBe('shared');
    expect(repository.drills.get(importedId)!.name).toBe('Someone else');
  });

  it('remaps every child ID and internal reference', async () => {
    const incoming = buildDrill({
      id: 'incoming',
      players: [buildPlayer({ id: 'p1', hasPuck: true }), buildPlayer({ id: 'p2', number: '13' })],
      skatePaths: [buildDistinctiveRoute('p1')],
      events: [buildPass({ id: 'e1', fromPlayerId: 'p1', toPlayerId: 'p2' })],
      coaches: [{ id: 'c1', x: 5, y: 5, name: 'Coach' }],
    });

    const result = await importAsCopies(json(incoming), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = repository.drills.get(result.value.importedIds[0])!;
    expect(stored.players.map(player => player.id)).not.toContain('p1');
    expect(stored.coaches?.[0].id).not.toBe('c1');
    expect(stored.skatePaths[0].id).not.toBe('route-distinct');
    expect(stored.skatePaths[0].ownerId).toBe(stored.players[0].id);

    const pass = stored.events[0];
    expect(pass.fromPlayerId).toBe(stored.players[0].id);
    expect(pass.type === 'pass' && pass.toPlayerId).toBe(stored.players[1].id);
  });

  it('preserves route mode, finish, team and points through the import', async () => {
    const incoming = buildDrill({ skatePaths: [buildDistinctiveRoute('p1')] });
    const result = await importAsCopies(json(incoming), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const route = repository.drills.get(result.value.importedIds[0])!.skatePaths[0];
    expect(route.mode).toBe('backward');
    expect(route.finish).toBe('coast');
    expect(route.team).toBe('away');
    expect(route.points).toEqual(buildDistinctiveRoute('p1').points);
  });

  it('gives two copies of the same drill distinct IDs', async () => {
    const drill = buildDrill({ id: 'twin' });
    const first = await importAsCopies(json(drill), repository, { now: FIXED_NOW });
    const second = await importAsCopies(json(drill), repository, { now: FIXED_NOW });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.importedIds[0]).not.toBe(second.value.importedIds[0]);
    expect(repository.drills.size).toBe(2);
  });

  it('imports the valid drills from a mixed array and reports the rest', async () => {
    const payload = [
      buildDrill({ id: 'valid-1', name: 'One' }),
      { name: 'no players but repairable' },
      'garbage',
      buildDrill({ id: 'valid-2', name: 'Two' }),
    ];

    const result = await importAsCopies(json(payload), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.importedIds).toHaveLength(3);
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0].sourceIndex).toBe(2);
  });

  it('drops a pass to a missing player during repair rather than failing the whole drill', async () => {
    const incoming = buildDrill({
      players: [buildPlayer({ id: 'p1', hasPuck: true })],
      events: [buildPass({ id: 'e1', fromPlayerId: 'p1', toPlayerId: 'ghost' })],
    });

    const result = await importAsCopies(json(incoming), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repository.drills.get(result.value.importedIds[0])!.events).toEqual([]);
  });

  it('reissues duplicate child IDs found in one drill', async () => {
    const incoming = buildDrill({
      players: [buildPlayer({ id: 'dup', hasPuck: true }), buildPlayer({ id: 'dup', number: '13' })],
    });
    const result = await importAsCopies(json(incoming), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repository.drills.get(result.value.importedIds[0])!.players).toHaveLength(1);
  });

  it('drops route points with non-finite coordinates', async () => {
    const incoming = {
      id: 'nf',
      name: 'Non finite',
      players: [{ id: 'p1', x: 0, y: 0, team: 'home', number: '11', role: 'C', hasPuck: true }],
      skatePaths: [
        { id: 'r1', ownerId: 'p1', team: 'home', points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 5 }] },
      ],
      events: [],
    };

    const result = await importAsCopies(json(incoming), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repository.drills.get(result.value.importedIds[0])!.skatePaths[0].points).toHaveLength(1);
  });

  it('rejects an event with an unsupported type', async () => {
    const incoming = {
      id: 'bad-event',
      name: 'Bad event',
      players: [{ id: 'p1', x: 0, y: 0, team: 'home', number: '11', role: 'C', hasPuck: true }],
      skatePaths: [],
      events: [{ id: 'e', type: 'faceoff', fromPlayerId: 'p1', fromPoint: { x: 0, y: 0 }, toPoint: { x: 1, y: 1 } }],
    };

    const result = await importAsCopies(json(incoming), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repository.drills.get(result.value.importedIds[0])!.events).toEqual([]);
  });

  it('reports a storage failure instead of claiming the import worked', async () => {
    repository.failOperation('import', { code: 'quota-exceeded', message: 'full' });
    const result = await importAsCopies(json(buildDrill()), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(false);
    expect(repository.drills.size).toBe(0);
  });
});

describe('replace mode', () => {
  it('replaces only when explicitly confirmed for that drill', async () => {
    repository.drills.set('shared', buildDrill({ id: 'shared', name: 'Local' }));

    const preview = await prepareImport(json(buildDrill({ id: 'shared', name: 'Incoming' })), repository, {
      now: FIXED_NOW,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    expect(preview.value.candidates[0].collidesWith).toMatchObject({ id: 'shared', name: 'Local' });

    const result = await commitImport(
      preview.value,
      [{ sourceIndex: 0, mode: 'replace' }],
      repository,
      { now: FIXED_NOW }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replacedIds).toEqual(['shared']);
    expect(result.value.importedIds).toEqual([]);
    expect(repository.drills.get('shared')!.name).toBe('Incoming');
  });

  it('keeps a recovery copy of the drill it replaced', async () => {
    repository.drills.set('shared', buildDrill({ id: 'shared', name: 'Local' }));
    const preview = await prepareImport(json(buildDrill({ id: 'shared', name: 'Incoming' })), repository);
    if (!preview.ok) throw new Error('preview failed');

    await commitImport(preview.value, [{ sourceIndex: 0, mode: 'replace' }], repository);
    const recovery = await repository.listRecovery();
    expect(recovery.ok && recovery.value[0].source).toBe('replaced-drill');
  });

  it('falls back to a copy, with a warning, when there is nothing to replace', async () => {
    const preview = await prepareImport(json(buildDrill({ id: 'never-seen' })), repository);
    if (!preview.ok) throw new Error('preview failed');

    const result = await commitImport(preview.value, [{ sourceIndex: 0, mode: 'replace' }], repository);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replacedIds).toEqual([]);
    expect(result.value.importedIds).toHaveLength(1);
    expect(result.value.warnings.some(w => w.includes('imported as a copy'))).toBe(true);
  });
});

describe('the exact imported ID', () => {
  it('returns the ID that was actually stored, not the newest list entry', async () => {
    // Seed a drill that is newer than the import, so "list()[0]" would be wrong.
    repository.drills.set(
      'newer',
      buildDrill({ id: 'newer', name: 'Newer local', updatedAt: FIXED_NOW + 10_000 })
    );

    const result = await importAsCopies(json(buildDrill({ name: 'Imported' })), repository, {
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const list = await repository.list();
    expect(list.ok && list.value[0].id).toBe('newer');
    expect(result.value.importedIds[0]).not.toBe('newer');
    expect(repository.drills.get(result.value.importedIds[0])!.name).toBe('Imported');
  });

  it('reports no imported IDs when nothing could be imported', async () => {
    const result = await importAsCopies(json(['garbage', 7]), repository);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.importedIds).toEqual([]);
    expect(result.value.failures).toHaveLength(2);
  });
});

describe('v3-aware import shapes', () => {
  it('imports a version-1 export payload (v2 drills) unchanged in meaning', async () => {
    const legacy = {
      format: 'phicecraft-drills',
      version: 1,
      exportedAt: 5,
      containsUnsavedRevision: false,
      drills: [structuredClone(giveAndGoRegressionDrill)],
    };

    const result = await importAsCopies(json(legacy), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.importedIds).toHaveLength(1);

    const stored = repository.drills.get(result.value.importedIds[0])!;
    expect(stored.players).toHaveLength(giveAndGoRegressionDrill.players.length);
  });

  it('imports a version-2 export payload (v3 documents)', async () => {
    const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
    const payload = {
      format: 'phicecraft-drills',
      version: 2,
      exportedAt: 5,
      containsUnsavedRevision: false,
      documents: [doc],
    };

    const result = await importAsCopies(json(payload), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.importedIds).toHaveLength(1);

    const stored = repository.drills.get(result.value.importedIds[0])!;
    expect(stored.players).toHaveLength(giveAndGoRegressionDrill.players.length);
    expect(stored.players.map(player => player.number).sort()).toEqual(
      giveAndGoRegressionDrill.players.map(player => player.number).sort()
    );
  });

  it('keeps a v3 import at its file-authored internal actor ids, not the v2 remap, across two copies', async () => {
    // The v3 enrichment pass in `commitImport` writes `saveDocumentV3` *after*
    // `replaceAndSave` has already stored the remapped v2 projection, and
    // `saveDocumentV3` overwrites that record wholesale with the original
    // document (top-level id/timestamps restamped, everything else
    // untouched) - so a v3-origin import's internal actor/route/event ids end
    // up exactly as the source file had them, NOT the fresh ids
    // `remapImportedDrill` computed. This is accepted, not a bug: those ids
    // are document-scoped (only ever read alongside the document's own top
    // level id), and a fresh top-level id per import - proven distinct below
    // - is what actually prevents one imported copy from clobbering another
    // or the original. The v2-only remap test at importService.test.ts:127
    // does not exercise this path, so this locks it down explicitly.
    const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
    const payload = json({
      format: 'phicecraft-drills',
      version: 2,
      exportedAt: 5,
      containsUnsavedRevision: false,
      documents: [doc],
    });

    const first = await importAsCopies(payload, repository, { now: FIXED_NOW });
    const second = await importAsCopies(payload, repository, { now: FIXED_NOW + 1 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const firstId = first.value.importedIds[0];
    const secondId = second.value.importedIds[0];
    expect(firstId).not.toBe(secondId);

    const firstStored = repository.drills.get(firstId)!;
    const secondStored = repository.drills.get(secondId)!;
    const sourcePlayerIds = giveAndGoRegressionDrill.players.map(player => player.id).sort();

    expect(firstStored.players.map(player => player.id).sort()).toEqual(sourcePlayerIds);
    expect(secondStored.players.map(player => player.id).sort()).toEqual(sourcePlayerIds);
    expect(firstStored.players.map(player => player.id).sort()).toEqual(
      secondStored.players.map(player => player.id).sort()
    );
  });

  it('imports a bare v3 document object', async () => {
    const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
    const result = await prepareImport(json(doc), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toHaveLength(1);
    expect(result.value.candidates[0].drill.players).toHaveLength(giveAndGoRegressionDrill.players.length);
  });

  it('falls back to no declared name when a v2 candidate never had one', async () => {
    const source = { players: [], skatePaths: [], events: [] };
    const result = await prepareImport(json(source), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No `name` field at all: `migrateDrillCandidate` still falls back to
    // "Imported Drill" for the stored drill, but the *declared* name used in
    // failure messages has nothing to report.
    expect(result.value.candidates).toHaveLength(1);
    expect(result.value.candidates[0].drill.name).toBe('Imported Drill');
  });

  it('falls back to no declared name in the failure report when a v3 document has an empty title', async () => {
    const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
    doc.metadata.title = '';
    const result = await prepareImport(json(doc), repository, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // An empty title projects to an empty v2 `name`, which the storage schema
    // requires to be non-empty - so this is a legitimate schema failure, and
    // it is reported with no declared name rather than an empty string.
    expect(result.value.candidates).toHaveLength(0);
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0].name).toBeNull();
  });

  it('reports a schema failure for a v3-tagged document that does not actually match the v3 shape', async () => {
    const broken = { schemaVersion: 3, id: 'x' };
    const result = await prepareImport(json(broken), repository);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toHaveLength(0);
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0].code).toBe('schema-failed');
  });

  it('keeps the v2-shaped import when preserving v3 extras fails, and warns instead of failing', async () => {
    class BlockedV3Repository extends FakeRepository {
      async saveDocumentV3(_document: DrillDocumentV3): PersistenceResult<void> {
        return err(persistenceError('unknown', 'save', 'v3 write blocked for test'));
      }
    }
    const blocked = new BlockedV3Repository();
    const doc = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));

    const result = await importAsCopies(json(doc), blocked, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.importedIds).toHaveLength(1);
    expect(blocked.drills.has(result.value.importedIds[0])).toBe(true);
    expect(result.value.warnings.some(warning => warning.includes('could not be preserved'))).toBe(true);
  });
});
