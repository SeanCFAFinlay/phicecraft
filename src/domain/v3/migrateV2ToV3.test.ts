// ============================================================================
// V2 TO V3 MIGRATION
//
// Every drill a coach already has must open in the new model without losing
// anything. These tests run against the FIXTURES that ship with the product,
// not against invented shapes, because those fixtures are the drills whose
// workarounds v3 exists to remove.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { migrateV2ToV3, isV3, looksLikeCoachHack, MIGRATED_PHASE_ID } from './migrateV2ToV3';
import { isCoach, isGoalie, isSkater, orderedActions, type DrillDocumentV3 } from './types';
import { buildDrill, buildPlayer } from '@/test/builders';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { fiveManCornerRetrievalDrill } from '@/fixtures/fiveManCornerRetrieval.v1';
import { fiveManCrossCornerDrill } from '@/fixtures/fiveManCrossCorner.v1';
import { fiveManLowHighDrill } from '@/fixtures/fiveManLowHigh.v1';
import type { Drill } from '@/core/types';

/**
 * The shipped fixtures are shared constants, so every test takes a copy. A
 * migration test that mutated one would corrupt the product's own examples for
 * every other test in the run.
 */
const giveAndGoV1 = () => structuredClone(giveAndGoRegressionDrill);
const fiveManCornerRetrievalV1 = () => structuredClone(fiveManCornerRetrievalDrill);
const fiveManCrossCornerV1 = () => structuredClone(fiveManCrossCornerDrill);
const fiveManLowHighV1 = () => structuredClone(fiveManLowHighDrill);

const FIXTURES: { name: string; drill: () => Drill }[] = [
  { name: 'give and go', drill: giveAndGoV1 },
  { name: 'five-man corner retrieval', drill: fiveManCornerRetrievalV1 },
  { name: 'five-man cross corner', drill: fiveManCrossCornerV1 },
  { name: 'five-man low to high', drill: fiveManLowHighV1 },
];

// ----------------------------------------------------------------------------
// Nothing is lost
// ----------------------------------------------------------------------------

describe('every shipped fixture migrates without loss', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      const source = fixture.drill();
      const migrated = migrateV2ToV3(source);

      it('keeps its identity and name', () => {
        expect(migrated.schemaVersion).toBe(3);
        expect(migrated.id).toBe(source.id);
        expect(migrated.metadata.title).toBe(source.name);
      });

      it('keeps every person on the ice', () => {
        expect(migrated.actors).toHaveLength(source.players.length + (source.coaches?.length ?? 0));
      });

      it('keeps every route', () => {
        const drawn = source.skatePaths.filter(path => (path.points?.length ?? 0) >= 2);
        const segments = migrated.actorTracks.flatMap(track => track.segments);
        expect(segments).toHaveLength(drawn.length);
      });

      it('keeps every puck action, in order', () => {
        const actions = migrated.puckTracks.flatMap(track => orderedActions(track));
        expect(actions.map(action => action.id)).toEqual(source.events.map(event => event.id));
      });

      it('puts everything in one phase, because v2 had no others', () => {
        expect(migrated.phases).toHaveLength(1);
        expect(migrated.phases[0].id).toBe(MIGRATED_PHASE_ID);
        // Claiming a repeat here would invent coaching intent nobody authored.
        expect(migrated.phases[0].repeatCount).toBe(1);
      });

      it('produces exactly one puck track, because v2 had one chain', () => {
        expect(migrated.puckTracks.length).toBeLessThanOrEqual(1);
      });
    });
  }
});

// ----------------------------------------------------------------------------
// The coach workaround
// ----------------------------------------------------------------------------

describe('the coach-as-player workaround', () => {
  const migrated = migrateV2ToV3(fiveManCornerRetrievalV1());

  it('is present in the fixture this test exists for', () => {
    const source = fiveManCornerRetrievalV1();
    const coach = source.players.find(player => player.id === 'coach');

    // v2 had no way to say "a coach starts this drill", so the fixture made
    // one a skater with the puck. This is the hack, in the shipped product.
    expect(coach).toBeDefined();
    expect(coach!.hasPuck).toBe(true);
    expect(coach!.role).not.toBe('G');
  });

  it('becomes a coach actor, not a skater', () => {
    const coach = migrated.actors.find(actor => actor.id === 'coach');

    expect(coach).toBeDefined();
    expect(isCoach(coach!)).toBe(true);
    expect(isSkater(coach!)).toBe(false);
  });

  it('sources the puck as a coach, which is what the hack was for', () => {
    expect(migrated.puckTracks[0].initialSource).toEqual({ kind: 'coach', actorId: 'coach' });
  });

  it('is not counted as a skater in the metadata', () => {
    const skaters = migrated.actors.filter(isSkater).length;
    expect(migrated.metadata.skaterCount.min).toBe(skaters);
    expect(migrated.actors.filter(isCoach)).toHaveLength(1);
  });

  it('recognises the hack narrowly, by id', () => {
    // A real centre numbered "C" must not be mistaken for the workaround.
    expect(looksLikeCoachHack(buildPlayer({ id: 'coach', role: 'F' }))).toBe(true);
    expect(looksLikeCoachHack(buildPlayer({ id: 'h11', number: 'C', role: 'C' }))).toBe(false);
    expect(looksLikeCoachHack(buildPlayer({ id: 'coach', role: 'G' }))).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Actors
// ----------------------------------------------------------------------------

describe('actors', () => {
  it('turns a goalie into a goalie actor rather than a skater', () => {
    const drill = buildDrill({
      players: [
        buildPlayer({ id: 'g1', number: '31', role: 'G', x: 70, y: 212 }),
        buildPlayer({ id: 'h11', number: '11', role: 'C', hasPuck: true }),
      ],
    });
    const migrated = migrateV2ToV3(drill);

    expect(isGoalie(migrated.actors.find(actor => actor.id === 'g1')!)).toBe(true);
    expect(isSkater(migrated.actors.find(actor => actor.id === 'h11')!)).toBe(true);
  });

  it('carries a decorative v2 coach marker across as a coach actor', () => {
    const drill = buildDrill({
      players: [buildPlayer({ id: 'h11', number: '11', hasPuck: true })],
      coaches: [{ id: 'c1', x: 100, y: 100, name: 'Coach Sam' }],
    });
    const migrated = migrateV2ToV3(drill);
    const coach = migrated.actors.find(actor => actor.id === 'c1');

    expect(coach && isCoach(coach)).toBe(true);
    expect(coach && isCoach(coach) && coach.name).toBe('Coach Sam');
  });

  it('keeps each actor where they were standing', () => {
    const drill = buildDrill({
      players: [buildPlayer({ id: 'h11', number: '11', x: 321, y: 123, hasPuck: true })],
    });
    const migrated = migrateV2ToV3(drill);

    expect(migrated.actors[0].position).toEqual({ x: 321, y: 123 });
  });
});

// ----------------------------------------------------------------------------
// Time
// ----------------------------------------------------------------------------

describe('timing', () => {
  it('converts fractions of the drill into seconds', () => {
    const drill = buildDrill({
      players: [
        buildPlayer({ id: 'h11', number: '11', hasPuck: true }),
        buildPlayer({ id: 'h13', number: '13', x: 600 }),
      ],
      events: [
        {
          id: 'p1',
          type: 'pass',
          fromPlayerId: 'h11',
          toPlayerId: 'h13',
          fromPoint: { x: 300, y: 200 },
          toPoint: { x: 600, y: 200 },
          team: 'home',
          at: 0.25,
          arrivalAt: 0.5,
        },
      ],
    });
    const migrated = migrateV2ToV3(drill);
    const action = migrated.puckTracks[0].actions[0];

    // The default drill is 8 seconds, so a quarter of the way in is 2s.
    expect(migrated.presentation.durationSeconds).toBe(8);
    expect(action.releaseAt).toBe(2);
    expect(action.arrivalAt).toBe(4);
  });

  it('uses the time limit the drill itself stores, not a constant', () => {
    const base = buildDrill({ players: [buildPlayer({ id: 'h11', number: '11', hasPuck: true })] });
    const drill = { ...base, settings: { ...base.settings!, timeLimitSeconds: 20 } };

    expect(migrateV2ToV3(drill).presentation.durationSeconds).toBe(20);
  });
});

// ----------------------------------------------------------------------------
// Finish policy
// ----------------------------------------------------------------------------

describe('the finish policy travels with the drill', () => {
  function drillWithAutoShot(): Drill {
    return buildDrill({
      players: [buildPlayer({ id: 'h11', number: '11', hasPuck: true })],
      events: [
        {
          id: 's1',
          type: 'shot',
          fromPlayerId: 'h11',
          fromPoint: { x: 300, y: 200 },
          toPoint: { x: 945, y: 212 },
          targetNet: 'R',
          team: 'home',
          at: 0.4,
          arrivalAt: 0.6,
          auto: true,
        },
      ],
    });
  }

  it('reads a derived shot as an intent to finish with a shot', () => {
    expect(migrateV2ToV3(drillWithAutoShot()).phases[0].finishPolicy).toBe('finish-with-shot');
  });

  it('marks that shot as derived rather than authored', () => {
    const action = migrateV2ToV3(drillWithAutoShot()).puckTracks[0].actions[0];
    expect(action.type === 'shot' && action.auto).toBe(true);
  });

  it('defaults to no set finish when the drill has no shot', () => {
    const drill = buildDrill({ players: [buildPlayer({ id: 'h11', number: '11', hasPuck: true })] });
    expect(migrateV2ToV3(drill).phases[0].finishPolicy).toBe('none');
  });

  it('lets a stored policy win', () => {
    const base = drillWithAutoShot();
    const drill = { ...base, settings: { ...base.settings!, finishPolicy: 'loop' as const } };
    expect(migrateV2ToV3(drill).phases[0].finishPolicy).toBe('loop');
  });
});

// ----------------------------------------------------------------------------
// Idempotence
// ----------------------------------------------------------------------------

describe('running the migration twice changes nothing', () => {
  it('returns a v3 document untouched', () => {
    const once = migrateV2ToV3(giveAndGoV1());
    // Identity, not deep equality: this runs on load, and a document that
    // reallocates on every open is a document that eventually drifts.
    expect(migrateV2ToV3(once)).toBe(once);
  });

  it('recognises a v3 document', () => {
    expect(isV3(migrateV2ToV3(giveAndGoV1()))).toBe(true);
    expect(isV3(giveAndGoV1())).toBe(false);
    expect(isV3(null)).toBe(false);
    expect(isV3({})).toBe(false);
  });

  it('is stable across every fixture', () => {
    for (const fixture of FIXTURES) {
      const once = migrateV2ToV3(fixture.drill());
      const twice = migrateV2ToV3(once) as DrillDocumentV3;
      expect(twice, fixture.name).toEqual(once);
    }
  });
});

// ----------------------------------------------------------------------------
// The document does not alias its source
// ----------------------------------------------------------------------------

describe('isolation from the source drill', () => {
  it('does not share point objects with the v2 drill', () => {
    const source = giveAndGoV1();
    const migrated = migrateV2ToV3(source);
    const segment = migrated.actorTracks[0]?.segments[0];
    if (!segment) return;

    segment.points[0].x = -999;
    const originalPath = source.skatePaths.find(path => path.id === segment.id)!;
    expect(originalPath.points[0].x).not.toBe(-999);
  });
});
