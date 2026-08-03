// ============================================================================
// WORLD MAP
// ============================================================================

import { describe, it, expect } from 'vitest';
import { RINK_SCALE, rinkToWorld, headingToYaw } from './worldMap';
import { RINK } from '@/core/constants';

describe('RINK_SCALE', () => {
  it('is the documented constant', () => {
    expect(RINK_SCALE).toBe(0.061);
  });
});

describe('rinkToWorld', () => {
  it('maps centre ice to the world origin', () => {
    expect(rinkToWorld({ x: RINK.centerX, y: RINK.centerY })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('maps the left goal line (rink x=55) to the exact scaled offset', () => {
    // 55 * 0.061 - 500 * 0.061 = 0.061 * (55 - 500) = -27.145
    const world = rinkToWorld({ x: RINK.goalLineLeftX, y: RINK.centerY });
    expect(RINK.goalLineLeftX).toBe(55);
    expect(world.x).toBeCloseTo(-27.145, 10);
    expect(world.z).toBe(0);
  });

  it('maps the right goal line (rink x=945) to the mirrored positive offset', () => {
    const world = rinkToWorld({ x: RINK.goalLineRightX, y: RINK.centerY });
    expect(RINK.goalLineRightX).toBe(945);
    // 945 * 0.061 - 500 * 0.061 = 0.061 * 445 = 27.145
    expect(world.x).toBeCloseTo(27.145, 10);
  });

  it('maps rink y toward world z, keeping the ground plane flat (y = 0)', () => {
    const world = rinkToWorld({ x: RINK.centerX, y: 0 });
    expect(world.y).toBe(0);
    // 0 * 0.061 - 212.5 * 0.061 = -12.9625
    expect(world.z).toBeCloseTo(-12.9625, 10);
  });

  it('is linear in the scale factor (doubling the offset from centre doubles the world offset)', () => {
    const near = rinkToWorld({ x: RINK.centerX + 10, y: RINK.centerY });
    const far = rinkToWorld({ x: RINK.centerX + 20, y: RINK.centerY });
    expect(far.x).toBeCloseTo(near.x * 2, 10);
  });
});

describe('headingToYaw', () => {
  it('heading 0 (rink east, +x) yaws the model to face world +x', () => {
    // yaw = -0 + PI/2 = PI/2. A model authored facing local +z, rotated PI/2
    // about +Y, points its forward vector (sin(yaw), 0, cos(yaw)) at
    // (1, 0, 0) - world +x, matching rinkToWorld's +x mapping of rink +x.
    expect(headingToYaw(0)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('heading PI/2 (rink south, +y) yaws the model to face world +z', () => {
    // yaw = -PI/2 + PI/2 = 0. Forward vector (sin(0), 0, cos(0)) = (0, 0, 1) -
    // world +z, matching rinkToWorld's +z mapping of rink +y.
    expect(headingToYaw(Math.PI / 2)).toBeCloseTo(0, 10);
  });

  it('heading PI (rink west, -x) yaws the model to face world -x', () => {
    expect(headingToYaw(Math.PI)).toBeCloseTo(-Math.PI / 2, 10);
  });

  it('is an involution — yaw = PI/2 - heading, so applying it twice is the identity', () => {
    const heading = 0.73;
    expect(headingToYaw(headingToYaw(heading))).toBeCloseTo(heading, 10);
  });
});
