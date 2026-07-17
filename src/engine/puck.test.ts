import { describe, it, expect } from 'vitest';
import {
  getPuckChain,
  getCurrentPuckHolder,
  canAddEvents,
  validatePass,
  validateShot,
  getTargetNet,
  getNearestNet,
  playerHasPuck,
  removePlayerFromEvents,
  getPuckHolderAtEvent,
} from './puck';
import { NET_LEFT, NET_RIGHT } from '@/core/constants';
import type { Player, PassEvent, ShotEvent, PickupEvent, DrillEvent } from '@/core/types';

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    x: 100,
    y: 250,
    team: 'home',
    number: id,
    role: 'F',
    hasPuck: false,
    ...overrides,
  };
}

function pass(from: string, to: string, id = `pass-${from}-${to}`): PassEvent {
  return {
    id,
    type: 'pass',
    fromPlayerId: from,
    toPlayerId: to,
    fromPoint: { x: 0, y: 0 },
    toPoint: { x: 10, y: 10 },
    team: 'home',
  };
}

function shot(from: string, id = `shot-${from}`): ShotEvent {
  return {
    id,
    type: 'shot',
    fromPlayerId: from,
    fromPoint: { x: 0, y: 0 },
    toPoint: NET_RIGHT,
    targetNet: 'R',
    team: 'home',
  };
}

function pickup(playerId: string): PickupEvent {
  return {
    id: `pickup-${playerId}`,
    type: 'pickup',
    fromPlayerId: playerId,
    fromPoint: { x: 20, y: 20 },
    toPoint: { x: 20, y: 20 },
    team: 'home',
  };
}

const a = player('a', { hasPuck: true });
const b = player('b');
const c = player('c');
const players = [a, b, c];

describe('getCurrentPuckHolder', () => {
  it('returns the initial carrier when there are no events', () => {
    expect(getCurrentPuckHolder(players, [])?.id).toBe('a');
  });

  it('follows a chain of passes to the last receiver', () => {
    const events = [pass('a', 'b'), pass('b', 'c')];
    expect(getCurrentPuckHolder(players, events)?.id).toBe('c');
  });

  it('returns null once a shot has been taken', () => {
    expect(getCurrentPuckHolder(players, [pass('a', 'b'), shot('b')])).toBeNull();
  });

  it('does not transfer possession on a missed pass', () => {
    expect(getCurrentPuckHolder(players, [{ ...pass('a', 'b'), catchResult: 'missed' }])).toBeNull();
  });

  it('assigns possession after a loose-puck pickup', () => {
    const missed = { ...pass('a', 'b'), catchResult: 'missed' as const };
    expect(getCurrentPuckHolder(players, [missed, pickup('c')])?.id).toBe('c');
  });

  it('returns null when nobody is flagged as the carrier', () => {
    expect(getCurrentPuckHolder([b, c], [])).toBeNull();
  });
});

describe('getPuckChain', () => {
  it('starts with the initial carrier and appends a node per event', () => {
    const chain = getPuckChain(players, [pass('a', 'b'), shot('b')]);
    expect(chain.map(n => [n.player?.id ?? null, n.action])).toEqual([
      ['a', null],
      ['b', 'pass'],
      [null, 'shot'],
    ]);
  });

  it('is empty when no player has the puck and nothing has happened', () => {
    expect(getPuckChain([b, c], [])).toEqual([]);
  });
});

describe('canAddEvents', () => {
  it('allows events on an empty drill', () => {
    expect(canAddEvents([])).toBe(true);
  });

  it('allows events after a pass', () => {
    expect(canAddEvents([pass('a', 'b')])).toBe(true);
  });

  it('blocks events after a shot or dump terminates the chain', () => {
    expect(canAddEvents([shot('a')])).toBe(false);
  });

  it('blocks normal actions after a miss but resumes after pickup', () => {
    const missed = { ...pass('a', 'b'), catchResult: 'missed' as const };
    expect(canAddEvents([missed])).toBe(false);
    expect(canAddEvents([missed, pickup('c')])).toBe(true);
  });
});

describe('validatePass', () => {
  it('accepts a pass from the current holder', () => {
    expect(validatePass(a, b, players, [])).toEqual({ valid: true, error: null });
  });

  it('rejects a pass from someone without the puck', () => {
    const result = validatePass(b, c, players, []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not have the puck');
  });

  it('rejects a pass to self', () => {
    expect(validatePass(a, a, players, []).valid).toBe(false);
  });

  it('rejects a pass after the drill ended with a shot', () => {
    const result = validatePass(a, b, players, [shot('a')]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('already ended');
  });

  it('accepts a pass from whoever received the last pass', () => {
    expect(validatePass(b, c, players, [pass('a', 'b')]).valid).toBe(true);
  });
});

describe('validateShot', () => {
  it('accepts a shot from the current holder', () => {
    expect(validateShot(a, players, []).valid).toBe(true);
  });

  it('rejects a shot from someone without the puck', () => {
    expect(validateShot(b, players, []).valid).toBe(false);
  });

  it('rejects a second shot', () => {
    expect(validateShot(a, players, [shot('a')]).valid).toBe(false);
  });
});

describe('getTargetNet', () => {
  it('sends home at the right net and away at the left', () => {
    expect(getTargetNet('home')).toEqual(NET_RIGHT);
    expect(getTargetNet('away')).toEqual(NET_LEFT);
  });
});

describe('getNearestNet', () => {
  it('picks whichever net is closer', () => {
    expect(getNearestNet({ x: 50, y: 250 })).toEqual(NET_LEFT);
    expect(getNearestNet({ x: 950, y: 250 })).toEqual(NET_RIGHT);
  });
});

describe('playerHasPuck', () => {
  it('is true only for the current holder', () => {
    expect(playerHasPuck(a, players, [])).toBe(true);
    expect(playerHasPuck(b, players, [])).toBe(false);
    expect(playerHasPuck(b, players, [pass('a', 'b')])).toBe(true);
  });
});

describe('removePlayerFromEvents', () => {
  it('drops events the player passed from', () => {
    const events: DrillEvent[] = [pass('a', 'b'), pass('b', 'c')];
    expect(removePlayerFromEvents('b', events).map(e => e.id)).toEqual([]);
  });

  it('drops events the player received', () => {
    const events: DrillEvent[] = [pass('a', 'b'), shot('a')];
    expect(removePlayerFromEvents('b', events).map(e => e.id)).toEqual(['shot-a']);
  });

  it('leaves unrelated events alone', () => {
    const events: DrillEvent[] = [pass('a', 'b')];
    expect(removePlayerFromEvents('c', events)).toHaveLength(1);
  });
});

describe('getPuckHolderAtEvent', () => {
  const events = [pass('a', 'b'), pass('b', 'c')];

  it('returns the initial carrier before any event', () => {
    expect(getPuckHolderAtEvent(players, events, -1)?.id).toBe('a');
  });

  it('returns the holder as of a given event index', () => {
    expect(getPuckHolderAtEvent(players, events, 0)?.id).toBe('b');
    expect(getPuckHolderAtEvent(players, events, 1)?.id).toBe('c');
  });
});
