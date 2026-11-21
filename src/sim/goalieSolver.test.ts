import { describe, expect, it } from 'vitest';
import { RINK } from '@/core/constants';
import { squaredGoaliePosition } from './goalieSolver';

const net = { x: RINK.goalLineRightX, y: RINK.centerY };
const rest = { x: net.x - 22, y: net.y };

describe('a goalie playing the angle', () => {
  it('stays centred for a puck straight out front', () => {
    const at = squaredGoaliePosition(rest, { x: 700, y: net.y });
    expect(at.x).toBeCloseTo(rest.x);
    expect(at.y).toBeCloseTo(net.y);
  });

  it('slides toward the side of the ice the puck is on, staying in front of the goal line', () => {
    const high = squaredGoaliePosition(rest, { x: 800, y: 90 });
    const low = squaredGoaliePosition(rest, { x: 800, y: 340 });
    expect(high.y).toBeLessThan(net.y);
    expect(low.y).toBeGreaterThan(net.y);
    expect(high.x).toBeLessThan(net.x);
    expect(low.x).toBeLessThan(net.x);
  });

  it('is square: on the line from the puck to the middle of the net', () => {
    const puck = { x: 760, y: 330 };
    const at = squaredGoaliePosition(rest, puck);
    const cross = (puck.x - net.x) * (at.y - net.y) - (puck.y - net.y) * (at.x - net.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it('seals the near post when the puck is below the goal line', () => {
    const at = squaredGoaliePosition(rest, { x: 975, y: 330 });
    expect(at.x).toBeCloseTo(net.x, 0);
    expect(at.y).toBeGreaterThan(net.y);
    // On the post (the net is six feet wide), not out past it.
    expect(at.y - net.y).toBeLessThanOrEqual(15);
  });

  it('mirrors for the left net', () => {
    const left = { x: RINK.goalLineLeftX, y: RINK.centerY };
    const at = squaredGoaliePosition({ x: left.x + 22, y: left.y }, { x: 200, y: 90 });
    expect(at.x).toBeGreaterThan(left.x);
    expect(at.y).toBeLessThan(left.y);
  });

  it('leaves a goalie who is not in a net where they are', () => {
    const skatingOut = { x: 600, y: 200 };
    expect(squaredGoaliePosition(skatingOut, { x: 700, y: 90 })).toEqual(skatingOut);
  });
});
