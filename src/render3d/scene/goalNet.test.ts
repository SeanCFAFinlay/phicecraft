import { describe, it, expect } from 'vitest';
import { createGoalNets, createSingleGoal } from './goalNet';
import { LineSegments } from 'three';

describe('goalNet', () => {
  it('keeps an open net grid and reduces strand density for low quality', () => {
    const high = createSingleGoal(1, 'high');
    const low = createSingleGoal(1, 'low');
    const highNet = high.root.getObjectByName('nylon-netting') as LineSegments;
    const lowNet = low.root.getObjectByName('nylon-netting') as LineSegments;
    expect(highNet.isLineSegments).toBe(true);
    expect(highNet.geometry.getAttribute('position').count).toBeGreaterThan(lowNet.geometry.getAttribute('position').count);
    expect(lowNet.geometry.getAttribute('position').count).toBeGreaterThan(0);
    high.dispose();
    low.dispose();
  });
  it('creates two regulation goal nets and disposes cleanly', () => {
    const goals = createGoalNets('high');
    expect(goals.root).toBeDefined();
    expect(goals.root.children.length).toBe(2);

    expect(goals.root.getObjectByName('goal-net-left')).toBeDefined();
    expect(goals.root.getObjectByName('goal-net-right')).toBeDefined();

    expect(() => goals.dispose()).not.toThrow();
  });
});
