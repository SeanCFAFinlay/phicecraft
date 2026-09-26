import { describe, it, expect } from 'vitest';
import { createGoalNets } from './goalNet';

describe('goalNet', () => {
  it('creates two regulation goal nets and disposes cleanly', () => {
    const goals = createGoalNets('high');
    expect(goals.root).toBeDefined();
    expect(goals.root.children.length).toBe(2);

    expect(goals.root.getObjectByName('goal-net-left')).toBeDefined();
    expect(goals.root.getObjectByName('goal-net-right')).toBeDefined();

    expect(() => goals.dispose()).not.toThrow();
  });
});
