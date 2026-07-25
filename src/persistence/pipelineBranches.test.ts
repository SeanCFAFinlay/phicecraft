// ============================================================================
// DRILL PIPELINE - field-by-field normalization
//
// Each of these is a legacy or hostile shape the editor has to survive. They
// are separated from drillPipeline.test.ts so the headline behaviours there
// stay readable.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { migrateDrillCandidate, normalizeDrillCandidate, remapImportedDrill } from './drillPipeline';
import { parseStorableDrill } from './schema';
import { buildDrill, sequentialIds, FIXED_NOW } from '@/test/builders';

const now = { now: FIXED_NOW };

function normalize(candidate: Record<string, unknown>) {
  return normalizeDrillCandidate(candidate, now);
}

describe('player normalization', () => {
  const base = { id: 'p', x: 1, y: 2, team: 'home', role: 'C', hasPuck: true };

  it('numbers a player positionally when the number is missing or blank', () => {
    const { drill } = normalize({ players: [{ ...base, number: '   ' }, { ...base, id: 'q' }] });
    expect(drill.players.map(player => player.number)).toEqual(['1', '2']);
  });

  it('truncates an absurdly long jersey number to the stored width', () => {
    const { drill } = normalize({ players: [{ ...base, number: '1234567890123' }] });
    expect(drill.players[0].number).toHaveLength(8);
  });

  it('falls back to a generic forward for an unknown role', () => {
    const { drill } = normalize({ players: [{ ...base, role: 'Enforcer' }] });
    expect(drill.players[0].role).toBe('F');
  });

  it('defaults an unknown team to home', () => {
    const { drill } = normalize({ players: [{ ...base, team: 'visitors' }] });
    expect(drill.players[0].team).toBe('home');
  });

  it('keeps an explicit left-handed profile and a jersey trim', () => {
    const { drill } = normalize({
      players: [{ ...base, number: '9', visual: { handedness: 'left', visor: false, jerseyTrim: '#fff' } }],
    });
    expect(drill.players[0].visual).toEqual({ handedness: 'left', visor: false, jerseyTrim: '#fff' });
  });

  it('gives a goalie no visor by default and a skater one', () => {
    const { drill } = normalize({
      players: [
        { ...base, number: '31', role: 'G' },
        { ...base, id: 'q', number: '11', role: 'C' },
      ],
    });
    expect(drill.players[0].visual?.visor).toBe(false);
    expect(drill.players[1].visual?.visor).toBe(true);
  });

  it('drops a player with no id', () => {
    const { drill, warnings } = normalize({ players: [{ x: 1, y: 2 }] });
    expect(drill.players).toEqual([]);
    expect(warnings[0]).toContain('no id');
  });

  it('keeps only the first N players and says so', () => {
    const players = Array.from({ length: 205 }, (_, index) => ({ ...base, id: `p${index}`, number: '5' }));
    const { drill, warnings } = normalize({ players });
    expect(drill.players).toHaveLength(200);
    expect(warnings.some(w => w.includes('first 200 players'))).toBe(true);
  });
});

describe('route normalization', () => {
  it('drops a route with no id or no owner', () => {
    const { drill, warnings } = normalize({
      skatePaths: [{ ownerId: 'p', points: [{ x: 0, y: 0 }] }, { id: 'r', points: [{ x: 0, y: 0 }] }],
    });
    expect(drill.skatePaths).toEqual([]);
    expect(warnings.filter(w => w.includes('missing an id or owner'))).toHaveLength(2);
  });

  it('drops a route left with no usable points', () => {
    const { drill, warnings } = normalize({
      skatePaths: [{ id: 'r', ownerId: 'p', points: [{ x: 'a', y: 1 }, null] }],
    });
    expect(drill.skatePaths).toEqual([]);
    expect(warnings.some(w => w.includes('no usable points'))).toBe(true);
  });

  it('keeps a route that lost only some of its points, and reports the loss', () => {
    const { drill, warnings } = normalize({
      skatePaths: [{ id: 'r', ownerId: 'p', points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }] }],
    });
    expect(drill.skatePaths[0].points).toHaveLength(1);
    expect(warnings.some(w => w.includes('1 invalid point'))).toBe(true);
  });

  it.each([
    ['glide', 'glide'],
    ['backward', 'backward'],
    ['sprint', 'skate'],
    [undefined, 'skate'],
  ])('maps route mode %s to %s', (input, expected) => {
    const { drill } = normalize({
      skatePaths: [{ id: 'r', ownerId: 'p', points: [{ x: 0, y: 0 }], mode: input }],
    });
    expect(drill.skatePaths[0].mode).toBe(expected);
  });

  it('keeps only the first N routes', () => {
    const skatePaths = Array.from({ length: 505 }, (_, index) => ({
      id: `r${index}`,
      ownerId: 'p',
      points: [{ x: 0, y: 0 }],
    }));
    const { drill, warnings } = normalize({ skatePaths });
    expect(drill.skatePaths).toHaveLength(500);
    expect(warnings.some(w => w.includes('first 500 routes'))).toBe(true);
  });
});

describe('event normalization', () => {
  const base = {
    id: 'e',
    fromPlayerId: 'p',
    fromPoint: { x: 0, y: 0 },
    toPoint: { x: 10, y: 10 },
    team: 'home',
  };

  it('keeps finite timing', () => {
    const { drill } = normalize({ events: [{ ...base, type: 'pickup', at: 0.3, arrivalAt: 0.4 }] });
    expect(drill.events[0]).toMatchObject({ at: 0.3, arrivalAt: 0.4 });
  });

  it('migrates the v1 single `via` bend into a waypoint list', () => {
    const { drill } = normalize({ events: [{ ...base, type: 'pickup', via: { x: 5, y: 5 } }] });
    expect(drill.events[0].waypoints).toEqual([{ x: 5, y: 5 }]);
    expect(drill.events[0]).not.toHaveProperty('via');
  });

  it('keeps an explicit waypoint list, ignoring any legacy `via` alongside it', () => {
    const { drill } = normalize({
      events: [
        {
          ...base,
          type: 'pickup',
          via: { x: 1, y: 1 },
          waypoints: [
            { x: 5, y: 5 },
            { x: 7, y: 7 },
          ],
        },
      ],
    });
    expect(drill.events[0].waypoints).toEqual([
      { x: 5, y: 5 },
      { x: 7, y: 7 },
    ]);
  });

  it('drops waypoints with non-finite coordinates and reports it', () => {
    const { drill, warnings } = normalize({
      events: [{ ...base, type: 'pickup', waypoints: [{ x: 5, y: 5 }, { x: Number.NaN, y: 2 }, null] }],
    });
    expect(drill.events[0].waypoints).toEqual([{ x: 5, y: 5 }]);
    expect(warnings.some(warning => warning.includes('invalid waypoint'))).toBe(true);
  });

  it('defaults a line to a spline, and keeps an explicit polyline', () => {
    expect(normalize({ events: [{ ...base, type: 'pickup' }] }).drill.events[0].shape).toBe('spline');
    expect(
      normalize({ events: [{ ...base, type: 'pickup', shape: 'polyline' }] }).drill.events[0].shape
    ).toBe('polyline');
  });

  it('drops non-finite timing rather than storing NaN', () => {
    const { drill } = normalize({
      events: [{ ...base, type: 'pickup', at: Number.NaN, arrivalAt: Number.POSITIVE_INFINITY }],
    });
    expect(drill.events[0].at).toBeUndefined();
    expect(drill.events[0].arrivalAt).toBeUndefined();
  });

  it('keeps a pass outcome override and quality', () => {
    const { drill } = normalize({
      events: [{ ...base, type: 'pass', toPlayerId: 'q', catchResult: 'missed', catchQuality: 'unreachable' }],
    });
    expect(drill.events[0]).toMatchObject({ catchResult: 'missed', catchQuality: 'unreachable' });
  });

  it('drops a pass with no receiver', () => {
    const { drill, warnings } = normalize({ events: [{ ...base, type: 'pass' }] });
    expect(drill.events).toEqual([]);
    expect(warnings.some(w => w.includes('no receiver'))).toBe(true);
  });

  it.each([
    ['L', 'L'],
    ['R', 'R'],
    ['middle', 'R'],
  ])('normalizes shot targetNet %s to %s', (input, expected) => {
    const { drill } = normalize({ events: [{ ...base, type: 'shot', targetNet: input }] });
    expect(drill.events[0]).toMatchObject({ targetNet: expected });
  });

  it('keeps a valid shot result and drops an invalid one', () => {
    const { drill } = normalize({
      events: [
        { ...base, type: 'shot', targetNet: 'R', result: 'post' },
        { ...base, id: 'e2', type: 'shot', targetNet: 'R', result: 'deflected' },
      ],
    });
    expect(drill.events[0]).toMatchObject({ result: 'post' });
    expect(drill.events[1]).not.toHaveProperty('result');
  });

  it('forces a dump target marker', () => {
    const { drill } = normalize({ events: [{ ...base, type: 'dump', targetNet: 'L' }] });
    expect(drill.events[0]).toMatchObject({ type: 'dump', targetNet: 'dump' });
  });

  it('drops an event with no id or source player', () => {
    const { drill } = normalize({
      events: [{ ...base, id: undefined, type: 'pickup' }, { ...base, fromPlayerId: '', type: 'pickup' }],
    });
    expect(drill.events).toEqual([]);
  });

  it('keeps only the first N events', () => {
    const events = Array.from({ length: 1005 }, (_, index) => ({ ...base, id: `e${index}`, type: 'pickup' }));
    const { drill, warnings } = normalize({ events });
    expect(drill.events).toHaveLength(1000);
    expect(warnings.some(w => w.includes('first 1000 events'))).toBe(true);
  });
});

describe('coach and settings normalization', () => {
  it('names an unnamed coach', () => {
    const { drill } = normalize({ coaches: [{ id: 'c', x: 1, y: 2 }] });
    expect(drill.coaches?.[0].name).toBe('Coach');
  });

  it('drops a coach with no id or bad coordinates', () => {
    const { drill } = normalize({ coaches: [{ x: 1, y: 2 }, { id: 'c', x: Number.NaN, y: 2 }] });
    expect(drill.coaches).toEqual([]);
  });

  it.each([
    ['off', 'off'],
    ['high', 'high'],
    ['maximum', 'standard'],
  ])('maps assistance %s to %s', (input, expected) => {
    const { drill } = normalize({ settings: { assistance: input } });
    expect(drill.settings?.assistance).toBe(expected);
  });

  it('keeps an authored recovery preference', () => {
    const { drill } = normalize({ settings: { recovery: 'authored' } });
    expect(drill.settings?.recovery).toBe('authored');
  });

  it('clamps the time limit into a sane range', () => {
    expect(normalize({ settings: { timeLimitSeconds: 0 } }).drill.settings?.timeLimitSeconds).toBe(2);
    expect(normalize({ settings: { timeLimitSeconds: 9999 } }).drill.settings?.timeLimitSeconds).toBe(600);
    expect(normalize({ settings: { timeLimitSeconds: 'x' } }).drill.settings?.timeLimitSeconds).toBe(8);
  });

  it('keeps jerseys when present and omits the key when absent', () => {
    expect(normalize({ settings: { jerseys: { home: '#111', away: '#222' } } }).drill.settings?.jerseys).toEqual({
      home: '#111',
      away: '#222',
    });
    expect(normalize({ settings: {} }).drill.settings?.jerseys).toBeUndefined();
  });

  it('falls back to the default jersey colours when one side is blank', () => {
    const { drill } = normalize({ settings: { jerseys: { home: '', away: '#222' } } });
    expect(drill.settings?.jerseys?.home).toBe('#e63946');
  });
});

describe('drill-level normalization', () => {
  it('uses createdAt for updatedAt when only createdAt is present', () => {
    const { drill } = normalize({ createdAt: 12345 });
    expect(drill.updatedAt).toBe(12345);
  });

  it('uses the injected clock when neither timestamp is present', () => {
    const { drill } = normalize({});
    expect(drill.createdAt).toBe(FIXED_NOW);
  });

  it('truncates an over-long name', () => {
    const { drill } = normalize({ name: 'n'.repeat(500) });
    expect(drill.name).toHaveLength(200);
  });

  it('uses the supplied fallback name and id', () => {
    const { drill } = normalizeDrillCandidate({}, { ...now, fallbackId: 'fb', fallbackName: 'Fallback' });
    expect(drill.id).toBe('fb');
    expect(drill.name).toBe('Fallback');
  });

  it('produces a document that passes the storage schema', () => {
    const { drill } = normalizeDrillCandidate({}, { ...now, fallbackId: 'fb' });
    expect(parseStorableDrill(drill).ok).toBe(true);
  });
});

describe('migrateDrillCandidate versions', () => {
  it('does not warn for the current version', () => {
    const { warnings } = migrateDrillCandidate({ schemaVersion: 2, id: 'a', name: 'A' }, now);
    expect(warnings).toEqual([]);
  });

  it('does not warn for an older version', () => {
    const { warnings } = migrateDrillCandidate({ schemaVersion: 1, id: 'a', name: 'A' }, now);
    expect(warnings).toEqual([]);
  });
});

describe('remapImportedDrill edge cases', () => {
  it('handles a drill with no coaches array at all', () => {
    const drill = { ...buildDrill(), coaches: undefined };
    const remapped = remapImportedDrill(drill, sequentialIds('x'), FIXED_NOW);
    expect(remapped.coaches).toEqual([]);
  });

  it('supplies default settings when the source had none', () => {
    const drill = { ...buildDrill(), settings: undefined };
    const remapped = remapImportedDrill(drill, sequentialIds('x'), FIXED_NOW);
    expect(remapped.settings?.assistance).toBe('standard');
  });

  it('copies waypoints rather than sharing them', () => {
    const drill = buildDrill({
      events: [
        {
          id: 'e',
          type: 'pickup',
          fromPlayerId: 'p1',
          fromPoint: { x: 0, y: 0 },
          toPoint: { x: 1, y: 1 },
          waypoints: [{ x: 5, y: 5 }],
          team: 'home',
        },
      ],
    });
    const remapped = remapImportedDrill(drill, sequentialIds('x'), FIXED_NOW);
    expect(remapped.events[0].waypoints).toEqual([{ x: 5, y: 5 }]);
    expect(remapped.events[0].waypoints).not.toBe(drill.events[0].waypoints);
  });
});
