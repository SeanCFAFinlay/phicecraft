// ============================================================================
// REMAPPING A V3 DOCUMENT'S IDS
//
// A template copy must not share so much as one id with the template it came
// from - a stranded actor/equipment/phase reference is exactly the kind of
// aliasing bug the v2 coach hack was. This fixture deliberately exercises
// every category the domain model can reference: two phases, a group,
// equipment, multi-segment movement, and puck tracks sourced from an actor,
// a coach and equipment, so a category the implementation forgets shows up
// as a dangling reference rather than passing by omission.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { remapDocumentIds } from './remapIds';
import { validateV3Document } from './validation';
import { DRILL_SCHEMA_VERSION_3, type DrillDocumentV3 } from './types';

function fixture(): DrillDocumentV3 {
  return {
    schemaVersion: DRILL_SCHEMA_VERSION_3,
    id: 'doc-original',
    metadata: {
      title: 'Fixture drill',
      summary: 'A fixture exercising every id category',
      categories: ['passing'],
      tags: [],
      ageBands: ['u13'],
      skillLevel: 'developing',
      rinkArea: 'full',
      durationMinutes: 10,
      skaterCount: { min: 2, max: 2 },
      goalieCount: 1,
      equipmentSummary: [],
      setupNotes: [],
      coachingPoints: [],
      progressions: [],
      variations: [],
    },
    rink: { area: 'full', orientation: 'horizontal', nets: ['left', 'right'] },
    actors: [
      {
        kind: 'skater',
        id: 'actor-skater-1',
        team: 'home',
        number: '13',
        role: 'F',
        position: { x: 200, y: 100 },
        groupId: 'group-1',
      },
      {
        kind: 'skater',
        id: 'actor-skater-2',
        team: 'home',
        number: '44',
        role: 'D',
        position: { x: 300, y: 300 },
      },
      {
        kind: 'goalie',
        id: 'actor-goalie-1',
        team: 'away',
        number: '31',
        position: { x: 930, y: 212.5 },
      },
      {
        kind: 'coach',
        id: 'actor-coach-1',
        name: 'Coach',
        position: { x: 500, y: 20 },
      },
    ],
    groups: [{ id: 'group-1', label: 'Forwards', kind: 'line' }],
    equipment: [
      { id: 'equip-cone-1', kind: 'cone', position: { x: 400, y: 200 } },
      { id: 'equip-pile-1', kind: 'puck-pile', position: { x: 100, y: 100 }, count: 5 },
    ],
    phases: [
      {
        id: 'phase-1',
        label: 'Setup',
        order: 0,
        startAtSeconds: 0,
        durationSeconds: 5,
        repeatCount: 1,
        finishPolicy: 'none',
      },
      {
        id: 'phase-2',
        label: 'Finish',
        order: 1,
        startAtSeconds: 5,
        durationSeconds: 5,
        repeatCount: 2,
        finishPolicy: 'finish-with-shot',
      },
    ],
    actorTracks: [
      {
        actorId: 'actor-skater-1',
        segments: [
          {
            id: 'seg-1',
            phaseId: 'phase-1',
            startAtSeconds: 0,
            durationSeconds: 5,
            points: [
              { x: 200, y: 100 },
              { x: 300, y: 150 },
            ],
            curve: 'spline',
            movement: 'forward',
          },
          {
            id: 'seg-2',
            phaseId: 'phase-2',
            startAtSeconds: 5,
            durationSeconds: 5,
            points: [
              { x: 300, y: 150 },
              { x: 400, y: 200 },
            ],
            curve: 'spline',
            movement: 'forward',
          },
        ],
      },
    ],
    puckTracks: [
      {
        id: 'puck-1',
        initialSource: { kind: 'actor', actorId: 'actor-skater-1' },
        actions: [
          {
            id: 'action-1',
            phaseId: 'phase-1',
            fromActorId: 'actor-skater-1',
            fromPoint: { x: 200, y: 100 },
            releaseAt: 1,
            arrivalAt: 2,
            waypoints: [],
            shape: 'spline',
            type: 'pass',
            toActorId: 'actor-skater-2',
            targetMode: 'actor',
            target: { x: 300, y: 300 },
            passType: 'flat',
            receiveMode: 'control',
          },
          {
            id: 'action-2',
            phaseId: 'phase-2',
            fromActorId: 'actor-skater-2',
            fromPoint: { x: 300, y: 300 },
            releaseAt: 6,
            arrivalAt: 7,
            waypoints: [],
            shape: 'spline',
            type: 'turnover',
            toActorId: 'actor-skater-1',
            target: { x: 300, y: 150 },
          },
        ],
      },
      {
        id: 'puck-2',
        label: 'Second puck',
        initialSource: { kind: 'coach', actorId: 'actor-coach-1' },
        actions: [
          {
            id: 'action-3',
            phaseId: 'phase-1',
            fromActorId: 'actor-coach-1',
            fromPoint: { x: 500, y: 20 },
            releaseAt: 0.5,
            arrivalAt: 1.5,
            waypoints: [],
            shape: 'spline',
            type: 'dump',
            target: { x: 400, y: 200 },
            dumpStyle: 'dump',
          },
        ],
      },
      {
        id: 'puck-3',
        initialSource: { kind: 'equipment', equipmentId: 'equip-pile-1' },
        actions: [
          {
            id: 'action-4',
            phaseId: 'phase-2',
            fromActorId: 'actor-skater-2',
            fromPoint: { x: 100, y: 100 },
            releaseAt: 6,
            arrivalAt: 6.5,
            waypoints: [],
            shape: 'spline',
            type: 'pickup',
            target: { x: 100, y: 100 },
          },
        ],
      },
    ],
    annotations: [
      { id: 'ann-1', kind: 'text', position: { x: 500, y: 400 }, text: 'Go here', phaseId: 'phase-1' },
      { id: 'ann-2', kind: 'zone', position: { x: 600, y: 250 } },
    ],
    presentation: {
      durationSeconds: 10,
      jerseys: { home: '#ffffff', away: '#000000' },
      reducedEffects: false,
      defaultView: '2d',
      showPlayerNumbers: true,
    },
    createdAt: 1000,
    updatedAt: 1000,
    templateId: 'tpl-fixture',
  };
}

/** Every id string that appears anywhere in the document, however it is used. */
function allOriginalIds(document: DrillDocumentV3): Set<string> {
  const ids = new Set<string>();
  document.actors.forEach(actor => {
    ids.add(actor.id);
    if (actor.kind === 'skater' && actor.groupId) ids.add(actor.groupId);
  });
  document.groups.forEach(group => ids.add(group.id));
  document.equipment.forEach(item => ids.add(item.id));
  document.phases.forEach(phase => ids.add(phase.id));
  document.actorTracks.forEach(track => {
    ids.add(track.actorId);
    track.segments.forEach(segment => {
      ids.add(segment.id);
      ids.add(segment.phaseId);
    });
  });
  document.puckTracks.forEach(track => {
    ids.add(track.id);
    const source = track.initialSource;
    if (source.kind === 'actor' || source.kind === 'coach') ids.add(source.actorId);
    if (source.kind === 'equipment') ids.add(source.equipmentId);
    track.actions.forEach(action => {
      ids.add(action.id);
      ids.add(action.phaseId);
      ids.add(action.fromActorId);
      if (action.type === 'pass' && action.toActorId) ids.add(action.toActorId);
      if (action.type === 'turnover') ids.add(action.toActorId);
    });
  });
  document.annotations.forEach(annotation => {
    ids.add(annotation.id);
    if (annotation.phaseId) ids.add(annotation.phaseId);
  });
  return ids;
}

function makeIdGenerator() {
  let n = 0;
  return () => `fresh-${n++}`;
}

describe('remapDocumentIds', () => {
  it('produces a document with no id in common with the original', () => {
    const original = fixture();
    const remapped = remapDocumentIds(original, makeIdGenerator());

    const originalIds = allOriginalIds(original);
    const remappedIds = allOriginalIds(remapped);

    for (const id of remappedIds) {
      expect(originalIds.has(id)).toBe(false);
    }
    expect(remappedIds.size).toBe(originalIds.size);
  });

  it('is internally coherent: validateV3Document reports it valid, with no dangling references', () => {
    const remapped = remapDocumentIds(fixture(), makeIdGenerator());
    const result = validateV3Document(remapped);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('remaps the same original id to the same fresh id everywhere it is used', () => {
    const remapped = remapDocumentIds(fixture(), makeIdGenerator());

    const skater1 = remapped.actors.find(actor => actor.position.x === 200 && actor.position.y === 100)!;
    // actor-skater-1 is the owner of the movement track, the initial puck
    // source, the first action's origin, and the turnover's destination -
    // every one of those must land on the exact same fresh id.
    expect(remapped.actorTracks[0].actorId).toBe(skater1.id);
    const puck1 = remapped.puckTracks.find(track => track.actions.length === 2)!;
    expect(puck1.initialSource.kind === 'actor' && puck1.initialSource.actorId).toBe(skater1.id);
    expect(puck1.actions[0].fromActorId).toBe(skater1.id);
    expect(puck1.actions[1].type === 'turnover' && puck1.actions[1].toActorId).toBe(skater1.id);

    // The group id referenced by the skater's groupId matches the group's own
    // remapped id.
    expect(skater1.kind === 'skater' && skater1.groupId).toBe(remapped.groups[0].id);
  });

  it('leaves the document id, and every non-identity field, untouched', () => {
    const original = fixture();
    const remapped = remapDocumentIds(original, makeIdGenerator());

    // The caller (useTemplate) assigns the fresh document id itself, after
    // remapping - this function only touches internal references.
    expect(remapped.id).toBe(original.id);
    expect(remapped.metadata).toEqual(original.metadata);
    expect(remapped.rink).toEqual(original.rink);
    expect(remapped.presentation).toEqual(original.presentation);
    expect(remapped.actors[0].position).toEqual(original.actors[0].position);
    expect(remapped.phases[0].label).toBe(original.phases[0].label);
    expect(remapped.phases[1].repeatCount).toBe(original.phases[1].repeatCount);
  });

  it('keeps every actor, group, equipment item, phase, track and annotation - only ids move', () => {
    const original = fixture();
    const remapped = remapDocumentIds(original, makeIdGenerator());

    expect(remapped.actors).toHaveLength(original.actors.length);
    expect(remapped.groups).toHaveLength(original.groups.length);
    expect(remapped.equipment).toHaveLength(original.equipment.length);
    expect(remapped.phases).toHaveLength(original.phases.length);
    expect(remapped.actorTracks).toHaveLength(original.actorTracks.length);
    expect(remapped.actorTracks[0].segments).toHaveLength(original.actorTracks[0].segments.length);
    expect(remapped.puckTracks).toHaveLength(original.puckTracks.length);
    expect(remapped.annotations).toHaveLength(original.annotations.length);
  });
});
