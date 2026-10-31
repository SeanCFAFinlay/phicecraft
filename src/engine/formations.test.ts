import { describe, expect, it } from 'vitest';
import { FORMATION_PRESETS, getFormationPreset } from './formations';
import { isInsideRink } from '@/utils/geometry';
import { RINK_MARGIN } from '@/commands/authoringCommands';
import { buildDrill } from '@/test/builders';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame } from '@/sim/sampleFrame';

describe('FORMATION_PRESETS', () => {
  it('offers the quick commands and existing systems with unique IDs', () => {
    expect(FORMATION_PRESETS.map(preset => preset.id)).toEqual(expect.arrayContaining(['faceoff-center', 'pp-131', 'pk-box', 'battle-1v1-left-top', 'battle-2v2-right-bottom', 'dump-in-right-bottom']));
    expect(new Set(FORMATION_PRESETS.map(preset => preset.id)).size).toBe(FORMATION_PRESETS.length);
  });

  for (const preset of FORMATION_PRESETS) {
    describe(`preset: ${preset.id} (${preset.title})`, () => {
      it('has valid metadata', () => {
        expect(preset.title.length).toBeGreaterThan(3);
        expect(preset.subtitle.length).toBeGreaterThan(10);
      });

      it('generates players that are strictly inside rink margins', () => {
        const players = preset.players();
        expect(players.length).toBeGreaterThanOrEqual(2);

        for (const p of players) {
          expect(isInsideRink({ x: p.x, y: p.y }, RINK_MARGIN)).toBe(true);
          expect(p.number.length).toBeGreaterThan(0);
          expect(p.role).toBeDefined();
        }
      });

      if (preset.initialPuck) {
        it('has initial puck inside rink margins', () => {
          expect(isInsideRink(preset.initialPuck!, RINK_MARGIN)).toBe(true);
        });
      }
      if (preset.sequence) {
        it('creates playable routes with valid owners and executable puck actions', () => {
          const players = preset.players();
          const sequence = preset.sequence!(players);
          for (const route of sequence.skatePaths) {
            expect(players.some(player => player.id === route.ownerId)).toBe(true);
            expect(route.points.every(point => isInsideRink(point, RINK_MARGIN))).toBe(true);
          }
          const compiled = compileDrill(buildDrill({ players, initialPuck: preset.initialPuck, ...sequence }));
          const frame = sampleFrame(compiled, compiled.durationSeconds);
          expect(frame.eventExecutions.every(event => event.status !== 'blocked')).toBe(true);
          if (preset.id.startsWith('dump-in')) {
            expect(sequence.events[0].type).toBe('dump');
            expect(frame.eventExecutions[0].status).toBe('completed');
          }
        });
      }
    });
  }

  it('retrieves preset by id or throws on unknown', () => {
    expect(getFormationPreset('pp-131').id).toBe('pp-131');
    expect(() => getFormationPreset('unknown' as unknown as Parameters<typeof getFormationPreset>[0])).toThrow();
  });
  it('counts skaters separately from goalies for special teams and battles', () => {
    for (const [id, home, away] of [['pp-131', 5, 4], ['pk-box', 4, 5], ['faceoff-center', 5, 5], ['battle-1v1-right-bottom', 1, 1], ['battle-2v2-right-bottom', 2, 2]] as const) {
      const skaters = getFormationPreset(id).players().filter(player => player.role !== 'G');
      expect(skaters.filter(player => player.team === 'home')).toHaveLength(home);
      expect(skaters.filter(player => player.team === 'away')).toHaveLength(away);
    }
  });

  it('assigns backward skating mode to defending defensemen in rush formations', () => {
    for (const presetId of ['rush-3v2', 'rush-2v1'] as const) {
      const preset = getFormationPreset(presetId);
      const players = preset.players();
      const seq = preset.sequence!(players);
      const defendingRoutes = seq.skatePaths.filter(route => route.team === 'away');
      expect(defendingRoutes.length).toBeGreaterThan(0);
      expect(defendingRoutes.every(r => r.mode === 'backward')).toBe(true);
    }
  });
});
