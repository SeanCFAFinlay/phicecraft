// ============================================================================
// PROJECTING V3 BACK ONTO THE V2 ENGINE
//
// The strangler seam. Two things have to be true for it to be safe:
//
//   1. A drill that came FROM v2 must survive the round trip unchanged. If it
//      does not, adopting v3 as the stored format silently rewrites everybody's
//      existing work.
//   2. Anything v2 cannot hold must be REPORTED, not quietly dropped. A coach
//      who places cones and finds them missing at practice is worse served
//      than one who was told the cones are not drawn yet.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { migrateV2ToV3 } from './migrateV2ToV3';
import { projectToV2, projectionLosses } from './projectToV2';
import type { DrillDocumentV3, EquipmentItem, MovementSegment, PuckAction } from './types';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { fiveManCornerRetrievalDrill } from '@/fixtures/fiveManCornerRetrieval.v1';
import { fiveManCrossCornerDrill } from '@/fixtures/fiveManCrossCorner.v1';
import { fiveManLowHighDrill } from '@/fixtures/fiveManLowHigh.v1';
import type { Drill } from '@/core/types';

const FIXTURES: { name: string; drill: () => Drill }[] = [
  { name: 'give and go', drill: () => structuredClone(giveAndGoRegressionDrill) },
  { name: 'corner retrieval', drill: () => structuredClone(fiveManCornerRetrievalDrill) },
  { name: 'cross corner', drill: () => structuredClone(fiveManCrossCornerDrill) },
  { name: 'low to high', drill: () => structuredClone(fiveManLowHighDrill) },
];

// ----------------------------------------------------------------------------
// Round trip
// ----------------------------------------------------------------------------

describe('a v2 drill survives the round trip', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      const source = fixture.drill();
      const { drill, losses } = projectToV2(migrateV2ToV3(source));

      it('keeps every player on the ice', () => {
        // The coach is the exception, by design: it stops being a fake skater.
        const skatersAndGoalies = source.players.filter(player => player.id !== 'coach');
        expect(drill.players.map(player => player.id).sort()).toEqual(
          skatersAndGoalies.map(player => player.id).sort()
        );
      });

      it('keeps every route, with its shape', () => {
        const drawn = source.skatePaths.filter(path => (path.points?.length ?? 0) >= 2);
        expect(drill.skatePaths).toHaveLength(drawn.length);
        for (const path of drawn) {
          const projected = drill.skatePaths.find(item => item.ownerId === path.ownerId);
          expect(projected, `route for ${path.ownerId}`).toBeDefined();
          expect(projected!.points).toEqual(path.points);
        }
      });

      it('keeps the puck actions in order, with their timing', () => {
        expect(drill.events.map(event => event.id)).toEqual(source.events.map(event => event.id));
        for (const [index, event] of drill.events.entries()) {
          expect(event.at).toBeCloseTo(source.events[index].at ?? 0, 6);
          expect(event.arrivalAt).toBeCloseTo(source.events[index].arrivalAt ?? 0, 6);
        }
      });

      it('keeps its name, id and duration', () => {
        expect(drill.id).toBe(source.id);
        expect(drill.name).toBe(source.name);
        expect(drill.settings?.timeLimitSeconds).toBe(source.settings?.timeLimitSeconds ?? 8);
      });

      it('reports nothing lost, because a v2 drill has nothing v2 cannot hold', () => {
        expect(losses).toEqual([]);
      });
    });
  }
});

// ----------------------------------------------------------------------------
// The coach source
// ----------------------------------------------------------------------------

describe('a coach puck source', () => {
  const projected = projectToV2(migrateV2ToV3(structuredClone(fiveManCornerRetrievalDrill)));

  it('leaves the coach off the ice, as a marker rather than a skater', () => {
    expect(projected.drill.players.some(player => player.id === 'coach')).toBe(false);
    expect(projected.drill.coaches?.some(coach => coach.id === 'coach')).toBe(true);
  });

  it('keeps the coach action in the chain', () => {
    // The drill still starts with the coach putting the puck in the corner;
    // the coach simply is not pretending to be a forward while doing it.
    expect(projected.drill.events[0].fromPlayerId).toBe('coach');
  });
});

// ----------------------------------------------------------------------------
// What v2 cannot hold
// ----------------------------------------------------------------------------

function documentWith(patch: Partial<DrillDocumentV3>): DrillDocumentV3 {
  const base = migrateV2ToV3(structuredClone(giveAndGoRegressionDrill));
  return { ...base, ...patch };
}

const CONE: EquipmentItem = { id: 'c1', kind: 'cone', position: { x: 400, y: 200 } };

describe('losses are reported, not hidden', () => {
  it('reports equipment, which v2 has no representation for', () => {
    const { losses } = projectToV2(documentWith({ equipment: [CONE] }));
    const loss = losses.find(item => item.kind === 'equipment');

    expect(loss).toBeDefined();
    expect(loss!.count).toBe(1);
  });

  it('reports annotations', () => {
    const { losses } = projectToV2(
      documentWith({
        annotations: [{ id: 'a1', kind: 'text', position: { x: 0, y: 0 }, text: 'Go hard' }],
      })
    );
    expect(losses.some(loss => loss.kind === 'annotations')).toBe(true);
  });

  it('reports a repeated phase, because v2 plays it once', () => {
    const base = documentWith({});
    const document = {
      ...base,
      phases: [{ ...base.phases[0], repeatCount: 4 }],
    };
    expect(projectionLosses(document).some(loss => loss.kind === 'phases')).toBe(true);
  });

  it('reports simultaneous stations', () => {
    const base = documentWith({});
    const document = {
      ...base,
      phases: [{ ...base.phases[0], simultaneousGroup: 'stations' }],
    };
    expect(projectionLosses(document).some(loss => loss.kind === 'phases')).toBe(true);
  });

  it('reports a second puck, and simulates only the first', () => {
    const base = documentWith({});
    const document = {
      ...base,
      puckTracks: [
        ...base.puckTracks,
        { id: 'puck-2', initialSource: { kind: 'loose' as const, at: { x: 0, y: 0 } }, actions: [] },
      ],
    };
    const { drill, losses } = projectToV2(document);

    expect(losses.some(loss => loss.kind === 'extra-puck-tracks')).toBe(true);
    expect(drill.events.map(event => event.id)).toEqual(
      base.puckTracks[0].actions.map(action => action.id)
    );
  });

  it('says nothing was lost when nothing was', () => {
    expect(projectionLosses(documentWith({}))).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Multiple movement segments — the v2 limit v3 exists to remove
// ----------------------------------------------------------------------------

describe('a player with several movement segments', () => {
  function twoSegments(): DrillDocumentV3 {
    const base = documentWith({});
    const actorId = base.actors[0].id;
    const first: MovementSegment = {
      id: 'seg-1',
      phaseId: base.phases[0].id,
      startAtSeconds: 0,
      durationSeconds: 2,
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      curve: 'spline',
      movement: 'forward',
    };
    const second: MovementSegment = {
      ...first,
      id: 'seg-2',
      startAtSeconds: 4,
      points: [
        { x: 200, y: 100 },
        { x: 300, y: 220 },
      ],
      movement: 'backward',
    };
    return { ...base, actorTracks: [{ actorId, segments: [second, first] }] };
  }

  it('joins them into one v2 route, in time order', () => {
    const { drill } = projectToV2(twoSegments());
    const route = drill.skatePaths[0];

    // Sorted by start time even though the track listed them out of order.
    expect(route.points).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 300, y: 220 },
    ]);
  });

  it('does not repeat the seam where one segment ends and the next begins', () => {
    const { drill } = projectToV2(twoSegments());
    // A duplicated point would put a stall in the curve.
    expect(drill.skatePaths[0].points).toHaveLength(3);
  });

  it('reports that the pause between them is not timed', () => {
    const { losses } = projectToV2(twoSegments());
    expect(losses.some(loss => loss.kind === 'joined-segments')).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Pass detail — the v2 limits on what a pass can be
// ----------------------------------------------------------------------------

describe('passes v2 cannot fully describe', () => {
  function withAction(action: PuckAction): DrillDocumentV3 {
    const base = documentWith({});
    return {
      ...base,
      puckTracks: [{ ...base.puckTracks[0], actions: [action] }],
    };
  }

  const passBase = {
    id: 'p1',
    phaseId: 'phase-1',
    fromActorId: 'x',
    fromPoint: { x: 100, y: 100 },
    releaseAt: 1,
    arrivalAt: 2,
    waypoints: [],
    shape: 'spline' as const,
  };

  it('projects a pass to open space as a dump, and says so', () => {
    const document = withAction({
      ...passBase,
      type: 'pass',
      targetMode: 'space',
      target: { x: 500, y: 300 },
      passType: 'flat',
      receiveMode: 'control',
    });
    const { drill, losses } = projectToV2(document);

    // v2 has no pass without a receiver. A dump is the closest thing it has,
    // and the coach is told rather than left to discover it.
    expect(drill.events[0].type).toBe('dump');
    expect(losses.some(loss => loss.kind === 'pass-to-space')).toBe(true);
  });

  it('flattens a saucer pass, and says so', () => {
    const document = withAction({
      ...passBase,
      type: 'pass',
      toActorId: 'y',
      targetMode: 'actor',
      target: { x: 500, y: 300 },
      passType: 'saucer',
      receiveMode: 'one-touch',
    });
    const { drill, losses } = projectToV2(document);

    expect(drill.events[0].type).toBe('pass');
    expect(losses.some(loss => loss.kind === 'pass-detail')).toBe(true);
  });

  it('drops a turnover rather than projecting an illegal pass', () => {
    // v2 refuses a cross-team pass in the domain, so projecting a turnover as
    // one would produce a document that fails its own validation.
    const document = withAction({
      ...passBase,
      type: 'turnover',
      toActorId: 'y',
      target: { x: 500, y: 300 },
    });
    const { drill } = projectToV2(document);

    expect(drill.events).toHaveLength(0);
  });

  it('keeps a plain flat pass exactly as it was', () => {
    const document = withAction({
      ...passBase,
      type: 'pass',
      toActorId: 'y',
      targetMode: 'actor',
      target: { x: 500, y: 300 },
      passType: 'flat',
      receiveMode: 'control',
    });
    const { drill, losses } = projectToV2(document);

    expect(drill.events[0].type).toBe('pass');
    expect(losses.some(loss => loss.kind === 'pass-detail')).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Finish policy survives both directions
// ----------------------------------------------------------------------------

describe('the finish policy', () => {
  it('travels from the phase back onto the v2 settings', () => {
    const base = documentWith({});
    const document = {
      ...base,
      phases: [{ ...base.phases[0], finishPolicy: 'finish-with-shot' as const }],
    };
    expect(projectToV2(document).drill.settings?.finishPolicy).toBe('finish-with-shot');
  });

  it('defaults to no set finish', () => {
    expect(projectToV2(documentWith({})).drill.settings?.finishPolicy).toBe('none');
  });
});
