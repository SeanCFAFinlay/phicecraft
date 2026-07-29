// ============================================================================
// DOCUMENT AND PLAYBACK COMMANDS
//
// The data-safety rules, at the layer every view goes through:
//   - nothing reports success before the repository has said so
//   - no visible document changes until its replacement is durable
//   - export never claims a file that was not produced
//   - playback starts from exactly one place
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestHarness, toasted, type TestHarness } from '@/test/commandHost';
import { buildDrill, buildDistinctiveRoute, buildPlayer, FIXED_NOW } from '@/test/builders';
import { RINK } from '@/core/constants';
import { isReviewComplete } from './playbackCommands';

let harness: TestHarness;

beforeEach(() => {
  harness = createTestHarness();
});

// ----------------------------------------------------------------------------
// Save
// ----------------------------------------------------------------------------

describe('saveDrill', () => {
  it('says "Play saved" only after the repository succeeded', async () => {
    const result = await harness.commands.saveDrill();

    expect(result.status).toBe('done');
    expect(toasted(harness, 'Play saved')).toBe(true);
    expect(harness.repository.drills.size).toBe(1);
  });

  it('never says "Play saved" when the write failed', async () => {
    harness.repository.failOperation('save', { code: 'quota-exceeded', message: 'full' });
    const result = await harness.commands.saveDrill();

    expect(result.status).toBe('failed');
    expect(toasted(harness, 'Play saved')).toBe(false);
    expect(toasted(harness, /Save failed/)).toBe(true);
    expect(harness.repository.drills.size).toBe(0);
  });

  it('reports a failure as a persistent alert, not a passing toast', async () => {
    harness.repository.failOperation('save');
    await harness.commands.saveDrill();

    const failure = harness.toasts.find(toast => toast.message.startsWith('Save failed'));
    expect(failure?.duration).toBe(0);
    expect(failure?.role).toBe('alert');
  });
});

// ----------------------------------------------------------------------------
// Save As New
// ----------------------------------------------------------------------------

describe('saveAsNewPlay', () => {
  it('switches to the copy once it is durable', async () => {
    const original = harness.getState().drill.id;
    const result = await harness.commands.saveAsNewPlay('My Copy');

    expect(result.status).toBe('done');
    const copyId = result.status === 'done' ? result.value : '';
    expect(copyId).not.toBe(original);
    expect(harness.repository.drills.get(copyId)?.name).toBe('My Copy');
    expect(harness.getState().drill.id).toBe(copyId);
  });

  it('does NOT switch when the copy could not be stored', async () => {
    const original = harness.getState().drill.id;
    harness.repository.failOperation('save', { code: 'quota-exceeded', message: 'full' });

    const result = await harness.commands.saveAsNewPlay('Doomed Copy');

    expect(result.status).toBe('failed');
    // Still editing the original, which is the whole point.
    expect(harness.getState().drill.id).toBe(original);
    expect(toasted(harness, /still editing the original/)).toBe(true);
  });

  it('preserves every semantic route field in the copy', async () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'p1', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('p1')],
      })
    );

    const result = await harness.commands.saveAsNewPlay('Route Copy');
    const copyId = result.status === 'done' ? result.value : '';
    const route = harness.repository.drills.get(copyId)!.skatePaths[0];

    expect(route.mode).toBe('backward');
    expect(route.finish).toBe('coast');
    expect(route.team).toBe('away');
    expect(route.points).toEqual(buildDistinctiveRoute('p1').points);
  });

  it('asks for a name when none is given, and cancels cleanly', async () => {
    harness.answerPrompt(null);
    expect((await harness.commands.saveAsNewPlay()).status).toBe('cancelled');
  });

  it('rejects an empty name', async () => {
    harness.answerPrompt('   ');
    expect((await harness.commands.saveAsNewPlay()).status).toBe('rejected');
  });
});

// ----------------------------------------------------------------------------
// Delete
// ----------------------------------------------------------------------------

describe('deleteDrill', () => {
  beforeEach(async () => {
    await harness.commands.saveDrill();
  });

  it('asks first, naming the play', async () => {
    harness.answerConfirm(false);
    const id = harness.getState().drill.id;

    const result = await harness.commands.deleteDrill(id);
    expect(result.status).toBe('cancelled');
    expect(harness.confirmations.at(-1)?.id).toBe('delete-drill');
    expect(harness.repository.drills.has(id)).toBe(true);
  });

  it('does not remove the visible drill when the delete fails', async () => {
    const id = harness.getState().drill.id;
    harness.answerConfirm(true);
    harness.repository.failOperation('delete', { code: 'transaction-failed', message: 'aborted' });

    const result = await harness.commands.deleteDrill(id);

    expect(result.status).toBe('failed');
    // Still there, still on screen, still in the list.
    expect(harness.repository.drills.has(id)).toBe(true);
    expect(harness.getState().drill.id).toBe(id);
    expect(toasted(harness, /was not deleted/)).toBe(true);
  });

  it('falls back to another play when the current one is deleted', async () => {
    const first = harness.getState().drill.id;
    await harness.commands.saveAsNewPlay('Second');
    const second = harness.getState().drill.id;

    harness.answerConfirm(true);
    await harness.commands.deleteDrill(second);

    expect(harness.repository.drills.has(second)).toBe(false);
    expect(harness.getState().drill.id).toBe(first);
  });

  it('starts a fresh drill when the last one is deleted', async () => {
    const id = harness.getState().drill.id;
    harness.answerConfirm(true);
    await harness.commands.deleteDrill(id);

    expect(harness.getState().drill.id).not.toBe(id);
    expect(harness.getState().drill.players.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------------------
// Load and switch
// ----------------------------------------------------------------------------

describe('loadDrill', () => {
  it('opens the requested play', async () => {
    await harness.commands.saveDrill();
    const first = harness.getState().drill.id;
    await harness.commands.saveAsNewPlay('Second');

    const result = await harness.commands.loadDrill(first);
    expect(result.status).toBe('done');
    expect(harness.getState().drill.id).toBe(first);
  });

  it('is a no-op for the play already open', async () => {
    const id = harness.getState().drill.id;
    expect((await harness.commands.loadDrill(id)).status).toBe('done');
  });

  it('refuses to switch away when the outgoing play cannot be saved', async () => {
    await harness.commands.saveDrill();
    const first = harness.getState().drill.id;
    await harness.commands.saveAsNewPlay('Second');
    const second = harness.getState().drill.id;

    // An unsaved edit that then fails to flush.
    harness.dispatch({ type: 'RENAME_DRILL', name: 'Edited' });
    harness.coordinator.markDirty(harness.getState().drill);
    harness.repository.failOperation('save', { code: 'quota-exceeded', message: 'full' });

    const result = await harness.commands.loadDrill(first);

    expect(result.status).toBe('failed');
    expect(harness.getState().drill.id).toBe(second);
    expect(toasted(harness, /was not switched away from/)).toBe(true);
  });

  it('reports a read failure rather than opening nothing', async () => {
    await harness.commands.saveDrill();
    await harness.commands.saveAsNewPlay('Second');
    harness.repository.failOperation('read', { code: 'corrupt-data', message: 'bad' });

    const result = await harness.commands.loadDrill('anything-else');
    expect(result.status).toBe('failed');
  });
});

describe('newDrill', () => {
  it('asks first', async () => {
    harness.answerConfirm(false);
    expect((await harness.commands.newDrill()).status).toBe('cancelled');
  });

  it('creates and saves a fresh drill', async () => {
    const before = harness.getState().drill.id;
    harness.answerConfirm(true);

    const result = await harness.commands.newDrill();
    expect(result.status).toBe('done');
    expect(harness.getState().drill.id).not.toBe(before);
    expect(harness.repository.drills.size).toBe(1);
  });

  it('reports a failure to save the new drill', async () => {
    harness.answerConfirm(true);
    harness.repository.failOperation('save');
    expect((await harness.commands.newDrill()).status).toBe('failed');
  });
});

describe('useTemplate', () => {
  it('stores the full v3 document, not the projection, while the editor gets the projected v2 copy under the same fresh id', async () => {
    const { DRILL_TEMPLATES } = await import('@/data/templates/registry');
    const withGear = DRILL_TEMPLATES.find(template => template.document.equipment.length > 0);
    if (!withGear) throw new Error('expected a template with equipment for this test to mean anything');

    const saveDocumentV3 = vi.spyOn(harness.repository, 'saveDocumentV3');

    const result = await harness.commands.useTemplate(withGear.id);
    expect(result.status).toBe('done');

    expect(saveDocumentV3).toHaveBeenCalledTimes(1);
    const storedDocument = saveDocumentV3.mock.calls[0][0];

    // The stored document is the real thing, not the v2 projection: equipment
    // and template provenance survive, and it carries a fresh id rather than
    // the template's own.
    expect(storedDocument.equipment).toEqual(withGear.document.equipment);
    expect(storedDocument.templateId).toBe(withGear.id);
    expect(storedDocument.id).not.toBe(withGear.document.id);

    // The editor's projected copy shares that same fresh id, so a later
    // edit-save merges onto the record that was actually stored.
    expect(harness.getState().drill.id).toBe(storedDocument.id);
  });

  it('reports a failure to store the template copy', async () => {
    harness.repository.failOperation('save');
    const { DRILL_TEMPLATES } = await import('@/data/templates/registry');

    const result = await harness.commands.useTemplate(DRILL_TEMPLATES[0].id);
    expect(result.status).toBe('failed');
  });

  it('rejects a template id that is no longer in the catalogue', async () => {
    const result = await harness.commands.useTemplate('not-a-real-template');
    expect(result.status).toBe('rejected');
  });
});

describe('loadFixture', () => {
  it('opens an example with a fresh identity', async () => {
    const result = await harness.commands.loadFixture('give-and-go');

    expect(result.status).toBe('done');
    expect(harness.getState().drill.createdAt).toBe(FIXED_NOW);
    expect(harness.repository.drills.size).toBe(1);
    expect(toasted(harness, /Loaded/)).toBe(true);
  });

  it('reports a failure to store the example', async () => {
    harness.repository.failOperation('save');
    expect((await harness.commands.loadFixture('corner-retrieval')).status).toBe('failed');
  });
});

// ----------------------------------------------------------------------------
// Rename
// ----------------------------------------------------------------------------

describe('rename', () => {
  it('renames and saves', async () => {
    harness.answerPrompt('Breakout Left');
    const result = await harness.commands.requestRename();

    expect(result.status).toBe('done');
    expect(harness.getState().drill.name).toBe('Breakout Left');
    expect(toasted(harness, 'Renamed to “Breakout Left”')).toBe(true);
  });

  it('cancels cleanly', async () => {
    harness.answerPrompt(null);
    expect((await harness.commands.requestRename()).status).toBe('cancelled');
  });

  it('rejects a blank name', async () => {
    harness.answerPrompt('   ');
    expect((await harness.commands.requestRename()).status).toBe('rejected');
  });

  it('reports a failure to save the new name', async () => {
    harness.answerPrompt('New Name');
    harness.repository.failOperation('save');
    expect((await harness.commands.requestRename()).status).toBe('failed');
  });

  it('renameDrill trims and ignores an empty value', () => {
    harness.commands.renameDrill('  Trimmed  ');
    expect(harness.getState().drill.name).toBe('Trimmed');

    harness.commands.renameDrill('   ');
    expect(harness.getState().drill.name).toBe('Trimmed');
  });
});

// ----------------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------------

describe('exportDrills', () => {
  it('produces a file and reports how many plays it contains', async () => {
    await harness.commands.saveDrill();
    const result = await harness.commands.exportDrills();

    expect(result.status).toBe('done');
    expect(harness.downloads).toHaveLength(1);
    expect(JSON.parse(harness.downloads[0].contents).documents).toHaveLength(1);
    expect(toasted(harness, /Exported 1 play/)).toBe(true);
  });

  it('never claims an export when no file was produced', async () => {
    await harness.commands.saveDrill();
    harness.breakDownloads();

    const result = await harness.commands.exportDrills();
    expect(result.status).toBe('rejected');
    expect(toasted(harness, /Exported/)).toBe(false);
    expect(toasted(harness, /download did not start/)).toBe(true);
  });

  it('asks for an explicit decision when the pre-export flush fails, and honours cancel', async () => {
    harness.coordinator.markDirty(harness.getState().drill);
    harness.repository.failOperation('save', { code: 'quota-exceeded', message: 'full' });
    harness.answerUnsavedExport('cancel');

    const result = await harness.commands.exportDrills();
    expect(result.status).toBe('cancelled');
    expect(harness.downloads).toHaveLength(0);
  });

  it('labels an unsaved export as containing unsaved work', async () => {
    await harness.commands.saveDrill();
    harness.dispatch({ type: 'RENAME_DRILL', name: 'Unsaved Edit' });
    harness.coordinator.markDirty(harness.getState().drill);
    harness.repository.failOperation('save', { code: 'quota-exceeded', message: 'full' });
    harness.answerUnsavedExport('export-anyway');

    const result = await harness.commands.exportDrills();
    expect(result.status).toBe('done');

    const payload = JSON.parse(harness.downloads[0].contents);
    expect(payload.containsUnsavedRevision).toBe(true);
    expect(payload.documents[0].metadata.title).toBe('Unsaved Edit');
    expect(harness.downloads[0].filename).toContain('unsaved');
    expect(toasted(harness, /including your unsaved changes/)).toBe(true);
  });

  it('reports a total export failure', async () => {
    harness.repository.failOperation('read', { code: 'unavailable', message: 'no db' });
    harness.coordinator.reset();

    const result = await harness.commands.exportDrills();
    expect(result.status).toBe('failed');
  });
});

describe('exportUnsavedData', () => {
  it('writes the in-memory drill, labelled unsaved', async () => {
    harness.coordinator.markDirty(harness.getState().drill);
    const result = await harness.commands.exportUnsavedData();

    expect(result.status).toBe('done');
    expect(JSON.parse(harness.downloads[0].contents).containsUnsavedRevision).toBe(true);
  });

  it('reports a blocked download', async () => {
    harness.breakDownloads();
    expect((await harness.commands.exportUnsavedData()).status).toBe('rejected');
  });
});

// ----------------------------------------------------------------------------
// Import
// ----------------------------------------------------------------------------

describe('import', () => {
  const drillJson = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      name: 'Imported Play',
      players: [{ id: 'p1', x: 300, y: 200, team: 'home', number: '11', role: 'C', hasPuck: true }],
      skatePaths: [],
      events: [],
      ...overrides,
    });

  it('prepares a preview without writing anything', async () => {
    const result = await harness.commands.prepareImport(drillJson());

    expect(result.status).toBe('done');
    expect(harness.repository.drills.size).toBe(0);
    expect(harness.getState().ui.openSheet).toBe('import-preview');
  });

  it('reports a file that cannot be read at all', async () => {
    const result = await harness.commands.prepareImport('{ not json');
    expect(result.status).toBe('failed');
  });

  it('reports a file with nothing importable in it', async () => {
    const result = await harness.commands.prepareImport(JSON.stringify(['garbage', 7]));
    expect(result.status).toBe('rejected');
    expect(toasted(harness, /Nothing could be imported/)).toBe(true);
  });

  it('commits as copies and opens the exact imported drill', async () => {
    const prepared = await harness.commands.prepareImport(drillJson());
    if (prepared.status !== 'done') throw new Error('expected a preview');

    const result = await harness.commands.commitImport(prepared.value, []);
    expect(result.status).toBe('done');

    const ids = result.status === 'done' ? result.value : [];
    expect(ids).toHaveLength(1);
    expect(harness.getState().drill.id).toBe(ids[0]);
    expect(harness.getState().drill.name).toBe('Imported Play');
  });

  it('reports a failure to store the import', async () => {
    const prepared = await harness.commands.prepareImport(drillJson());
    if (prepared.status !== 'done') throw new Error('expected a preview');

    harness.repository.failOperation('import', { code: 'quota-exceeded', message: 'full' });
    expect((await harness.commands.commitImport(prepared.value, [])).status).toBe('failed');
  });

  it('surfaces per-entry warnings', async () => {
    const prepared = await harness.commands.prepareImport(
      JSON.stringify([{ name: 'Odd', players: 'nope', skatePaths: [], events: [] }])
    );
    if (prepared.status !== 'done') throw new Error('expected a preview');

    await harness.commands.commitImport(prepared.value, []);
    expect(harness.toasts.some(toast => toast.message.includes('players was not an array'))).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Recovery
// ----------------------------------------------------------------------------

describe('recovery', () => {
  it('says so when the recovery store is empty', async () => {
    const result = await harness.commands.downloadRecoveryBundle();
    expect(result.status).toBe('done');
    expect(harness.downloads).toHaveLength(0);
    expect(toasted(harness, /nothing in the recovery store/)).toBe(true);
  });

  it('downloads the preserved raw values', async () => {
    await harness.repository.putRecovery({
      id: 'r1',
      source: 'import',
      reference: 'broken.json',
      raw: '{ half a file',
      reason: 'invalid JSON',
      capturedAt: FIXED_NOW,
    });

    const result = await harness.commands.downloadRecoveryBundle();
    expect(result.status).toBe('done');
    expect(JSON.parse(harness.downloads[0].contents).records).toHaveLength(1);
  });

  it('retries a failed save', async () => {
    harness.repository.failOperation('save');
    await harness.commands.saveDrill();

    harness.repository.clearFailures();
    expect((await harness.commands.retrySave()).status).toBe('done');
    expect(harness.repository.drills.size).toBe(1);
  });

  it('reports a retry that failed again', async () => {
    harness.repository.failOperation('save');
    await harness.commands.saveDrill();
    expect((await harness.commands.retrySave()).status).toBe('failed');
  });

  it('dismisses a persistence error', async () => {
    harness.repository.failOperation('save');
    await harness.commands.saveDrill();
    expect(harness.coordinator.getSnapshot().state).toBe('error');

    harness.commands.dismissPersistenceError();
    expect(harness.coordinator.getSnapshot().state).not.toBe('error');
  });
});

// ----------------------------------------------------------------------------
// Initialize
// ----------------------------------------------------------------------------

describe('initialize', () => {
  it('reports storage that cannot be opened at all', async () => {
    harness.repository.failOperation('open', { code: 'unavailable', message: 'no idb' });
    await harness.commands.initialize();
    expect(toasted(harness, /Storage is unavailable/)).toBe(true);
  });

  it('saves the initial drill when there is nothing to reopen', async () => {
    vi.stubGlobal('localStorage', undefined);
    await harness.commands.initialize();
    expect(harness.repository.drills.size).toBe(1);
  });

  it('reopens the last drill', async () => {
    const stored = buildDrill({ id: 'previous', name: 'Previous Session' });
    harness.repository.drills.set(stored.id, stored);
    await harness.repository.setCurrentDrillId('previous');
    harness.repository.meta.set('legacyMigrationCompletedAt', FIXED_NOW);

    await harness.commands.initialize();
    expect(harness.getState().drill.name).toBe('Previous Session');
  });
});

// ----------------------------------------------------------------------------
// Playback
// ----------------------------------------------------------------------------

describe('requestPlaybackStart', () => {
  it('refuses an empty drill and says what is missing', () => {
    const result = harness.commands.requestPlaybackStart();

    expect(result.status).toBe('rejected');
    expect(harness.getState().playback.isPlaying).toBe(false);
    expect(toasted(harness, /Add a skating route or a puck action/)).toBe(true);
  });

  it('starts once there is something to play', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'p1', hasPuck: true, x: 300, y: 200 }),
          buildPlayer({ id: 'p2', number: '13', x: 500, y: 200 }),
        ],
        skatePaths: [buildDistinctiveRoute('p1')],
      })
    );

    const result = harness.commands.requestPlaybackStart();
    expect(result.status).toBe('done');
    expect(harness.getState().playback.isPlaying).toBe(true);
    expect(harness.announcements.some(message => message.startsWith('Playing'))).toBe(true);
  });

  it('closes covering surfaces before playing', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'p1', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('p1')],
      })
    );
    harness.dispatch({ type: 'TOGGLE_MENU' });
    harness.dispatch({ type: 'OPEN_SHEET', sheet: 'more' });

    harness.commands.requestPlaybackStart();
    expect(harness.getState().ui.showMenu).toBe(false);
    expect(harness.getState().ui.openSheet).toBe('none');
  });

  it('opens the review surface and focuses the problem when validation blocks it', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'p1', hasPuck: true, x: 300, y: 200 }),
          buildPlayer({ id: 'p2', number: '13', x: 500, y: 200 }),
        ],
        events: [
          {
            id: 'e1',
            type: 'pass',
            fromPlayerId: 'p1',
            toPlayerId: 'p2',
            fromPoint: { x: 300, y: 200 },
            toPoint: { x: 500, y: 200 },
            team: 'home',
            at: 0.6,
            arrivalAt: 0.9,
          },
          {
            id: 'e2',
            type: 'pass',
            fromPlayerId: 'p2',
            toPlayerId: 'p1',
            fromPoint: { x: 500, y: 200 },
            toPoint: { x: 300, y: 200 },
            team: 'home',
            at: 0.1,
            arrivalAt: 0.3,
          },
        ],
      })
    );

    const result = harness.commands.requestPlaybackStart();

    expect(result.status).toBe('rejected');
    expect(harness.getState().playback.isPlaying).toBe(false);
    expect(harness.getState().ui.editorStep).toBe('review');
    // The explanation stays on screen rather than flashing past.
    expect(harness.toasts.at(-1)?.duration).toBe(0);
  });

  it('is idempotent while already playing', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'p1', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('p1')],
      })
    );
    harness.commands.requestPlaybackStart();
    expect(harness.commands.requestPlaybackStart().status).toBe('done');
  });
});

describe('playback transport', () => {
  beforeEach(() => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'p1', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('p1')],
      })
    );
    harness.playback.setDrill(harness.getState().drill);
  });

  it('stops and clears the banner', () => {
    harness.commands.requestPlaybackStart();
    harness.commands.stopPlayback();
    expect(harness.getState().playback.isPlaying).toBe(false);
    expect(harness.getState().ui.playBanner).toBe(null);
  });

  it('scrubs through the frame store rather than the reducer', () => {
    harness.commands.setPlaybackProgress(0.5);
    expect(harness.playback.getFrame().progress).toBeCloseTo(0.5, 6);
    expect(harness.actions.some(action => action.type === 'SET_PLAYBACK_SPEED')).toBe(false);
  });

  it('changes speed and says so', () => {
    harness.commands.setPlaybackSpeed(2);
    expect(harness.getState().playback.speed).toBe(2);
    expect(toasted(harness, 'Speed 2×')).toBe(true);
  });

  it('resets the playhead and the frame store together', () => {
    harness.commands.setPlaybackProgress(0.8);
    harness.commands.resetPlayback();
    expect(harness.playback.getFrame().progress).toBe(0);
  });

  it('steps to the next checkpoint, and stops instead if playing', () => {
    harness.commands.stepPlayback();
    expect(harness.playback.getFrame().progress).toBeGreaterThan(0);

    harness.commands.requestPlaybackStart();
    harness.commands.stepPlayback();
    expect(harness.getState().playback.isPlaying).toBe(false);
  });
});

describe('setMode', () => {
  beforeEach(() => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'p1', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('p1')],
      })
    );
    harness.playback.setDrill(harness.getState().drill);
  });

  it('is a no-op when already in that mode', () => {
    expect(harness.getState().ui.mode).toBe('build');
    harness.commands.setMode('build');
    expect(harness.announcements).toHaveLength(0);
  });

  it('entering build while playing stops playback', () => {
    harness.commands.setMode('present');
    harness.commands.requestPlaybackStart();
    expect(harness.getState().playback.isPlaying).toBe(true);

    harness.commands.setMode('build');
    expect(harness.getState().ui.mode).toBe('build');
    expect(harness.getState().playback.isPlaying).toBe(false);
  });

  it('entering present resets playback progress', () => {
    harness.commands.setPlaybackProgress(0.6);

    harness.commands.setMode('present');
    expect(harness.getState().ui.mode).toBe('present');
    expect(harness.getState().playback.isPlaying).toBe(false);
    expect(harness.getState().playback.lifecycle).toBe('ready');
    expect(harness.playback.getFrame().progress).toBe(0);
  });

  it('announces the mode change', () => {
    harness.commands.setMode('preview');
    expect(harness.announcements.at(-1)).toMatch(/preview/i);

    harness.commands.setMode('present');
    expect(harness.announcements.at(-1)).toMatch(/present/i);

    harness.commands.setMode('build');
    expect(harness.announcements.at(-1)).toMatch(/build/i);
  });

  // Task 1's review flagged that document-mutating commands (NEW_DRILL,
  // RENAME_DRILL, DELETE_DRILL, SET_DRILL_LIST, MOVE_COACH, MOVE_PLAYER,
  // UPDATE_SKATE_POINTS, UPDATE_EVENT_GEOMETRY) are not reducer-gated by mode.
  // setMode is the first thing that lets mode leave 'build', so this
  // documents that leaving build does not yet block editing at the command
  // layer - the UI-layer gating for these surfaces is a later task.
  it('still permits document-mutating commands outside build mode (gating is a later UI task)', async () => {
    harness.commands.setMode('preview');
    const before = harness.getState().drill.id;
    harness.answerConfirm(true);

    const result = await harness.commands.newDrill();

    expect(result.status).toBe('done');
    expect(harness.getState().drill.id).not.toBe(before);
  });
});

describe('completeReview', () => {
  it('marks the current revision reviewed when nothing is blocking', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'p1', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('p1')],
      })
    );

    harness.commands.completeReview();
    expect(isReviewComplete(harness.getState())).toBe(true);
    expect(toasted(harness, 'Review complete')).toBe(true);
  });

  it('refuses while a blocking error stands', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'p1', hasPuck: true, x: 300, y: 200 }),
          buildPlayer({ id: 'p2', number: '13', x: 500, y: 200 }),
        ],
        events: [
          {
            id: 'e1',
            type: 'pass',
            fromPlayerId: 'p1',
            toPlayerId: 'p2',
            fromPoint: { x: 300, y: 200 },
            toPoint: { x: 500, y: 200 },
            team: 'home',
            at: 0.6,
            arrivalAt: 0.9,
          },
          {
            id: 'e2',
            type: 'pass',
            fromPlayerId: 'p2',
            toPlayerId: 'p1',
            fromPoint: { x: 500, y: 200 },
            toPoint: { x: 300, y: 200 },
            team: 'home',
            at: 0.1,
            arrivalAt: 0.3,
          },
        ],
      })
    );

    harness.commands.completeReview();
    expect(isReviewComplete(harness.getState())).toBe(false);
    expect(toasted(harness, /Review is not complete/)).toBe(true);
  });

  it('can complete silently, for the end of a playback run', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'p1', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('p1')],
      })
    );

    const before = harness.toasts.length;
    harness.commands.completeReview({ announce: false });
    expect(isReviewComplete(harness.getState())).toBe(true);
    expect(harness.toasts).toHaveLength(before);
  });

  it('is invalidated by a later edit', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'p1', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('p1')],
      })
    );
    harness.commands.completeReview();
    expect(isReviewComplete(harness.getState())).toBe(true);

    harness.commands.addPlayer({ x: RINK.centerX, y: RINK.centerY }, 'away');
    expect(isReviewComplete(harness.getState())).toBe(false);
  });
});
