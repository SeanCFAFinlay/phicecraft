// ============================================================================
// DOCUMENT COMMANDS
//
// Save, load, delete, import and export. The rule that shapes all of it:
// nothing is reported as successful until the repository has actually said so,
// and no visible document changes until its replacement is durable.
// ============================================================================

import type { Drill, DrillMeta, ID } from '@/core/types';
import type { DrillDocumentV3 } from '@/domain/v3/types';
import { duplicateDrill } from '@/engine/drill';
import { generateId } from '@/utils/id';
import {
  commitImport as commitImportToRepository,
  buildRecoveryBundle,
  describePersistenceError,
  exportDrills as buildExport,
  migrateLegacyLocalStorage,
  prepareImport as prepareImportFromText,
  type ImportDecision,
  type ImportPreview,
} from '@/persistence';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { fiveManCornerRetrievalDrill } from '@/fixtures/fiveManCornerRetrieval.v1';
import { fiveManCrossCornerDrill } from '@/fixtures/fiveManCrossCorner.v1';
import { fiveManLowHighDrill } from '@/fixtures/fiveManLowHigh.v1';
import { CONFIRMATIONS, deleteDrillConfirmation } from './confirmations';
import { remapImportedDrill } from '@/persistence/drillPipeline';
import {
  cancelled,
  done,
  failed,
  rejected,
  type CommandHost,
  type DocumentCommands,
} from './commandTypes';

const FIXTURES = {
  'give-and-go': giveAndGoRegressionDrill,
  'corner-retrieval': fiveManCornerRetrievalDrill,
  'cross-corner': fiveManCrossCornerDrill,
  'low-high': fiveManLowHighDrill,
} as const;

export function createDocumentCommands(host: CommandHost): DocumentCommands {
  const { dispatch, getState, notify, repository, coordinator } = host;

  async function refreshDrillList(): Promise<DrillMeta[]> {
    const list = await repository.list();
    if (!list.ok) {
      notify.toast({
        message: describePersistenceError(list.error),
        type: 'error',
        duration: 0,
        dedupeKey: 'list-failed',
      });
      return getState().drillList;
    }
    dispatch({ type: 'SET_DRILL_LIST', drills: list.value });
    return list.value;
  }

  function reportFailure(operation: string, error: Parameters<typeof describePersistenceError>[0]) {
    notify.toast({
      message: `${operation}: ${describePersistenceError(error)}`,
      type: 'error',
      duration: 0,
      role: 'alert',
      dedupeKey: `failed:${operation}`,
    });
    return failed(error);
  }

  /** Adopt a drill as the visible, durable document. */
  function openDrill(drill: Drill): void {
    dispatch({ type: 'LOAD_DRILL', drill });
    coordinator.adoptSaved(drill, host.now());
    void repository.setCurrentDrillId(drill.id);
  }

  return {
    async initialize() {
      const opened = await repository.open();
      if (!opened.ok) {
        notify.toast({
          message: describePersistenceError(opened.error),
          type: 'error',
          duration: 0,
          role: 'alert',
          dedupeKey: 'storage-unavailable',
        });
        return;
      }

      const migration = await migrateLegacyLocalStorage(repository, { now: host.now() });
      if (!migration.ok) {
        notify.toast({
          message: `Could not move your saved plays into the new store: ${describePersistenceError(
            migration.error
          )} Your old data has been left untouched.`,
          type: 'error',
          duration: 0,
          role: 'alert',
          dedupeKey: 'migration-failed',
        });
      } else if (migration.value.migratedIds.length > 0 || migration.value.recoveredKeys.length > 0) {
        const { migratedIds, recoveredKeys } = migration.value;
        notify.toast({
          message:
            recoveredKeys.length > 0
              ? `Moved ${migratedIds.length} saved play(s) across. ${recoveredKeys.length} could not be read and were kept for recovery.`
              : `Moved ${migratedIds.length} saved play(s) into local storage.`,
          type: recoveredKeys.length > 0 ? 'warning' : 'success',
          duration: recoveredKeys.length > 0 ? 0 : 4000,
        });
      }

      await refreshDrillList();

      const currentId = await repository.getCurrentDrillId();
      if (currentId.ok && currentId.value) {
        const drill = await repository.read(currentId.value);
        if (drill.ok) {
          openDrill(drill.value);
          return;
        }
        if (drill.error.code !== 'not-found') {
          reportFailure('Could not reopen your last play', drill.error);
        }
      }

      // Nothing to reopen: adopt the freshly created in-memory drill and save
      // it, so the library is never empty after a first run.
      const initial = getState().drill;
      const saved = await coordinator.save(initial);
      if (saved.ok) {
        await repository.setCurrentDrillId(initial.id);
        await refreshDrillList();
      }
    },

    async newDrill() {
      if (!(await host.confirm(CONFIRMATIONS.newDrill))) return cancelled();

      dispatch({ type: 'STOP_PLAYBACK' });
      dispatch({ type: 'NEW_DRILL' });
      dispatch({ type: 'CLOSE_MENU' });
      coordinator.reset();

      const drill = getState().drill;
      const saved = await coordinator.save(drill);
      if (!saved.ok) return reportFailure('New drill could not be saved', saved.error);

      await repository.setCurrentDrillId(drill.id);
      await refreshDrillList();
      notify.toast({ message: 'New drill started', type: 'success' });
      return done();
    },

    async loadDrill(id) {
      if (id === getState().drill.id) {
        dispatch({ type: 'CLOSE_MENU' });
        return done();
      }

      // Flush the outgoing drill before switching, so the copy on screen is
      // never the only copy.
      const flush = await coordinator.flush();
      if (!flush.ok) {
        notify.toast({
          message: `Your current play could not be saved, so it was not switched away from: ${describePersistenceError(
            flush.error
          )}`,
          type: 'error',
          duration: 0,
          role: 'alert',
          dedupeKey: 'switch-blocked',
        });
        return failed(flush.error);
      }

      const drill = await repository.read(id);
      if (!drill.ok) return reportFailure('Could not open that play', drill.error);

      dispatch({ type: 'STOP_PLAYBACK' });
      openDrill(drill.value);
      dispatch({ type: 'CLOSE_MENU' });
      return done();
    },

    async useTemplate(templateId) {
      // Imported on demand: the catalogue is large, and a coach who never uses
      // a template should not carry it in the startup bundle.
      const [{ findTemplate }, { projectToV2 }] = await Promise.all([
        import('@/data/templates/registry'),
        import('@/domain/v3/projectToV2'),
      ]);

      const template = findTemplate(templateId);
      if (!template) return rejected('That drill is no longer in the library.');

      const now = host.now();
      const freshId = generateId();
      // Project to the shape the engine runs, then re-identify everything. The
      // template document itself is never handed to the editor, so nothing a
      // coach does can reach back into the catalogue. `remapImportedDrill`
      // re-ids every player/route/event independently of the document's own
      // fresh id below, so the projected copy's internal ids differ from the
      // stored document's - that is fine, because the save-merge
      // (`mergeEditedIntoStored`) replaces actors/tracks wholesale from the
      // edited side rather than reconciling ids across the two shapes.
      const { drill: projected, losses } = projectToV2(template.document);
      const copy: Drill = {
        ...remapImportedDrill(projected, generateId, now),
        id: freshId,
        name: template.document.metadata.title,
        createdAt: now,
        updatedAt: now,
      };

      // The full v3 document is what gets stored, so equipment, annotations,
      // phases and extra puck tracks survive the copy - the projected `copy`
      // above only exists to seed the v2 editor.
      const documentCopy: DrillDocumentV3 = {
        ...structuredClone(template.document),
        id: freshId,
        templateId: template.id,
        createdAt: now,
        updatedAt: now,
        metadata: { ...template.document.metadata },
      };

      dispatch({ type: 'STOP_PLAYBACK' });
      dispatch({ type: 'LOAD_DRILL', drill: copy });
      dispatch({ type: 'CLOSE_MENU' });
      dispatch({ type: 'CLOSE_SHEET' });
      coordinator.reset();

      const saved = await repository.saveDocumentV3(documentCopy);
      if (!saved.ok) return reportFailure('That drill could not be saved', saved.error);

      coordinator.adoptSaved(copy, now);
      await repository.setCurrentDrillId(copy.id);
      await refreshDrillList();

      notify.toast({ message: `Opened “${copy.name}” as a new drill`, type: 'success' });
      // Say what the current engine cannot yet play, rather than letting a
      // coach find the cones missing at the rink.
      if (losses.length > 0) {
        host.announce(losses.map(loss => loss.detail).join(' '));
      }
      return done();
    },

    async loadFixture(name) {
      const template = FIXTURES[name];
      const now = host.now();
      const drill: Drill = {
        ...structuredClone(template),
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };

      dispatch({ type: 'STOP_PLAYBACK' });
      dispatch({ type: 'LOAD_DRILL', drill });
      dispatch({ type: 'CLOSE_MENU' });
      coordinator.reset();

      const saved = await coordinator.save(drill);
      if (!saved.ok) return reportFailure('The example could not be saved', saved.error);

      await repository.setCurrentDrillId(drill.id);
      await refreshDrillList();
      notify.toast({ message: `Loaded “${drill.name}”`, type: 'success' });
      return done();
    },

    renameDrill(name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      dispatch({ type: 'RENAME_DRILL', name: trimmed });
      dispatch({ type: 'HIDE_RENAME_MODAL' });
    },

    async requestRename() {
      const current = getState().drill.name;
      const name = await host.promptForText({
        id: 'rename-drill',
        title: 'Rename this play',
        label: 'Play name',
        initialValue: current,
        confirmLabel: 'Save name',
        maxLength: 60,
      });
      if (name === null) return cancelled();

      const trimmed = name.trim();
      if (!trimmed) return rejected('A play needs a name.');

      dispatch({ type: 'RENAME_DRILL', name: trimmed });
      const saved = await coordinator.save(getState().drill);
      if (!saved.ok) return reportFailure('The new name could not be saved', saved.error);

      await refreshDrillList();
      notify.toast({ message: `Renamed to “${trimmed}”`, type: 'success' });
      return done();
    },

    async saveDrill() {
      const result = await coordinator.save(getState().drill);
      if (!result.ok) return reportFailure('Save failed', result.error);

      await repository.setCurrentDrillId(getState().drill.id);
      await refreshDrillList();
      notify.toast({ message: 'Play saved', type: 'success', dedupeKey: 'play-saved' });
      return done();
    },

    async saveAsNewPlay(name) {
      const suggested = `${getState().drill.name} (copy)`;
      const chosen =
        name ??
        (await host.promptForText({
          id: 'save-as-new',
          title: 'Save as a new play',
          label: 'New play name',
          initialValue: suggested,
          confirmLabel: 'Save copy',
          maxLength: 60,
        }));
      if (chosen === null) return cancelled();

      const trimmed = chosen.trim();
      if (!trimmed) return rejected('A play needs a name.');

      const copy = duplicateDrill(getState().drill, trimmed);

      // The copy has to be durable BEFORE the editor switches to it, or a
      // failed write leaves the user editing a document that does not exist.
      const stored = await repository.save(copy);
      if (!stored.ok) {
        return reportFailure('The copy was not saved, so you are still editing the original', stored.error);
      }

      openDrill(copy);
      dispatch({ type: 'CLOSE_MENU' });
      await refreshDrillList();
      notify.toast({ message: `Saved as “${trimmed}”`, type: 'success' });
      return done(copy.id);
    },

    async deleteDrill(id) {
      const meta = getState().drillList.find(item => item.id === id);
      const name = meta?.name ?? 'this play';
      if (!(await host.confirm(deleteDrillConfirmation(name)))) return cancelled();

      const deleted = await repository.delete(id);
      if (!deleted.ok) {
        // The drill is still there, so it stays on screen and in the list.
        return reportFailure(`“${name}” was not deleted`, deleted.error);
      }

      dispatch({ type: 'DELETE_DRILL', id });
      const remaining = await refreshDrillList();

      if (getState().drill.id === id) {
        const next = remaining.find(item => item.id !== id);
        const replacement = next ? await repository.read(next.id) : null;
        if (replacement?.ok) {
          dispatch({ type: 'STOP_PLAYBACK' });
          openDrill(replacement.value);
        } else {
          dispatch({ type: 'STOP_PLAYBACK' });
          dispatch({ type: 'NEW_DRILL' });
          coordinator.reset();
          const fresh = getState().drill;
          await coordinator.save(fresh);
          await repository.setCurrentDrillId(fresh.id);
          await refreshDrillList();
        }
      }

      notify.toast({ message: `“${name}” deleted`, type: 'success' });
      return done();
    },

    async exportDrills() {
      const result = await buildExport({
        repository,
        coordinator,
        confirmUnsavedExport: host.confirmUnsavedExport,
        now: host.now(),
      });

      if (!result.ok) return reportFailure('Export failed', result.error);
      if (result.value.kind === 'cancelled') return cancelled();

      const { filename, json, payload } = result.value;
      const downloaded = host.download(filename, json);
      if (!downloaded) {
        // No file was produced, so nothing may claim otherwise.
        notify.toast({
          message: 'The download did not start. Check your browser’s download permissions and try again.',
          type: 'error',
          duration: 0,
          role: 'alert',
        });
        return rejected('download-blocked');
      }

      notify.toast({
        message: payload.containsUnsavedRevision
          ? `Exported ${payload.documents.length} play(s), including your unsaved changes`
          : `Exported ${payload.documents.length} play(s)`,
        type: payload.containsUnsavedRevision ? 'warning' : 'success',
      });
      dispatch({ type: 'CLOSE_MENU' });
      return done();
    },

    async prepareImport(text) {
      const preview = await prepareImportFromText(text, repository, { now: host.now() });
      if (!preview.ok) return reportFailure('That file could not be imported', preview.error);

      if (preview.value.candidates.length === 0) {
        const detail = preview.value.failures[0]?.message ?? 'No drills were found in that file.';
        notify.toast({ message: `Nothing could be imported. ${detail}`, type: 'error', duration: 0 });
        return rejected(detail);
      }

      host.publishImportPreview(preview.value);
      dispatch({ type: 'OPEN_SHEET', sheet: 'import-preview' });
      return done(preview.value);
    },

    async commitImport(preview: ImportPreview, decisions: ImportDecision[]) {
      const result = await commitImportToRepository(preview, decisions, repository, { now: host.now() });
      if (!result.ok) return reportFailure('The import was not stored', result.error);

      const { importedIds, replacedIds, failures, warnings } = result.value;
      await refreshDrillList();
      host.publishImportPreview(null);
      dispatch({ type: 'CLOSE_SHEET' });

      // Open the drill that was actually imported, by its exact ID - never
      // whatever happens to sit at the top of the list.
      const openId = importedIds[0] ?? replacedIds[0];
      if (openId) {
        const drill = await repository.read(openId);
        if (drill.ok) {
          dispatch({ type: 'STOP_PLAYBACK' });
          openDrill(drill.value);
        }
      }

      const total = importedIds.length + replacedIds.length;
      notify.toast({
        message:
          failures.length > 0
            ? `Imported ${total} play(s); ${failures.length} could not be read and were kept for recovery.`
            : `Imported ${total} play(s)`,
        type: failures.length > 0 ? 'warning' : 'success',
        duration: failures.length > 0 ? 0 : 3000,
      });

      for (const warning of warnings.slice(0, 2)) {
        notify.toast({ message: warning, type: 'info', dedupeKey: `import-warning:${warning}` });
      }

      dispatch({ type: 'CLOSE_MENU' });
      return done([...importedIds, ...replacedIds]);
    },

    async retrySave() {
      const result = await coordinator.retry();
      if (!result.ok) return reportFailure('Retry failed', result.error);
      notify.toast({ message: 'Saved', type: 'success', dedupeKey: 'play-saved' });
      await refreshDrillList();
      return done();
    },

    async exportUnsavedData() {
      const pending = coordinator.pendingDocument ?? getState().drill;
      const json = JSON.stringify(
        {
          format: 'phicecraft-drills',
          version: 1,
          exportedAt: host.now(),
          containsUnsavedRevision: true,
          drills: [pending],
        },
        null,
        2
      );

      const downloaded = host.download(`phicecraft-unsaved-${pending.name || 'drill'}.json`, json);
      if (!downloaded) {
        notify.toast({
          message: 'The download did not start. Check your browser’s download permissions.',
          type: 'error',
          duration: 0,
          role: 'alert',
        });
        return rejected('download-blocked');
      }

      notify.toast({ message: 'Your unsaved work has been exported', type: 'success' });
      return done();
    },

    async downloadRecoveryBundle() {
      const bundle = await buildRecoveryBundle(repository, host.now());
      if (!bundle.ok) return reportFailure('Recovery data could not be read', bundle.error);

      if (bundle.value.bundle.recordCount === 0) {
        notify.toast({ message: 'There is nothing in the recovery store', type: 'info' });
        return done();
      }

      const downloaded = host.download(bundle.value.filename, bundle.value.json);
      if (!downloaded) return rejected('download-blocked');

      notify.toast({
        message: `Downloaded ${bundle.value.bundle.recordCount} recovery record(s)`,
        type: 'success',
      });
      return done();
    },

    dismissPersistenceError() {
      coordinator.dismissError();
    },
  };
}

export type { ID };
