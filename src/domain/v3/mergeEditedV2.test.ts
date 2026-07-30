import { beforeAll, describe, expect, it } from 'vitest';
import { findTemplate } from '@/data/templates/registry';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { mergeEditedIntoStored } from '@/domain/v3/mergeEditedV2';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { projectToV2 } from '@/domain/v3/projectToV2';
import type { DrillDocumentV3, DrillPhase } from '@/domain/v3/types';
import { validateV3Document } from '@/domain/v3/validation';

describe('mergeEditedIntoStored', () => {
  // 'tpl-picket-fences' is a small-area game that ships eight cones as real
  // equipment - the exact v3-only content a naive save would erase.
  const template = findTemplate('tpl-picket-fences');
  const stored = structuredClone(template!.document);

  beforeAll(() => {
    expect(template).not.toBeNull();
    expect(stored.equipment.length).toBeGreaterThan(0);
  });

  it('a projected edit-save round trip keeps equipment and annotations', () => {
    const { drill } = projectToV2(stored);
    drill.players[0] = { ...drill.players[0], x: drill.players[0].x + 25 };
    const merged = mergeEditedIntoStored(stored, migrateV2ToV3(drill));
    expect(merged.equipment).toEqual(stored.equipment);
    expect(merged.annotations).toEqual(stored.annotations);
  });

  it('keeps the edited first puck track and the stored extra tracks', () => {
    const { drill } = projectToV2(stored);
    const merged = mergeEditedIntoStored(stored, migrateV2ToV3(drill));
    expect(merged.puckTracks.length).toBe(stored.puckTracks.length);
    if (stored.puckTracks.length > 1) {
      expect(merged.puckTracks.slice(1)).toEqual(stored.puckTracks.slice(1));
    }
  });

  it('keeps rich metadata but takes the edited title', () => {
    const { drill } = projectToV2(stored);
    drill.name = 'Renamed by coach';
    const edited = migrateV2ToV3(drill);
    const merged = mergeEditedIntoStored(stored, edited);
    expect(merged.metadata.title).toBe('Renamed by coach');
    expect(merged.metadata.coachingPoints).toEqual(stored.metadata.coachingPoints);
    expect(merged.metadata.categories).toEqual(stored.metadata.categories);
  });

  it('takes the edited jerseys, reducedEffects and duration, but keeps the stored defaultView', () => {
    const { drill } = projectToV2(stored);
    drill.settings = {
      ...drill.settings!,
      jerseys: { home: '#129d5a', away: '#2f80ed' },
      reducedEffects: true,
    };
    const edited = migrateV2ToV3(drill);
    const merged = mergeEditedIntoStored(
      { ...stored, presentation: { ...stored.presentation, defaultView: '3d' } },
      edited
    );

    // The coach's edits, which v2 can express, must survive the save.
    expect(merged.presentation.jerseys).toEqual({ home: '#129d5a', away: '#2f80ed' });
    expect(merged.presentation.reducedEffects).toBe(true);
    expect(merged.presentation.durationSeconds).toBe(edited.presentation.durationSeconds);
    // defaultView has no v2 equivalent - migrateV2ToV3 always hardcodes '2d' -
    // so the merge must keep whatever was already stored, not silently reset it.
    expect(merged.presentation.defaultView).toBe('3d');
  });

  it('produces a coherent document', () => {
    const { drill } = projectToV2(stored);
    const merged = mergeEditedIntoStored(stored, migrateV2ToV3(drill));
    expect(validateV3Document(merged).valid).toBe(true);
  });

  it('with no stored extras it is the edited document plus provenance', () => {
    const { drill } = projectToV2(stored);
    const edited = migrateV2ToV3(drill);
    const bare = { ...edited, templateId: undefined };
    const merged = mergeEditedIntoStored(bare, edited);
    expect(merged.actorTracks).toEqual(edited.actorTracks);
    expect(merged.createdAt).toBe(bare.createdAt);
  });
});

/**
 * Every template in the catalogue has exactly one phase and one puck track,
 * so `mergeEditedIntoStored`'s multi-phase re-anchoring (`reanchorSegment`,
 * `reanchorAction`) and its preservation of extra puck tracks beyond the
 * first are never exercised by the tests above. Both are reachable the
 * moment a stored document has more than one phase or more than one puck
 * track - reachable via `readAllDocumentsV3`/`saveDocumentV3` even though no
 * template currently produces that shape - so they are covered here against
 * a hand-built fixture instead.
 */
describe('mergeEditedIntoStored - multi-phase re-anchoring and extra puck tracks (rules 4 and 5)', () => {
  /**
   * A stored v3 document with two phases (named so neither collides with
   * `MIGRATED_PHASE_ID`, the single phase id every fresh v2 edit is migrated
   * onto) and two puck tracks, built from the give-and-go v2 fixture.
   */
  function buildMultiPhaseStoredFixture(): DrillDocumentV3 {
    const base = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
    const [track11, track13] = base.actorTracks;
    const [pass, shot] = base.puckTracks[0].actions;

    const phaseA: DrillPhase = { ...base.phases[0], id: 'phase-A' };
    const phaseB: DrillPhase = {
      id: 'phase-B',
      label: 'Second phase',
      order: 1,
      startAtSeconds: phaseA.durationSeconds,
      durationSeconds: 4,
      repeatCount: 1,
      finishPolicy: 'none',
    };

    return {
      ...base,
      phases: [phaseA, phaseB],
      actorTracks: [
        { ...track11, segments: track11.segments.map(segment => ({ ...segment, phaseId: phaseA.id })) },
        { ...track13, segments: track13.segments.map(segment => ({ ...segment, phaseId: phaseB.id })) },
      ],
      puckTracks: [
        {
          ...base.puckTracks[0],
          actions: [
            { ...pass, phaseId: phaseA.id },
            { ...shot, phaseId: phaseA.id },
          ],
        },
        {
          id: 'puck-2',
          initialSource: { kind: 'loose', at: { x: 0, y: 0 } },
          actions: [],
        },
      ],
    };
  }

  const stored = buildMultiPhaseStoredFixture();

  it('the hand-built fixture is itself a coherent document', () => {
    expect(validateV3Document(stored).valid).toBe(true);
  });

  it('keeps the stored multi-phase list, re-anchors unresolved edited phase ids, and preserves the extra puck track verbatim', () => {
    const { drill } = projectToV2(stored);
    const edited = migrateV2ToV3(drill);
    // Confirms the premise: a fresh edit always comes back on one phase whose
    // id is not among the stored document's phases, which is what forces the
    // re-anchoring below rather than every id trivially resolving already.
    expect(edited.phases).toHaveLength(1);
    expect(stored.phases.some(phase => phase.id === edited.phases[0].id)).toBe(false);

    const merged = mergeEditedIntoStored(stored, edited);

    // Rule 5: the stored multi-phase list is kept, not replaced by the
    // edit's single phase.
    expect(merged.phases).toEqual(stored.phases);

    // Rule 5: every edited segment/action, tagged with a phase id that does
    // not resolve against the stored phases, is re-anchored onto the first
    // stored phase.
    const anchorPhaseId = stored.phases[0].id;
    for (const track of merged.actorTracks) {
      for (const segment of track.segments) {
        expect(segment.phaseId).toBe(anchorPhaseId);
      }
    }
    for (const action of merged.puckTracks[0].actions) {
      expect(action.phaseId).toBe(anchorPhaseId);
    }

    // Rule 4: the stored extra puck track survives verbatim.
    expect(merged.puckTracks.length).toBe(2);
    expect(merged.puckTracks[1]).toEqual(stored.puckTracks[1]);

    expect(validateV3Document(merged).valid).toBe(true);
  });
});
