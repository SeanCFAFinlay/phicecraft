// ============================================================================
// EXPORT SERVICE
//
// The defect these lock down: export flushed the drill, ignored whether the
// flush worked, and always announced "Drills exported".
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { exportDrills, buildExportPayload } from './exportService';
import { SaveCoordinator } from './saveCoordinator';
import { FakeRepository } from '@/test/fakeRepository';
import { buildDrill, FIXED_NOW } from '@/test/builders';
import { buildRecoveryBundle, captureRecovery, loadRecoveryRecords } from './recoveryService';

let repository: FakeRepository;
let coordinator: SaveCoordinator;

beforeEach(() => {
  repository = new FakeRepository();
  coordinator = new SaveCoordinator(repository);
});

const neverAsked = vi.fn(async () => {
  throw new Error('The unsaved-export choice must not be requested when the flush succeeded.');
});

describe('buildExportPayload', () => {
  it('labels a clean payload', () => {
    const payload = buildExportPayload([buildDrill()], false, FIXED_NOW);
    expect(payload).toMatchObject({
      format: 'phicecraft-drills',
      version: 1,
      exportedAt: FIXED_NOW,
      containsUnsavedRevision: false,
    });
  });
});

describe('exportDrills', () => {
  it('flushes, then exports every durable drill', async () => {
    repository.drills.set('a', buildDrill({ id: 'a', name: 'A' }));
    coordinator.markDirty(buildDrill({ id: 'b', name: 'B' }));

    const result = await exportDrills({
      repository,
      coordinator,
      confirmUnsavedExport: neverAsked,
      now: FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== 'exported') throw new Error('expected an export');
    expect(result.value.payload.containsUnsavedRevision).toBe(false);
    expect(result.value.payload.drills.map(drill => drill.id).sort()).toEqual(['a', 'b']);
    expect(result.value.filename).toBe('phicecraft-drills-2023-11-14.json');
    expect(neverAsked).not.toHaveBeenCalled();
  });

  it('asks for an explicit decision when the flush fails, and honours cancel', async () => {
    repository.failOperation('save', { code: 'quota-exceeded', message: 'full' });
    coordinator.markDirty(buildDrill({ id: 'pending' }));

    const confirm = vi.fn(async () => 'cancel' as const);
    const result = await exportDrills({
      repository,
      coordinator,
      confirmUnsavedExport: confirm,
      now: FIXED_NOW,
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('cancelled');
  });

  it('merges the unsaved revision in and labels the payload when the user continues', async () => {
    repository.drills.set('doc', buildDrill({ id: 'doc', name: 'Durable version' }));
    repository.failOperation('save', { code: 'quota-exceeded', message: 'full' });
    coordinator.markDirty(buildDrill({ id: 'doc', name: 'Unsaved version' }));

    const result = await exportDrills({
      repository,
      coordinator,
      confirmUnsavedExport: async () => 'export-anyway',
      now: FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== 'exported') throw new Error('expected an export');
    expect(result.value.payload.containsUnsavedRevision).toBe(true);
    expect(result.value.payload.drills).toHaveLength(1);
    expect(result.value.payload.drills[0].name).toBe('Unsaved version');
    expect(result.value.filename).toContain('-unsaved');
  });

  it('adds an unsaved drill that has no durable copy at all', async () => {
    repository.failOperation('save');
    coordinator.markDirty(buildDrill({ id: 'brand-new', name: 'Never saved' }));

    const result = await exportDrills({
      repository,
      coordinator,
      confirmUnsavedExport: async () => 'export-anyway',
      now: FIXED_NOW,
    });

    if (!result.ok || result.value.kind !== 'exported') throw new Error('expected an export');
    expect(result.value.payload.drills.map(drill => drill.id)).toEqual(['brand-new']);
  });

  it('still rescues the in-memory drill when the durable read also fails', async () => {
    repository.failOperation('save');
    repository.failOperation('read', { code: 'unavailable', message: 'no db' });
    coordinator.markDirty(buildDrill({ id: 'rescued', name: 'Rescued' }));

    const result = await exportDrills({
      repository,
      coordinator,
      confirmUnsavedExport: async () => 'export-anyway',
      now: FIXED_NOW,
    });

    if (!result.ok || result.value.kind !== 'exported') throw new Error('expected an export');
    expect(result.value.payload.containsUnsavedRevision).toBe(true);
    expect(result.value.payload.drills[0].name).toBe('Rescued');
  });

  it('fails outright when there is nothing readable and nothing in memory', async () => {
    repository.failOperation('read', { code: 'unavailable', message: 'no db' });
    const result = await exportDrills({
      repository,
      coordinator,
      confirmUnsavedExport: neverAsked,
      now: FIXED_NOW,
    });

    expect(result.ok).toBe(false);
  });

  it('produces JSON that round-trips', async () => {
    repository.drills.set('a', buildDrill({ id: 'a' }));
    const result = await exportDrills({
      repository,
      coordinator,
      confirmUnsavedExport: neverAsked,
      now: FIXED_NOW,
    });

    if (!result.ok || result.value.kind !== 'exported') throw new Error('expected an export');
    expect(JSON.parse(result.value.json).drills).toHaveLength(1);
  });
});

describe('recovery service', () => {
  it('captures a raw value and lists it back', async () => {
    await captureRecovery(repository, {
      id: 'r1',
      source: 'import',
      reference: 'broken.json',
      raw: '{ half a file',
      reason: 'invalid JSON',
    });

    const records = await loadRecoveryRecords(repository);
    expect(records.ok && records.value).toHaveLength(1);
    expect(records.ok && records.value[0].raw).toBe('{ half a file');
  });

  it('bundles every recovery record into a downloadable payload', async () => {
    await captureRecovery(repository, {
      id: 'r1',
      source: 'legacy-localstorage',
      reference: 'phicecraft_drills_x',
      raw: { partial: true },
      reason: 'failed validation',
    });

    const bundle = await buildRecoveryBundle(repository, FIXED_NOW);
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(bundle.value.bundle.recordCount).toBe(1);
    expect(bundle.value.filename).toBe('phicecraft-recovery-2023-11-14.json');
    expect(JSON.parse(bundle.value.json).records).toHaveLength(1);
  });
});
