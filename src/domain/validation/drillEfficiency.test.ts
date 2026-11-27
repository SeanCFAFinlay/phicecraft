import { describe, expect, it } from 'vitest';
import { DRILL_TEMPLATES } from '@/data/templates/registry';
import { goalie, route, skater, template, pass, shot } from '@/data/templates/builder';
import type { DrillDocumentV3, RinkArea } from '@/domain/v3/types';
import { analyzeDrillEfficiency, GOALIE_SHOTS_PER_MINUTE } from './drillEfficiency';

function lineDrill(rinkArea: RinkArea, extra: Partial<Parameters<typeof template>[0]> = {}): DrillDocumentV3 {
  return template({
    id: 'efficiency-test',
    title: 'Efficiency test',
    summary: 'Efficiency test drill.',
    categories: ['skating'],
    tags: [],
    ageBands: ['u11'],
    skillLevel: 'beginner',
    rinkArea,
    durationMinutes: 8,
    durationSeconds: 10,
    equipmentSummary: ['pucks'],
    setupNotes: ['Test.'],
    coachingPoints: ['Test.'],
    progressions: [],
    variations: [],
    actors: [skater('a', 'home', '1', { x: 150, y: 150 }), skater('b', 'home', '2', { x: 150, y: 270 })],
    routes: [
      route('a', [{ x: 150, y: 150 }, { x: 800, y: 150 }]),
      route('b', [{ x: 150, y: 270 }, { x: 800, y: 270 }]),
    ],
    puck: { from: 'a', actions: [pass('a', 'b', { at: 3, flightSeconds: 0.8 })] },
    finishPolicy: 'none',
    ...extra,
  }).document;
}

describe('drill efficiency', () => {
  it('gives every library drill a grade and sensible numbers', () => {
    for (const item of DRILL_TEMPLATES) {
      const result = analyzeDrillEfficiency(item.document);
      expect(['A', 'B', 'C', 'D']).toContain(result.grade);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.activeShare).toBeGreaterThanOrEqual(0);
      expect(result.activeShare).toBeLessThanOrEqual(1);
      expect(Number.isFinite(result.waitSeconds)).toBe(true);
    }
  });

  it('a pair going one at a time on full ice leaves the team in a long line', () => {
    const result = analyzeDrillEfficiency(lineDrill('full'));
    expect(result.groupsAtOnce).toBe(1);
    expect(result.waitSeconds).toBeGreaterThan(45);
    expect(result.suggestions.join(' ')).toMatch(/wait about \d+ s/);
  });

  it('running the same drill in four stations cuts the wait and raises the grade', () => {
    const full = analyzeDrillEfficiency(lineDrill('full'));
    const stations = analyzeDrillEfficiency(lineDrill('quarter'));
    expect(stations.groupsAtOnce).toBe(4);
    expect(stations.waitSeconds).toBeLessThan(full.waitSeconds);
    expect(stations.repsPerPlayerPerMinute).toBeGreaterThan(full.repsPerPlayerPerMinute);
    expect(stations.score).toBeGreaterThan(full.score);
  });

  it('a bigger roster means a longer wait', () => {
    const small = analyzeDrillEfficiency(lineDrill('full'), { roster: 8 });
    const big = analyzeDrillEfficiency(lineDrill('full'), { roster: 20 });
    expect(big.waitSeconds).toBeGreaterThan(small.waitSeconds);
  });

  it('names a skater who never moves or touches the puck', () => {
    const document = lineDrill('half', {
      actors: [
        skater('a', 'home', '1', { x: 150, y: 150 }),
        skater('b', 'home', '2', { x: 150, y: 270 }),
        skater('c', 'home', '3', { x: 400, y: 380 }),
      ],
    });
    const result = analyzeDrillEfficiency(document);
    expect(result.standingStill).toEqual(['#3']);
    expect(result.suggestions.join(' ')).toContain('#3 stands still');
  });

  it('warns when the goalie faces more shots a minute than they can reset for', () => {
    const document = lineDrill('half', {
      durationSeconds: 3,
      actors: [skater('a', 'home', '1', { x: 700, y: 212 }), skater('b', 'home', '2', { x: 720, y: 150 }),
        goalie('g', 'away', '30', { x: 905, y: 212 })],
      routes: [],
      puck: { from: 'a', actions: [shot('a', { at: 0.5 })] },
    });
    const result = analyzeDrillEfficiency(document);
    expect(result.shotsPerGoaliePerMinute).toBeGreaterThan(GOALIE_SHOTS_PER_MINUTE);
    expect(result.suggestions.join(' ')).toMatch(/shots a minute/);
  });

  it('slower age groups take longer a rep', () => {
    const document = lineDrill('full');
    const u9 = analyzeDrillEfficiency({ ...document, presentation: { ...document.presentation, pace: 'u9' } });
    expect(u9.repSeconds).toBeGreaterThan(analyzeDrillEfficiency(document).repSeconds);
  });
});
