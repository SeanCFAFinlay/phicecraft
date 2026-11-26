import { describe, expect, it } from 'vitest';
import { FT, RINK, RINK_MARKS, SIMULATION } from '@/core/constants';
import type { ShotEvent } from '@/core/types';
import { MINI_NET_REACH, resolveShotResult } from './shotSolver';
import type { MechanicsConfig } from './types';

function shot(to: { x: number; y: number }, extra: Partial<ShotEvent> = {}): ShotEvent {
  return {
    id: 's1',
    type: 'shot',
    team: 'home',
    fromPlayerId: 'p1',
    fromPoint: { x: RINK.goalLineRightX - 30 * FT, y: RINK.centerY },
    toPoint: to,
    targetNet: 'R',
    ...extra,
  } as ShotEvent;
}

describe('resolveShotResult', () => {
  const config: MechanicsConfig = { ...SIMULATION, durationSeconds: 12, assistance: 'standard', recovery: 'authored' };
  const goalX = RINK.goalLineRightX;

  it('keeps an authored result', () => {
    expect(resolveShotResult(shot({ x: goalX, y: 0 }, { result: 'goal' }), config)).toBe('goal');
  });

  it('rings a shot aimed at the post off the post', () => {
    expect(resolveShotResult(shot({ x: goalX, y: RINK.centerY - RINK_MARKS.goalHalfWidth }), config)).toBe('post');
  });

  it('calls a shot outside the mouth wide', () => {
    expect(resolveShotResult(shot({ x: goalX, y: RINK.centerY + 40 }), config)).toBe('wide');
  });

  it('scores an open net', () => {
    expect(resolveShotResult(shot({ x: goalX, y: RINK.centerY }), config)).toBe('goal');
  });

  it('scores on a mini-net wherever it sits, with no goalie', () => {
    const net = { x: 230, y: 45 };
    expect(resolveShotResult(shot(net), config, { from: { x: 260, y: 120 }, to: net, miniNets: [net] })).toBe('goal');
    const nearMiss = { x: net.x + MINI_NET_REACH * 2, y: net.y };
    expect(resolveShotResult(shot(nearMiss), config, { from: { x: 260, y: 120 }, to: nearMiss, miniNets: [net] })).not.toBe('goal');
  });
});
