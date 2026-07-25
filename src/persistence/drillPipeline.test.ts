// ============================================================================
// DRILL PIPELINE - the total-function guarantees
//
// The headline defect these cover: `migrateDrill()` used to call
// `.map`/`.forEach` on unverified values, so a stored drill with `events: null`
// crashed validation before repair could ever run.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  CURRENT_DRILL_SCHEMA_VERSION,
  migrateDrillCandidate,
  normalizeDrillCandidate,
  parseDrillCandidate,
  remapImportedDrill,
  repairDrillDocument,
  validateDrillDocument,
} from './drillPipeline';
import { parseStorableDrill } from './schema';
import { buildDrill, buildDistinctiveRoute, buildPass, buildPlayer, sequentialIds, FIXED_NOW } from '@/test/builders';

describe('parseDrillCandidate', () => {
  it('accepts a plain object', () => {
    const result = parseDrillCandidate({ name: 'x' });
    expect(result.ok).toBe(true);
  });

  it.each([[null], [undefined], [42], ['drill'], [[]], [true]])('rejects %s without throwing', value => {
    const result = parseDrillCandidate(value);
    expect(result.ok).toBe(false);
  });
});

describe('normalizeDrillCandidate', () => {
  it('defaults every required array when they are missing', () => {
    const { drill } = normalizeDrillCandidate({}, { now: FIXED_NOW });
    expect(drill.players).toEqual([]);
    expect(drill.skatePaths).toEqual([]);
    expect(drill.events).toEqual([]);
    expect(drill.coaches).toEqual([]);
    expect(drill.settings).toBeDefined();
    expect(drill.schemaVersion).toBe(CURRENT_DRILL_SCHEMA_VERSION);
  });

  it('replaces null arrays and reports it', () => {
    const { drill, warnings } = normalizeDrillCandidate(
      { players: null, events: null, skatePaths: null },
      { now: FIXED_NOW }
    );
    expect(drill.events).toEqual([]);
    // `null` is the legacy shape that used to crash; it is defaulted silently
    // because there is nothing to report losing.
    expect(warnings).toEqual([]);
  });

  it('reports non-array collections that held data', () => {
    const { drill, warnings } = normalizeDrillCandidate(
      { players: { '0': {} }, events: 'nope' },
      { now: FIXED_NOW }
    );
    expect(drill.players).toEqual([]);
    expect(warnings).toContain('players was not an array and was replaced with an empty list.');
    expect(warnings).toContain('events was not an array and was replaced with an empty list.');
  });

  it('drops players with non-finite coordinates', () => {
    const { drill, warnings } = normalizeDrillCandidate(
      {
        players: [
          { id: 'a', x: 1, y: 2, team: 'home', number: '9', role: 'C', hasPuck: true },
          { id: 'b', x: Number.NaN, y: 2, team: 'home', number: '8', role: 'C', hasPuck: false },
          { id: 'c', x: 1, y: Number.POSITIVE_INFINITY, team: 'home', number: '7', role: 'C', hasPuck: false },
        ],
      },
      { now: FIXED_NOW }
    );
    expect(drill.players.map(player => player.id)).toEqual(['a']);
    expect(warnings.filter(w => w.includes('non-finite'))).toHaveLength(2);
  });

  it('drops events with an unsupported type', () => {
    const { drill, warnings } = normalizeDrillCandidate(
      {
        events: [
          { id: 'e1', type: 'faceoff', fromPlayerId: 'a', fromPoint: { x: 0, y: 0 }, toPoint: { x: 1, y: 1 } },
        ],
      },
      { now: FIXED_NOW }
    );
    expect(drill.events).toEqual([]);
    expect(warnings[0]).toContain('unsupported type');
  });

  it('drops malformed array entries individually rather than the whole array', () => {
    const { drill } = normalizeDrillCandidate(
      {
        players: [
          null,
          'nope',
          { id: 'keep', x: 5, y: 6, team: 'away', number: '3', role: 'D', hasPuck: true },
        ],
      },
      { now: FIXED_NOW }
    );
    expect(drill.players).toHaveLength(1);
    expect(drill.players[0].id).toBe('keep');
  });

  it('rejects a route with more points than the limit', () => {
    const points = Array.from({ length: 5001 }, (_, index) => ({ x: index, y: index }));
    const { drill, warnings } = normalizeDrillCandidate(
      { skatePaths: [{ id: 'r', ownerId: 'a', team: 'home', points }] },
      { now: FIXED_NOW }
    );
    expect(drill.skatePaths).toEqual([]);
    expect(warnings[0]).toContain('above the 5000 limit');
  });

  it('preserves unknown route fields written by a newer build', () => {
    const { drill } = normalizeDrillCandidate(
      {
        skatePaths: [
          {
            id: 'r',
            ownerId: 'a',
            team: 'home',
            points: [{ x: 0, y: 0 }],
            mode: 'backward',
            finish: 'coast',
            crossoverStyle: 'tight',
          },
        ],
      },
      { now: FIXED_NOW }
    );
    expect(drill.skatePaths[0]).toMatchObject({ mode: 'backward', finish: 'coast', crossoverStyle: 'tight' });
  });
});

describe('migrateDrillCandidate', () => {
  it('never throws on a non-object and still returns a usable drill', () => {
    for (const value of [null, undefined, 7, 'x', [], true]) {
      const { drill, warnings } = migrateDrillCandidate(value, { now: FIXED_NOW });
      expect(drill.players).toEqual([]);
      expect(warnings.length).toBeGreaterThan(0);
    }
  });

  it('flags a document from a newer schema version', () => {
    const { warnings } = migrateDrillCandidate({ schemaVersion: 99 }, { now: FIXED_NOW });
    expect(warnings[0]).toContain('newer than this app');
  });

  it('applies v1 defaults: visual profiles, route mode/finish, coaches, settings', () => {
    const { drill } = migrateDrillCandidate(
      {
        id: 'legacy',
        name: 'Legacy',
        players: [{ id: 'p1', x: 1, y: 2, team: 'home', number: '11', role: 'G', hasPuck: true }],
        skatePaths: [{ id: 'r1', ownerId: 'p1', team: 'home', points: [{ x: 0, y: 0 }] }],
      },
      { now: FIXED_NOW }
    );
    expect(drill.players[0].visual).toEqual({ handedness: 'right', visor: false });
    expect(drill.skatePaths[0].mode).toBe('skate');
    expect(drill.skatePaths[0].finish).toBe('stop');
    expect(drill.coaches).toEqual([]);
    expect(drill.settings?.assistance).toBe('standard');
  });
});

describe('validateDrillDocument', () => {
  it('does not throw when handed a non-drill', () => {
    expect(validateDrillDocument(null).valid).toBe(false);
    expect(validateDrillDocument(42).errors[0]).toBe('Drill is not an object');
  });

  it('does not throw when events is null', () => {
    const result = validateDrillDocument({ ...buildDrill(), events: null });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Drill missing events array');
  });

  it('reports a pass to a missing player', () => {
    const drill = buildDrill({
      events: [buildPass({ id: 'e1', fromPlayerId: 'p1', toPlayerId: 'ghost' })],
    });
    expect(validateDrillDocument(drill).errors).toContain(
      'Event 0: toPlayerId references non-existent player'
    );
  });

  it('reports a route owned by a missing player', () => {
    const drill = buildDrill({ skatePaths: [buildDistinctiveRoute('ghost')] });
    expect(validateDrillDocument(drill).errors).toContain(
      'SkatePath 0: ownerId references non-existent player'
    );
  });

  it('reports duplicate child IDs', () => {
    const drill = buildDrill({
      players: [
        buildPlayer({ id: 'dup', hasPuck: true }),
        buildPlayer({ id: 'dup', number: '13' }),
      ],
    });
    expect(validateDrillDocument(drill).errors).toContain('Duplicate player IDs');
  });

  it('accepts an empty board with no players and therefore no carrier', () => {
    expect(validateDrillDocument(buildDrill({ players: [] })).valid).toBe(true);
  });

  it('reports both zero and multiple puck carriers once players exist', () => {
    const none = buildDrill({ players: [buildPlayer({ id: 'a' })] });
    expect(validateDrillDocument(none).errors).toContain('No initial puck carrier');

    const many = buildDrill({
      players: [buildPlayer({ id: 'a', hasPuck: true }), buildPlayer({ id: 'b', hasPuck: true })],
    });
    expect(validateDrillDocument(many).errors).toContain('Multiple initial puck carriers');
  });
});

describe('repairDrillDocument', () => {
  it('makes exactly one puck carrier', () => {
    const ids = sequentialIds('fresh');
    const repaired = repairDrillDocument(
      buildDrill({
        players: [buildPlayer({ id: 'a', hasPuck: true }), buildPlayer({ id: 'b', hasPuck: true })],
      }),
      ids
    );
    expect(repaired.players.filter(player => player.hasPuck)).toHaveLength(1);
  });

  it('drops dangling routes and events', () => {
    const repaired = repairDrillDocument(
      buildDrill({
        skatePaths: [buildDistinctiveRoute('ghost')],
        events: [buildPass({ id: 'e1', fromPlayerId: 'p1', toPlayerId: 'ghost' })],
      }),
      sequentialIds('fresh')
    );
    expect(repaired.skatePaths).toEqual([]);
    expect(repaired.events).toEqual([]);
    expect(validateDrillDocument(repaired).valid).toBe(true);
  });

  it('reissues duplicate child IDs instead of dropping the content', () => {
    const drill = buildDrill({
      events: [
        buildPass({ id: 'same', fromPlayerId: 'p1', toPlayerId: 'p2' }),
        buildPass({ id: 'same', fromPlayerId: 'p2', toPlayerId: 'p1' }),
      ],
    });
    const repaired = repairDrillDocument(drill, sequentialIds('fresh'));
    expect(repaired.events).toHaveLength(2);
    expect(new Set(repaired.events.map(event => event.id)).size).toBe(2);
  });

  it('deduplicates players by ID', () => {
    const repaired = repairDrillDocument(
      buildDrill({
        players: [buildPlayer({ id: 'dup', hasPuck: true }), buildPlayer({ id: 'dup', number: '13' })],
      }),
      sequentialIds('fresh')
    );
    expect(repaired.players).toHaveLength(1);
  });
});

describe('remapImportedDrill', () => {
  it('gives fresh IDs to the drill and every child, rewriting all references', () => {
    const drill = buildDrill({
      players: [
        buildPlayer({ id: 'p1', hasPuck: true }),
        buildPlayer({ id: 'p2', number: '13' }),
      ],
      skatePaths: [buildDistinctiveRoute('p1')],
      events: [buildPass({ id: 'e1', fromPlayerId: 'p1', toPlayerId: 'p2' })],
      coaches: [{ id: 'c1', x: 10, y: 10, name: 'Coach' }],
    });

    const remapped = remapImportedDrill(drill, sequentialIds('new'), FIXED_NOW);

    expect(remapped.id).not.toBe(drill.id);
    expect(remapped.players.map(p => p.id)).not.toEqual(['p1', 'p2']);
    expect(remapped.coaches?.[0].id).not.toBe('c1');
    expect(remapped.skatePaths[0].id).not.toBe('route-distinct');
    expect(remapped.skatePaths[0].ownerId).toBe(remapped.players[0].id);

    const pass = remapped.events[0];
    expect(pass.fromPlayerId).toBe(remapped.players[0].id);
    expect(pass.type === 'pass' && pass.toPlayerId).toBe(remapped.players[1].id);
    expect(validateDrillDocument(remapped).valid).toBe(true);
  });

  it('preserves every semantic route field through the remap', () => {
    const drill = buildDrill({ skatePaths: [buildDistinctiveRoute('p1')] });
    const remapped = remapImportedDrill(drill, sequentialIds('new'), FIXED_NOW);
    const before = drill.skatePaths[0];
    const after = remapped.skatePaths[0];

    expect(after.team).toBe(before.team);
    expect(after.mode).toBe(before.mode);
    expect(after.finish).toBe(before.finish);
    expect(after.points).toEqual(before.points);
    expect(after.points).not.toBe(before.points);
  });

  it('does not share settings by reference with the source drill', () => {
    const drill = buildDrill();
    const remapped = remapImportedDrill(drill, sequentialIds('new'), FIXED_NOW);
    expect(remapped.settings).not.toBe(drill.settings);
    remapped.settings!.reducedEffects = true;
    expect(drill.settings!.reducedEffects).toBe(false);
  });

  it('stamps fresh timestamps', () => {
    const drill = buildDrill({ createdAt: 1, updatedAt: 2 });
    const remapped = remapImportedDrill(drill, sequentialIds('new'), FIXED_NOW);
    expect(remapped.createdAt).toBe(FIXED_NOW);
    expect(remapped.updatedAt).toBe(FIXED_NOW);
  });
});

// ----------------------------------------------------------------------------
// Property tests: the pipeline is total for any JSON-compatible value.
// ----------------------------------------------------------------------------

describe('pipeline totality (property)', () => {
  const jsonValue = fc.jsonValue();

  it('parse -> migrate -> validate -> repair never throws for arbitrary JSON', () => {
    fc.assert(
      fc.property(jsonValue, value => {
        const { drill } = migrateDrillCandidate(value, { now: FIXED_NOW });
        validateDrillDocument(drill);
        repairDrillDocument(drill, sequentialIds('fresh'));
        return true;
      }),
      { numRuns: 400 }
    );
  });

  it('a repaired drill with an ID always passes domain validation and the storage schema', () => {
    fc.assert(
      fc.property(jsonValue, value => {
        const { drill } = migrateDrillCandidate(value, {
          now: FIXED_NOW,
          fallbackId: 'fallback-id',
          fallbackName: 'Fallback',
        });
        const withId = { ...drill, id: drill.id || 'fallback-id' };
        const repaired = repairDrillDocument(withId, sequentialIds('fresh'));
        expect(validateDrillDocument(repaired).valid).toBe(true);
        expect(parseStorableDrill(repaired).ok).toBe(true);
        return true;
      }),
      { numRuns: 400 }
    );
  });

  it('remapping any repaired drill keeps it valid', () => {
    fc.assert(
      fc.property(jsonValue, value => {
        const { drill } = migrateDrillCandidate(value, { now: FIXED_NOW, fallbackId: 'fallback-id' });
        const repaired = repairDrillDocument({ ...drill, id: drill.id || 'fallback-id' }, sequentialIds('a'));
        const remapped = remapImportedDrill(repaired, sequentialIds('b'), FIXED_NOW);
        expect(validateDrillDocument(remapped).valid).toBe(true);
        return true;
      }),
      { numRuns: 300 }
    );
  });
});
