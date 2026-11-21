import { describe, expect, it } from 'vitest';
import type { Player, SkatePath } from '@/core/types';
import { SIMULATION } from '@/core/constants';
import { compileRoute, sampleRouteMotion, timeAtRouteDistance } from './routeCompiler';
import type { MechanicsConfig } from './types';

const config: MechanicsConfig = { ...SIMULATION, durationSeconds: 12, assistance: 'standard', recovery: 'authored' };
const player = { id: 'p', x: 100, y: 100, team: 'home', number: '9', role: 'F' } as Player;

function path(overrides: Partial<SkatePath> = {}): SkatePath {
  return {
    id: 'r',
    ownerId: 'p',
    team: 'home',
    shape: 'polyline',
    points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }],
    legs: [
      { points: [{ x: 100, y: 100 }, { x: 200, y: 100 }], startAtSeconds: 0 },
      { points: [{ x: 200, y: 100 }, { x: 200, y: 200 }], startAtSeconds: 5, mode: 'backward' },
    ],
    ...overrides,
  };
}

describe('a route skated in legs', () => {
  it('stops between legs and goes again at the next start', () => {
    const route = compileRoute(player, path(), config);
    expect(route.legs).toHaveLength(2);
    const waiting = sampleRouteMotion(route, 4);
    expect(waiting.distance).toBeCloseTo(100, 3);
    expect(waiting.speed).toBe(0);
    expect(waiting.phase).toBe('idle');
    const going = sampleRouteMotion(route, 5.5);
    expect(going.distance).toBeGreaterThan(100);
    expect(going.mode).toBe('backward');
  });

  it('never starts a leg before the last one has finished', () => {
    const early = path();
    early.legs![1] = { ...early.legs![1], startAtSeconds: 0.2 };
    const route = compileRoute(player, early, config);
    expect(route.legs![1].startAtSeconds).toBeGreaterThan(1);
    expect(route.legs![1].startAtSeconds).toBeCloseTo(route.legs![0].motion.duration, 6);
  });

  it('takes the stop into account when asked when a point is reached', () => {
    const route = compileRoute(player, path(), config);
    expect(timeAtRouteDistance(route, 150)).toBeGreaterThan(5);
    expect(timeAtRouteDistance(route, 50)).toBeLessThan(2);
  });

  it('runs to the end of the last leg', () => {
    const route = compileRoute(player, path(), config);
    expect(route.durationSeconds).toBeGreaterThan(5);
    expect(sampleRouteMotion(route, route.durationSeconds + 1).distance).toBeCloseTo(route.totalLength, 3);
  });

  it('falls back to one continuous skate once the route is redrawn by hand', () => {
    const edited = path({ points: [{ x: 100, y: 100 }, { x: 260, y: 140 }, { x: 200, y: 200 }] });
    const route = compileRoute(player, edited, config);
    expect(route.legs).toBeUndefined();
    expect(sampleRouteMotion(route, 4).distance).toBeGreaterThan(150);
  });
});
