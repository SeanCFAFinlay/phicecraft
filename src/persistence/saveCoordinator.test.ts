// ============================================================================
// SAVE COORDINATOR
//
// The defect these lock down: the old code called `persistDrill()` and showed
// "Play saved" unconditionally, and two auto-saves could complete out of order.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SaveCoordinator } from './saveCoordinator';
import { FakeRepository } from '@/test/fakeRepository';
import { buildDrill } from '@/test/builders';

let repository: FakeRepository;
let coordinator: SaveCoordinator;

beforeEach(() => {
  repository = new FakeRepository();
  coordinator = new SaveCoordinator(repository);
});

describe('status lifecycle', () => {
  it('starts clean', () => {
    expect(coordinator.getSnapshot().state).toBe('clean');
    expect(coordinator.hasUnsavedChanges).toBe(false);
  });

  it('goes dirty on an edit and saved after a successful write', async () => {
    const drill = buildDrill();
    coordinator.markDirty(drill);
    expect(coordinator.getSnapshot().state).toBe('dirty');
    expect(coordinator.hasUnsavedChanges).toBe(true);

    const result = await coordinator.save(drill);
    expect(result.ok).toBe(true);
    expect(coordinator.getSnapshot().state).toBe('saved');
    expect(coordinator.hasUnsavedChanges).toBe(false);
  });

  it('notifies subscribers on every status change', async () => {
    let notifications = 0;
    const unsubscribe = coordinator.subscribe(() => {
      notifications += 1;
    });

    await coordinator.save(buildDrill());
    unsubscribe();
    const afterUnsubscribe = notifications;
    await coordinator.save(buildDrill());

    expect(afterUnsubscribe).toBeGreaterThan(0);
    expect(notifications).toBe(afterUnsubscribe);
  });

  it('adopts a loaded drill as already durable', () => {
    coordinator.adoptSaved(buildDrill(), 123);
    expect(coordinator.getSnapshot().state).toBe('clean');
    expect(coordinator.getSnapshot().lastSavedAt).toBe(123);
    expect(coordinator.hasUnsavedChanges).toBe(false);
  });

  it('resets to the initial status', async () => {
    await coordinator.save(buildDrill());
    coordinator.reset();
    expect(coordinator.getSnapshot()).toMatchObject({ state: 'clean', savedRevision: 0, dirtyRevision: 0 });
  });
});

describe('failures', () => {
  it('reports the error and never reaches the saved state', async () => {
    repository.failOperation('save', { code: 'quota-exceeded', message: 'disk full' });
    const result = await coordinator.save(buildDrill());

    expect(result.ok).toBe(false);
    const status = coordinator.getSnapshot();
    expect(status.state).toBe('error');
    expect(status.error?.code).toBe('quota-exceeded');
    expect(status.savedRevision).toBe(0);
    expect(coordinator.hasUnsavedChanges).toBe(true);
  });

  it('keeps the error status across a later edit until it is resolved', async () => {
    repository.failOperation('save');
    await coordinator.save(buildDrill());

    coordinator.markDirty(buildDrill({ name: 'Edited' }));
    expect(coordinator.getSnapshot().state).toBe('error');
  });

  it('clears the error on a successful retry', async () => {
    repository.failOperation('save');
    await coordinator.save(buildDrill());
    repository.clearFailures();

    const retry = await coordinator.retry();
    expect(retry.ok).toBe(true);
    expect(coordinator.getSnapshot()).toMatchObject({ state: 'saved', error: null });
  });

  it('lets the user dismiss a failure without pretending it saved', async () => {
    repository.failOperation('save');
    await coordinator.save(buildDrill());

    coordinator.dismissError();
    const status = coordinator.getSnapshot();
    expect(status.state).toBe('dirty');
    expect(status.error).toBe(null);
    expect(coordinator.hasUnsavedChanges).toBe(true);
  });

  it('keeps the in-memory document available for emergency export', async () => {
    repository.failOperation('save');
    const drill = buildDrill({ name: 'Only copy' });
    await coordinator.save(drill);

    expect(coordinator.pendingDocument?.name).toBe('Only copy');
  });
});

describe('ordering', () => {
  it('serializes concurrent saves so they complete in request order', async () => {
    repository.blockSaves();

    const first = coordinator.save(buildDrill({ id: 'a', name: 'First' }));
    const second = coordinator.save(buildDrill({ id: 'b', name: 'Second' }));
    const third = coordinator.save(buildDrill({ id: 'c', name: 'Third' }));

    repository.releaseSaves();
    await Promise.all([first, second, third]);

    expect(repository.completedSaves).toEqual(['a', 'b', 'c']);
  });

  it('does not mark a stale revision saved when a newer edit landed first', async () => {
    const drill = buildDrill({ name: 'v1' });
    repository.blockSaves();

    // Revision 1 is queued, then the user edits again before it completes.
    const inFlight = coordinator.save(drill);
    coordinator.markDirty(buildDrill({ name: 'v2' }));

    repository.releaseSaves();
    const result = await inFlight;

    expect(result.ok).toBe(true);
    // The write succeeded, but it wrote v1 while v2 is on screen.
    expect(coordinator.getSnapshot().state).toBe('dirty');
    expect(coordinator.hasUnsavedChanges).toBe(true);
  });

  it('a failed save does not stall the queue for later saves', async () => {
    repository.failOperation('save');
    const failed = await coordinator.save(buildDrill({ id: 'a' }));
    expect(failed.ok).toBe(false);

    repository.clearFailures();
    const recovered = await coordinator.save(buildDrill({ id: 'b' }));
    expect(recovered.ok).toBe(true);
    expect(coordinator.getSnapshot().state).toBe('saved');
  });
});

describe('flush', () => {
  it('writes the outstanding revision', async () => {
    coordinator.markDirty(buildDrill({ id: 'flushed', name: 'Pending' }));
    const result = await coordinator.flush();

    expect(result.ok).toBe(true);
    expect(repository.drills.get('flushed')?.name).toBe('Pending');
  });

  it('is a no-op when nothing is outstanding', async () => {
    await coordinator.save(buildDrill({ id: 'x' }));
    const callsBefore = repository.saveCallLog.length;

    const result = await coordinator.flush();
    expect(result.ok).toBe(true);
    expect(repository.saveCallLog.length).toBe(callsBefore);
  });

  it('surfaces the failure rather than reporting a clean flush', async () => {
    repository.failOperation('save', { code: 'transaction-failed', message: 'aborted' });
    coordinator.markDirty(buildDrill());

    const result = await coordinator.flush();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('transaction-failed');
  });

  it('reports the standing error when a flush finds nothing new to write', async () => {
    repository.failOperation('save');
    await coordinator.save(buildDrill());
    // The failed save left the revision unsaved, so flush retries it.
    const result = await coordinator.flush();
    expect(result.ok).toBe(false);
  });
});
