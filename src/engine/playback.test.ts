import { describe, it, expect } from 'vitest';
import {
  getPlayerPositionAtProgress,
  getPlaybackPositions,
  getEventTimelinePosition,
  getFiredEventIndices,
  getPuckStateAtProgress,
  getPassInterception,
  getPlayerStickPositionAtProgress,
  getLoosePuckPosition,
  updateGhostTrail,
  formatTime,
  getTimelineMarkers,
} from './playback';
import { GHOST_TRAIL_MAX_LENGTH } from '@/core/constants';
import type { Player, SkatePath, PassEvent, ShotEvent, PickupEvent, Point } from '@/core/types';

function player(id: string, x: number, y: number, hasPuck = false): Player {
  return { id, x, y, team: 'home', number: id, role: 'F', hasPuck };
}

/** A straight horizontal path from x=0 to x=100 at y=0 */
function straightPath(ownerId: string): SkatePath {
  return {
    id: `path-${ownerId}`,
    ownerId,
    team: 'home',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  };
}

describe('getPlayerPositionAtProgress', () => {
  const p = player('a', 500, 500);

  it('leaves a player without a path where they stand', () => {
    expect(getPlayerPositionAtProgress(p, [], 0.5)).toEqual({ x: 500, y: 500 });
  });

  it('starts at the beginning of the path at progress 0', () => {
    expect(getPlayerPositionAtProgress(p, [straightPath('a')], 0)).toEqual({ x: 0, y: 0 });
  });

  it('interpolates along the path', () => {
    expect(getPlayerPositionAtProgress(p, [straightPath('a')], 0.5).x).toBeCloseTo(50);
  });

  it('reaches the end of the path by progress 1', () => {
    expect(getPlayerPositionAtProgress(p, [straightPath('a')], 1)).toEqual({ x: 100, y: 0 });
  });

  it('decelerates into the endpoint and lands exactly at full time', () => {
    expect(getPlayerPositionAtProgress(p, [straightPath('a')], 0.95).x).toBeGreaterThan(98);
    expect(getPlayerPositionAtProgress(p, [straightPath('a')], 0.95).x).toBeLessThan(100);
    expect(getPlayerPositionAtProgress(p, [straightPath('a')], 1).x).toBe(100);
  });

  it('ignores a path belonging to a different player', () => {
    expect(getPlayerPositionAtProgress(p, [straightPath('someone-else')], 0.5)).toEqual({
      x: 500,
      y: 500,
    });
  });
});

describe('getPlaybackPositions', () => {
  it('returns a position for every player, keyed by id', () => {
    const players = [player('a', 500, 500), player('b', 10, 20)];
    const positions = getPlaybackPositions(players, [straightPath('a')], 0);

    expect(positions).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 10, y: 20 },
    });
  });
});

describe('getLoosePuckPosition', () => {
  it('stops at the friction limit instead of reversing later', () => {
    const stopped = getLoosePuckPosition({ x: 100, y: 250 }, { x: 200, y: 250 }, 2, 40, 20);
    const muchLater = getLoosePuckPosition({ x: 100, y: 250 }, { x: 200, y: 250 }, 20, 40, 20);
    expect(muchLater).toEqual(stopped);
    expect(stopped.x).toBeGreaterThan(100);
  });

  it('reflects a loose puck off the boards', () => {
    const puck = getLoosePuckPosition({ x: 970, y: 250 }, { x: 1000, y: 250 }, 1, 80, 10);
    expect(puck.x).toBeLessThanOrEqual(986);
    expect(puck.x).toBeGreaterThanOrEqual(14);
  });
});

describe('getPassInterception', () => {
  it('targets the receiver position at the calculated arrival time', () => {
    const receiver = player('b', 0, 0);
    const result = getPassInterception(
      { x: 0, y: 80 },
      receiver,
      [straightPath('b')],
      0.2,
      8
    );
    const receiverAtArrival = getPlayerStickPositionAtProgress(receiver, [straightPath('b')], result.arrivalAt);
    expect(result.toPoint.x).toBeCloseTo(receiverAtArrival.x);
    expect(result.toPoint.y).toBeCloseTo(receiverAtArrival.y);
    expect(result.arrivalAt).toBeGreaterThan(0.2);
  });
});

describe('getEventTimelinePosition', () => {
  it('centres each event in its slot', () => {
    expect(getEventTimelinePosition(0, 2)).toBe(0.25);
    expect(getEventTimelinePosition(1, 2)).toBe(0.75);
  });

  it('returns 0 when there are no events', () => {
    expect(getEventTimelinePosition(0, 0)).toBe(0);
  });
});

describe('getFiredEventIndices', () => {
  const events = [pass('a', 'b'), pass('b', 'c')];

  it('fires nothing before the first slot', () => {
    expect(getFiredEventIndices(events, 0.1)).toEqual([]);
  });

  it('fires events as the playhead passes them', () => {
    expect(getFiredEventIndices(events, 0.25)).toEqual([0]);
    expect(getFiredEventIndices(events, 0.5)).toEqual([0]);
    expect(getFiredEventIndices(events, 0.75)).toEqual([0, 1]);
    expect(getFiredEventIndices(events, 1)).toEqual([0, 1]);
  });

  it('is derived, so scrubbing backwards un-fires events', () => {
    // The old implementation accumulated fired events and could never undo
    // them, which made scrubbing back inconsistent.
    expect(getFiredEventIndices(events, 0.1)).toEqual([]);
  });

  it('uses explicit route timing when an event provides it', () => {
    const timed = { ...pass('a', 'b'), at: 0.62, arrivalAt: 0.7 };
    expect(getFiredEventIndices([timed], 0.61)).toEqual([]);
    expect(getFiredEventIndices([timed], 0.62)).toEqual([0]);
  });
});

function pass(from: string, to: string): PassEvent {
  const positions: Record<string, number> = { a: 0, b: 100, c: 200 };
  return {
    id: `pass-${from}-${to}`,
    type: 'pass',
    fromPlayerId: from,
    toPlayerId: to,
    fromPoint: { x: positions[from] ?? 0, y: 0 },
    toPoint: { x: positions[to] ?? 0, y: 0 },
    team: 'home',
  };
}

function shot(from: string, target: Point): ShotEvent {
  return {
    id: `shot-${from}`,
    type: 'shot',
    fromPlayerId: from,
    fromPoint: { x: 0, y: 0 },
    toPoint: target,
    targetNet: 'R',
    team: 'home',
  };
}

describe('getPuckStateAtProgress', () => {
  const a = player('a', 0, 0, true);
  const b = player('b', 100, 0);
  const players = [a, b];

  it('returns null when nobody has the puck', () => {
    expect(getPuckStateAtProgress([player('x', 0, 0)], [], [], 0)).toBeNull();
  });

  it('rides the initial carrier when there are no events', () => {
    expect(getPuckStateAtProgress(players, [], [], 0.5)).toEqual({
      x: 25,
      y: 8,
      visible: true,
      state: 'possessed',
      carrierId: 'a',
    });
  });

  it('rides the carrier along their skate path', () => {
    const puck = getPuckStateAtProgress([player('a', 0, 0, true)], [straightPath('a')], [], 0.5);
    expect(puck!.x).toBeCloseTo(75);
  });

  it('stays with the passer until the event fires', () => {
    expect(getPuckStateAtProgress(players, [], [pass('a', 'b')], 0.1)).toMatchObject({
      x: 25, y: 8, visible: true, state: 'possessed', carrierId: 'a',
    });
  });

  it('is at the passer the instant the pass fires', () => {
    // Single event fires at 0.5
    expect(getPuckStateAtProgress(players, [], [pass('a', 'b')], 0.5)!.x).toBeCloseTo(0);
  });

  it('flies from passer to receiver during the pass', () => {
    // Flight spans 0.5 -> 0.95 (PUCK_FLIGHT_FRACTION 0.45 / 1 event)
    const mid = getPuckStateAtProgress(players, [], [pass('a', 'b')], 0.725);
    expect(mid!.x).toBeCloseTo(50);
  });

  it('lands on the receiver and stays there', () => {
    expect(getPuckStateAtProgress(players, [], [pass('a', 'b')], 0.95)!.x).toBeCloseTo(125);
    expect(getPuckStateAtProgress(players, [], [pass('a', 'b')], 1)!.x).toBeCloseTo(125);
  });

  it('obeys the drawn landing point instead of chasing a moving receiver', () => {
    const movingB = [player('a', 0, 0, true), player('b', 999, 999)];
    const puck = getPuckStateAtProgress(movingB, [straightPath('b')], [pass('a', 'b')], 1);
    expect(puck!.x).toBeCloseTo(125);
    expect(puck!.y).toBeCloseTo(8);
  });

  it('flies on explicit departure/arrival times, then rides with the receiver', () => {
    const timed = {
      ...pass('a', 'b'),
      at: 0.2,
      arrivalAt: 0.4,
      fromPoint: { x: 0, y: 0 },
      toPoint: { x: 40, y: 0 },
    };
    const movingPlayers = [player('a', 0, 0, true), player('b', 0, 0)];
    const receiverPath = [straightPath('b')];
    expect(getPuckStateAtProgress(movingPlayers, receiverPath, [timed], 0.3)!.x).toBeCloseTo(20);
    expect(getPuckStateAtProgress(movingPlayers, receiverPath, [timed], 0.6)!.x).toBeGreaterThan(60);
  });

  it('turns a missed pass into a loose puck instead of transferring possession', () => {
    const missed = {
      ...pass('a', 'b'),
      at: 0.2,
      arrivalAt: 0.35,
      catchResult: 'missed' as const,
    };
    const puck = getPuckStateAtProgress(players, [], [missed], 0.6)!;
    expect(puck.state).toBe('loose');
    expect(puck.carrierId).toBeUndefined();
    expect(puck.x).toBeGreaterThan(missed.toPoint.x);
  });

  it('attaches a recovered loose puck to the picker stick', () => {
    const missed = {
      ...pass('a', 'b'),
      at: 0.2,
      arrivalAt: 0.35,
      catchResult: 'missed' as const,
    };
    const recover: PickupEvent = {
      id: 'pickup-c',
      type: 'pickup',
      fromPlayerId: 'c',
      fromPoint: { x: 140, y: 0 },
      toPoint: { x: 140, y: 0 },
      team: 'home',
      at: 0.7,
      arrivalAt: 0.7,
    };
    const three = [...players, player('c', 140, 0)];
    const puck = getPuckStateAtProgress(three, [], [missed, recover], 0.8)!;
    expect(puck.state).toBe('possessed');
    expect(puck.carrierId).toBe('c');
    expect(puck.x).toBeCloseTo(165);
  });

  it('sends a shot to the net rather than a player', () => {
    const net = { x: 981, y: 250 };
    const puck = getPuckStateAtProgress(players, [], [shot('a', net)], 1);
    expect(puck!.x).toBeCloseTo(net.x);
    expect(puck!.y).toBeCloseTo(net.y);
  });

  it('walks a two-pass chain in order', () => {
    const three = [player('a', 0, 0, true), player('b', 100, 0), player('c', 200, 0)];
    const events = [pass('a', 'b'), pass('b', 'c')];

    // Event 0 fires at 0.25, event 1 at 0.75.
    expect(getPuckStateAtProgress(three, [], events, 0.1)!.x).toBeCloseTo(25);
    expect(getPuckStateAtProgress(three, [], events, 0.5)!.x).toBeCloseTo(125);
    expect(getPuckStateAtProgress(three, [], events, 1)!.x).toBeCloseTo(225);
  });
});

describe('updateGhostTrail', () => {
  it('appends a point without mutating the input map or array', () => {
    const original = new Map<string, Point[]>([['a', [{ x: 0, y: 0 }]]]);
    const originalTrail = original.get('a')!;

    const next = updateGhostTrail(original, 'a', { x: 1, y: 1 });

    expect(next.get('a')).toHaveLength(2);
    expect(original.get('a')).toHaveLength(1);
    expect(next.get('a')).not.toBe(originalTrail);
    expect(next).not.toBe(original);
  });

  it('starts a trail for a player that has none', () => {
    expect(updateGhostTrail(new Map(), 'a', { x: 5, y: 5 }).get('a')).toEqual([{ x: 5, y: 5 }]);
  });

  it('trims to the max length, dropping the oldest points', () => {
    let trails = new Map<string, Point[]>();
    for (let i = 0; i < GHOST_TRAIL_MAX_LENGTH + 10; i++) {
      trails = updateGhostTrail(trails, 'a', { x: i, y: 0 });
    }

    const trail = trails.get('a')!;
    expect(trail).toHaveLength(GHOST_TRAIL_MAX_LENGTH);
    expect(trail[trail.length - 1].x).toBe(GHOST_TRAIL_MAX_LENGTH + 9);
    expect(trail[0].x).toBe(10);
  });
});

describe('formatTime', () => {
  it('formats progress against the drill duration', () => {
    expect(formatTime(0, 8)).toBe('0:00');
    expect(formatTime(0.5, 8)).toBe('0:04');
    expect(formatTime(1, 8)).toBe('0:08');
  });

  it('rolls over into minutes', () => {
    expect(formatTime(1, 90)).toBe('1:30');
  });
});

describe('getTimelineMarkers', () => {
  it('places a marker per event with its type', () => {
    expect(getTimelineMarkers([pass('a', 'b'), shot('b', { x: 0, y: 0 })])).toEqual([
      { position: 0.25, type: 'pass', eventIndex: 0 },
      { position: 0.75, type: 'shot', eventIndex: 1 },
    ]);
  });

  it('returns nothing for an empty drill', () => {
    expect(getTimelineMarkers([])).toEqual([]);
  });
});
