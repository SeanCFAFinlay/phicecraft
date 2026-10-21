import { describe, it, expect } from 'vitest';
import { recommendDrills, scoreDrill } from './recommendationEngine';
import { DRILL_TEMPLATES } from '@/data/templates/registry';

describe('recommendationEngine', () => {
  const allDrills = DRILL_TEMPLATES.map(t => t.document);

  it('ranks drills appropriately for a U11 half-ice passing practice with no goalie', () => {
    const recommendations = recommendDrills(allDrills, {
      ageBand: 'u11',
      skillLevel: 'developing',
      rinkArea: 'half',
      goalieCount: 0,
      categories: ['passing'],
      strictGoalies: true,
    });

    expect(recommendations.length).toBeGreaterThan(0);
    // Highest ranked drill should have goalieCount: 0 and passing category
    const top = recommendations[0];
    expect(top.drill.metadata.goalieCount).toBe(0);
    expect(top.score).toBeGreaterThan(50);
    expect(top.reasons.some(r => r.includes('No goalie needed'))).toBe(true);
    expect(top.factors.some(f => f.isPositive && f.label.includes('U11'))).toBe(true);
  });

  it('strictly excludes drills requiring goalies when strictGoalies is true and goalieCount is 0', () => {
    const recommendations = recommendDrills(allDrills, {
      goalieCount: 0,
      strictGoalies: true,
    });

    for (const rec of recommendations) {
      expect(rec.drill.metadata.goalieCount).toBe(0);
    }
  });

  it('penalizes drills requiring excluded equipment', () => {
    const tireDrill = allDrills.find(d => d.equipment.some(e => e.kind === 'tire'));
    expect(tireDrill).toBeDefined();

    if (tireDrill) {
      const normalScore = scoreDrill(tireDrill, {
        rinkArea: tireDrill.metadata.rinkArea,
      });
      const penalizedScore = scoreDrill(tireDrill, {
        rinkArea: tireDrill.metadata.rinkArea,
        excludedEquipment: ['tire'],
      });

      expect(penalizedScore).toBeDefined();
      expect(normalScore).toBeDefined();
      expect(penalizedScore!.score).toBeLessThan(normalScore!.score);
      expect(penalizedScore!.factors.some(f => f.label.includes('excluded from rink session'))).toBe(true);
    }
  });

  it('prioritizes category and duration constraints', () => {
    const recommendations = recommendDrills(allDrills, {
      categories: ['breakout'],
      maxMinutes: 12,
    });

    expect(recommendations.length).toBeGreaterThan(0);
    const top = recommendations[0];
    expect(top.drill.metadata.categories).toContain('breakout');
    expect(top.drill.metadata.durationMinutes).toBeLessThanOrEqual(12);
  });
});
