import { describe, it, expect } from 'vitest';
import { renderDrillDiagram, exportDrillImageFile } from './exportImage';
import { buildDrill, buildPlayer } from '@/test/builders';

describe('exportImage', () => {
  it('gracefully handles headless / mock environment', () => {
    const drill = buildDrill({
      name: 'Breakout Drill',
      players: [buildPlayer({ id: 'p1', team: 'home', number: '17', x: 200, y: 200 })],
    });

    // In jsdom without canvas 2d context mock, renderDrillDiagram safely returns null without throwing
    const result = renderDrillDiagram(drill);
    // Should be null or string
    expect(result === null || typeof result === 'string').toBe(true);

    const exported = exportDrillImageFile(drill);
    expect(typeof exported).toBe('boolean');
  });
});
