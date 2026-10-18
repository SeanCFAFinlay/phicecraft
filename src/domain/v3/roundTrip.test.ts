import { describe, it, expect } from 'vitest';
import { projectToV2 } from './projectToV2';
import { mergeEditedIntoStored } from './mergeEditedV2';
import { migrateV2ToV3 } from './migrateV2ToV3';
import type { DrillDocumentV3 } from './types';

describe('V3 Round-Trip Data Integrity', () => {
  const createRichV3Drill = (): DrillDocumentV3 => ({
    schemaVersion: 3,
    id: 'test-drill',
    metadata: {
      title: 'Rich V3 Drill',
      summary: 'Testing round-trip loss',
      categories: ['passing'],
      tags: ['test'],
      ageBands: ['u13'],
      skillLevel: 'developing',
      rinkArea: 'full',
      durationMinutes: 5,
      skaterCount: { min: 2, max: 2 },
      goalieCount: 0,
      equipmentSummary: ['1 cone'],
      setupNotes: [],
      coachingPoints: [],
      progressions: [],
      variations: [],
    },
    rink: { area: 'full', orientation: 'horizontal', nets: ['left', 'right'] },
    actors: [
      { id: 'p1', kind: 'skater', team: 'home', number: '7', role: 'C', position: { x: 10, y: 10 } },
      { id: 'p2', kind: 'skater', team: 'home', number: '12', role: 'LW', position: { x: 20, y: 20 } },
    ],
    groups: [
      { id: 'g1', label: 'Line 1', kind: 'line' }
    ],
    equipment: [
      { id: 'cone1', kind: 'cone', position: { x: 50, y: 50 } }
    ],
    phases: [
      { id: 'phase1', label: 'Start', order: 0, startAtSeconds: 0, durationSeconds: 5, repeatCount: 1, finishPolicy: 'none' },
      { id: 'phase2', label: 'End', order: 1, startAtSeconds: 5, durationSeconds: 5, repeatCount: 1, finishPolicy: 'none' },
    ],
    actorTracks: [
      {
        actorId: 'p1',
        segments: [
          {
            id: 'seg1',
            phaseId: 'phase1',
            startAtSeconds: 0,
            durationSeconds: 2,
            points: [{ x: 10, y: 10 }, { x: 15, y: 15 }],
            curve: 'spline',
            movement: 'forward',
            finish: 'stop',
          },
          {
            id: 'seg2',
            phaseId: 'phase2',
            startAtSeconds: 5,
            durationSeconds: 2,
            points: [{ x: 15, y: 15 }, { x: 20, y: 20 }],
            curve: 'spline',
            movement: 'forward',
            finish: 'stop',
          },
        ],
      },
    ],
    puckTracks: [
      {
        id: 'puck1',
        initialSource: { kind: 'actor', actorId: 'p1' },
        actions: [
          {
            id: 'act1',
            phaseId: 'phase1',
            fromActorId: 'p1',
            fromPoint: { x: 15, y: 15 },
            releaseAt: 2,
            arrivalAt: 3,
            waypoints: [],
            shape: 'spline',
            type: 'pass',
            toActorId: 'p2',
            targetMode: 'actor',
            target: { x: 20, y: 20 },
            passType: 'flat',
            receiveMode: 'control',
          },
        ],
      },
    ],
    annotations: [
      { id: 'ann1', kind: 'text', position: { x: 0, y: 0 }, text: 'Start here' }
    ],
    presentation: {
      durationSeconds: 10,
      jerseys: { home: '#ff0000', away: '#0000ff' },
      reducedEffects: false,
      defaultView: '2d',
      showPlayerNumbers: true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  it('preserves V3 structure when a projected play is edited and merged', () => {
    const stored = createRichV3Drill();
    const projected = projectToV2(stored).drill;
    const edited = migrateV2ToV3({ ...projected, name: 'Edited play' });
    const result = mergeEditedIntoStored(stored, edited);

    expect(result.metadata.title).toBe('Edited play');
    expect(result.groups).toEqual(stored.groups);
    expect(result.equipment).toEqual(stored.equipment);
    expect(result.annotations).toEqual(stored.annotations);
    expect(result.phases).toEqual(stored.phases);
    expect(result.puckTracks[0].actions).toHaveLength(1);
    expect(result.actorTracks[0].segments).toHaveLength(2);
  });
});
