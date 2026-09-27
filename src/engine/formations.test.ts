import { describe, expect, it } from 'vitest';
import { FORMATION_PRESETS, getFormationPreset } from './formations';
import { isInsideRink } from '@/utils/geometry';
import { RINK_MARGIN } from '@/commands/authoringCommands';

describe('FORMATION_PRESETS', () => {
  it('defines 5 tactical formation presets', () => {
    expect(FORMATION_PRESETS.length).toBe(5);
  });

  for (const preset of FORMATION_PRESETS) {
    describe(`preset: ${preset.id} (${preset.title})`, () => {
      it('has valid metadata', () => {
        expect(preset.title.length).toBeGreaterThan(3);
        expect(preset.subtitle.length).toBeGreaterThan(10);
      });

      it('generates players that are strictly inside rink margins', () => {
        const players = preset.players();
        expect(players.length).toBeGreaterThanOrEqual(5);

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
    });
  }

  it('retrieves preset by id or throws on unknown', () => {
    expect(getFormationPreset('pp-131').id).toBe('pp-131');
    expect(() => getFormationPreset('unknown' as unknown as Parameters<typeof getFormationPreset>[0])).toThrow();
  });
});
