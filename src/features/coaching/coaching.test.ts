import { beforeEach, describe, expect, it } from 'vitest';
import { buildDrill, buildPass, buildPlayer } from '@/test/builders';
import { IndexedDbDrillRepository } from '@/persistence/indexedDbRepository';
import { resetFakeIndexedDb } from '@/test/utils';
import { prepareImport } from '@/persistence/importService';
import { buildExportPayload } from '@/persistence/exportService';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { coachingSchema } from '@/domain/coachingSchema';
import { appReducer, createInitialState } from '@/core/state';
import { explainPlay, coachingBrief } from './explainPlay';
import { actorSignature } from '@/render3d/actorSignature';

const coaching = { teams: { home: 'Ice Hawks', away: 'Wolves' }, objective: 'Receive in stride', cues: 'Show a target', referenceImage: 'data:image/jpeg;base64,YQ==' };

describe('portable coaching context', () => {
  beforeEach(resetFakeIndexedDb);
  it('keeps team names, player identity, notes and sketch across save, edit, reload and JSON export/import', async () => {
    const repository = new IndexedDbDrillRepository();
    try {
      const drill = buildDrill({ players: [buildPlayer({ id: 'alex', name: 'Alex', number: '27', hasPuck: true })] });
      drill.settings = { ...drill.settings!, coaching };
      expect((await repository.save(drill)).ok).toBe(true);
      const first = await repository.read(drill.id);
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error(first.error.message);
      expect(first.value.settings?.coaching).toEqual(coaching);
      expect(first.value.players[0].name).toBe('Alex');
      first.value.settings!.coaching = { ...coaching, objective: 'Support the receiver' };
      expect((await repository.save(first.value)).ok).toBe(true);
      const second = await repository.read(drill.id);
      if (!second.ok) throw new Error(second.error.message);
      expect(second.value.settings?.coaching?.objective).toBe('Support the receiver');
      const payload = buildExportPayload([migrateV2ToV3(second.value)], false);
      const preview = await prepareImport(JSON.stringify(payload), repository);
      expect(preview.ok).toBe(true);
      const projected = projectToV2(payload.documents[0]);
      expect(projected.drill.players[0].name).toBe('Alex');
      expect(projected.drill.settings?.coaching?.teams.home).toBe('Ice Hawks');
    } finally { repository.close(); }
  });

  it('rejects remote, SVG and oversized reference images', () => {
    for (const referenceImage of ['https://example.com/x.jpg', 'data:image/svg+xml;base64,YQ==', 'data:image/jpeg;base64,' + 'a'.repeat(1500000)]) {
      expect(coachingSchema.safeParse({ ...coaching, referenceImage }).success).toBe(false);
    }
  });

  it('makes identity and coaching edits undoable and blocks them in preview', () => {
    const initial = createInitialState();
    const edited = appReducer(initial, { type: 'SET_COACHING', coaching });
    expect(edited.drill.settings?.coaching).toEqual(coaching);
    expect(appReducer(edited, { type: 'POP_UNDO' }).drill.settings?.coaching).toBeUndefined();
    const player = initial.drill.players[0];
    const named = appReducer(initial, { type: 'UPDATE_PLAYER_IDENTITY', id: player.id, name: 'Alex', number: '27', role: 'C' });
    expect(named.drill.players[0].name).toBe('Alex');
    expect(appReducer(named, { type: 'POP_UNDO' }).drill.players[0]).toEqual(player);
    const preview = { ...initial, ui: { ...initial.ui, mode: 'preview' as const } };
    expect(appReducer(preview, { type: 'SET_COACHING', coaching })).toBe(preview);
  });
});

describe('coaching explanations', () => {
  it('reports a blocked action instead of claiming the planned pass succeeded', () => {
    const drill = buildDrill({ players: [buildPlayer({ id: 'a', hasPuck: true }), buildPlayer({ id: 'b', name: 'Alex' })],
      events: [buildPass({ id: 'pass', fromPlayerId: 'b', toPlayerId: 'a', catchResult: 'caught' })] });
    const report = explainPlay(drill);
    expect(report.steps[0].outcome).toBe('Blocked');
    expect(report.steps[0].reason).toBeTruthy();
    expect(report.steps[0].action).toContain('Alex');
    expect(coachingBrief(drill, report)).toContain('not a prediction');
  });

  it('explains a coach-selected outcome as a scenario, not predictive reasoning', () => {
    const drill = buildDrill({ players: [buildPlayer({ id: 'a', hasPuck: true }), buildPlayer({ id: 'b', x: 620 })],
      events: [buildPass({ id: 'pass', fromPlayerId: 'a', toPlayerId: 'b', catchResult: 'caught' })] });
    const report = explainPlay(drill);
    expect(report.steps[0].planned).toBe('caught');
    expect(report.steps[0].progress).toBeGreaterThan(0);
  });
});

describe('3D rebuild boundaries', () => {
  it('does not rebuild models for notes, renames, route edits or movement, but does for identity/jersey changes', () => {
    const drill = buildDrill();
    const signature = actorSignature(drill);
    expect(actorSignature({ ...drill, name: 'Other play', skatePaths: [], settings: { ...drill.settings!, coaching }, players: drill.players.map(player => ({ ...player, x: player.x + 20 })) })).toBe(signature);
    expect(actorSignature({ ...drill, players: drill.players.map(player => ({ ...player, name: 'Alex' })) })).not.toBe(signature);
    expect(actorSignature({ ...drill, settings: { ...drill.settings!, jerseys: { home: '#00ff00', away: '#0000ff' } } })).not.toBe(signature);
  });
});
