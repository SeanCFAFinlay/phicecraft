// ============================================================================
// THE AUTOMATIC FINISHING SHOT
//
// A drill whose finish policy is `finish-with-shot` has its last event derived
// rather than authored. Every other policy derives nothing - a passing warm-up,
// a possession game, a race or a breakout that ends at the blue line must be
// able to end the way it actually ends.
//
// Where a shot IS wanted, it is machinery with three hard requirements, and
// most of this file is about those rather than about hockey:
//
//   IDEMPOTENT   deriving twice must not produce two shots
//   STABLE       when nothing needs to change, the SAME object comes back, or
//                every action would look like a document edit
//   TRANSPARENT  the rules that ask "can more be added" and "who has the puck"
//                must see straight through it, or the drill it completes could
//                never be extended
// ============================================================================

import { describe, it, expect } from 'vitest';
import { withFinishingShot } from './finishingShot';
import { authoredEvents, canAddEvents, getCurrentPuckHolder, isAutoShot } from './puck';
import { appReducer, createInitialState } from '@/core/state';
import { buildDrill, buildPlayer } from '@/test/builders';
import { RINK } from '@/core/constants';
import type { AppState, Drill, DrillEvent, PassEvent, ShotEvent, SkatePath } from '@/core/types';

const ROUTE: SkatePath = {
  id: 'r1',
  ownerId: 'h11',
  team: 'home',
  mode: 'skate',
  finish: 'stop',
  points: [
    { x: 300, y: 200 },
    { x: 480, y: 180 },
  ],
};

function pass(id: string, from: string, to: string, at = 0.2, arrivalAt = 0.4): PassEvent {
  return {
    id,
    type: 'pass',
    fromPlayerId: from,
    toPlayerId: to,
    fromPoint: { x: 300, y: 200 },
    toPoint: { x: 600, y: 200 },
    team: 'home',
    at,
    arrivalAt,
  };
}

/** A drill that asks for a finishing shot. */
function drill(overrides: Partial<Drill> = {}): Drill {
  const base = buildDrill({
    players: [
      buildPlayer({ id: 'h11', number: '11', hasPuck: true, x: 300, y: 200 }),
      buildPlayer({ id: 'h13', number: '13', x: 600, y: 200 }),
      buildPlayer({ id: 'h87', number: '87', x: 700, y: 260 }),
    ],
    ...overrides,
  });
  return {
    ...base,
    settings: { ...base.settings!, finishPolicy: 'finish-with-shot', ...overrides.settings },
  };
}

/** The same drill, ending some other way. */
function noShotDrill(overrides: Partial<Drill> = {}): Drill {
  const base = drill(overrides);
  return { ...base, settings: { ...base.settings!, finishPolicy: 'none' } };
}

const finish = (d: Drill): ShotEvent | undefined =>
  d.events.find(isAutoShot) as ShotEvent | undefined;

// ----------------------------------------------------------------------------
// When it appears at all
// ----------------------------------------------------------------------------

describe('the finish policy decides', () => {
  it('derives nothing when the drill does not ask for a shot', () => {
    const warmUp = withFinishingShot(noShotDrill({ events: [pass('p1', 'h11', 'h13')] }));

    // A passing warm-up is a complete drill. This used to grow a shot the
    // moment the puck moved, which made the drill a lie.
    expect(warmUp.events.some(isAutoShot)).toBe(false);
    expect(warmUp.events).toHaveLength(1);
  });

  it('derives nothing for any policy other than finish-with-shot', () => {
    for (const policy of ['none', 'stop-after-sequence', 'loop', 'finish-with-zone-entry', 'finish-with-possession'] as const) {
      const base = drill({ events: [pass('p1', 'h11', 'h13')] });
      const result = withFinishingShot({
        ...base,
        settings: { ...base.settings!, finishPolicy: policy },
      });
      expect(result.events.some(isAutoShot), policy).toBe(false);
    }
  });

  it('strips a shot left behind when the policy is taken away', () => {
    const withShot = withFinishingShot(drill({ events: [pass('p1', 'h11', 'h13')] }));
    expect(withShot.events.some(isAutoShot)).toBe(true);

    const stripped = withFinishingShot({
      ...withShot,
      settings: { ...withShot.settings!, finishPolicy: 'none' },
    });
    expect(stripped.events.some(isAutoShot)).toBe(false);
    expect(stripped.events).toHaveLength(1);
  });

  it('leaves a shot the coach authored alone whatever the policy', () => {
    const authoredShot: ShotEvent = {
      id: 'manual',
      type: 'shot',
      fromPlayerId: 'h11',
      fromPoint: { x: 300, y: 200 },
      toPoint: { x: 900, y: 212 },
      targetNet: 'R',
      team: 'home',
      at: 0.3,
      arrivalAt: 0.5,
    };
    const board = noShotDrill({ events: [authoredShot] });

    expect(withFinishingShot(board)).toBe(board);
  });
});

describe('when a play gets a finishing shot', () => {
  it('leaves an untouched board alone - a lineup is not a play', () => {
    const board = drill();
    expect(withFinishingShot(board)).toBe(board);
    expect(board.events).toEqual([]);
  });

  it('appears once the carrier has a route to skate', () => {
    const result = withFinishingShot(drill({ skatePaths: [ROUTE] }));

    expect(result.events).toHaveLength(1);
    expect(finish(result)?.fromPlayerId).toBe('h11');
  });

  it('appears once the puck has been passed', () => {
    const result = withFinishingShot(drill({ events: [pass('p1', 'h11', 'h13')] }));

    expect(result.events).toHaveLength(2);
    expect(finish(result)?.fromPlayerId).toBe('h13');
  });

  it('is taken by whoever ends up with the puck', () => {
    const result = withFinishingShot(
      drill({ events: [pass('p1', 'h11', 'h13'), pass('p2', 'h13', 'h87', 0.5, 0.6)] })
    );

    expect(finish(result)?.fromPlayerId).toBe('h87');
  });

  it('aims at the net the shooter is attacking', () => {
    const result = withFinishingShot(drill({ skatePaths: [ROUTE] }));

    expect(finish(result)?.toPoint).toEqual({ x: RINK.netRightX, y: RINK.netRightY });
    expect(finish(result)?.targetNet).toBe('R');
  });

  it('leaves a shot the coach authored exactly as it is', () => {
    const authored: ShotEvent = {
      id: 'manual',
      type: 'shot',
      fromPlayerId: 'h11',
      fromPoint: { x: 300, y: 200 },
      toPoint: { x: 900, y: 212 },
      targetNet: 'R',
      team: 'home',
      at: 0.3,
      arrivalAt: 0.5,
    };
    const board = drill({ events: [authored] });

    expect(withFinishingShot(board)).toBe(board);
  });

  it('goes away again when the play it finished is undone', () => {
    const withRoute = withFinishingShot(drill({ skatePaths: [ROUTE] }));
    expect(withRoute.events).toHaveLength(1);

    const routesCleared = withFinishingShot({ ...withRoute, skatePaths: [] });
    expect(routesCleared.events).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// The machinery
// ----------------------------------------------------------------------------

describe('deriving it is safe to repeat', () => {
  it('returns the very same drill when nothing needs to change', () => {
    const once = withFinishingShot(drill({ skatePaths: [ROUTE] }));

    // Referential identity, not deep equality: `appReducer` reads a new object
    // as a document edit, so churning here would bump the revision - and
    // invalidate the review - on every single action.
    expect(withFinishingShot(once)).toBe(once);
  });

  it('never produces two shots, however many times it runs', () => {
    let result = drill({ events: [pass('p1', 'h11', 'h13')] });
    for (let index = 0; index < 5; index++) result = withFinishingShot(result);

    expect(result.events.filter(isAutoShot)).toHaveLength(1);
  });

  it('keeps the same id across re-derivations', () => {
    const once = withFinishingShot(drill({ skatePaths: [ROUTE] }));
    const moved = withFinishingShot({
      ...once,
      players: once.players.map(player =>
        player.id === 'h11' ? { ...player, x: 320 } : player
      ),
    });

    expect(finish(moved)?.id).toBe(finish(once)?.id);
  });

  it('re-sources a shot that got stranded mid-list by a later event', () => {
    // The reducer appends, so a new pass lands AFTER the derived shot. Treating
    // only a TRAILING shot as derived left the stale one looking authored, and
    // the drill grew a second shot on the next edit.
    const stranded = withFinishingShot(drill({ skatePaths: [ROUTE] }));
    const appended: Drill = {
      ...stranded,
      events: [...stranded.events, pass('p1', 'h11', 'h13')],
    };

    const result = withFinishingShot(appended);

    expect(result.events.filter(isAutoShot)).toHaveLength(1);
    expect(result.events.map(event => event.type)).toEqual(['pass', 'shot']);
    expect(finish(result)?.fromPlayerId).toBe('h13');
  });

  it('puts the shot last, after everything authored', () => {
    const result = withFinishingShot(
      drill({ events: [pass('p1', 'h11', 'h13'), pass('p2', 'h13', 'h87', 0.5, 0.6)] })
    );

    expect(isAutoShot(result.events[result.events.length - 1])).toBe(true);
  });

  it('releases the shot after the last pass has arrived', () => {
    const result = withFinishingShot(
      drill({ events: [pass('p1', 'h11', 'h13', 0.2, 0.55)] })
    );

    expect(finish(result)!.at).toBeGreaterThan(0.55);
  });
});

// ----------------------------------------------------------------------------
// Transparency to the rules
// ----------------------------------------------------------------------------

describe('the rest of the app sees through it', () => {
  const played = () => withFinishingShot(drill({ events: [pass('p1', 'h11', 'h13')] }));

  it('does not end the drill: more can still be added', () => {
    // A drill that ends with an AUTHORED shot is finished. This one is not,
    // or a play could never be extended past its own automatic ending.
    expect(canAddEvents(played().events)).toBe(true);
  });

  it('does not take the puck away from the carrier', () => {
    const state = played();
    expect(getCurrentPuckHolder(state.players, state.events)?.id).toBe('h13');
  });

  it('is not part of the authored chain', () => {
    const state = played();
    expect(authoredEvents(state.events)).toHaveLength(1);
    expect(authoredEvents(state.events)[0].type).toBe('pass');
  });

  it('strips every derived shot, not just a trailing one', () => {
    const shot = finish(played())!;
    const scrambled: DrillEvent[] = [shot, pass('p1', 'h11', 'h13'), shot];
    expect(authoredEvents(scrambled)).toHaveLength(1);
  });

  it('leaves an array with nothing to strip identical', () => {
    const events = [pass('p1', 'h11', 'h13')];
    expect(authoredEvents(events)).toBe(events);
  });
});

// ----------------------------------------------------------------------------
// Through the reducer, which is where it actually runs
// ----------------------------------------------------------------------------

describe('through the reducer', () => {
  function stateWith(d: Drill): AppState {
    return { ...createInitialState(), drill: d };
  }

  it('adds the shot when a pass is dispatched', () => {
    const next = appReducer(stateWith(drill()), {
      type: 'ADD_PASS',
      event: pass('p1', 'h11', 'h13'),
    });

    expect(next.drill.events.filter(isAutoShot)).toHaveLength(1);
  });

  it('moves the shot along as the chain grows', () => {
    let state = appReducer(stateWith(drill()), {
      type: 'ADD_PASS',
      event: pass('p1', 'h11', 'h13'),
    });
    state = appReducer(state, { type: 'ADD_PASS', event: pass('p2', 'h13', 'h87', 0.5, 0.6) });

    expect(state.drill.events.filter(isAutoShot)).toHaveLength(1);
    expect(finish(state.drill)?.fromPlayerId).toBe('h87');
  });

  it('takes the shot back to the previous carrier when a pass is removed', () => {
    let state = appReducer(stateWith(drill()), {
      type: 'ADD_PASS',
      event: pass('p1', 'h11', 'h13'),
    });
    state = appReducer(state, { type: 'ADD_PASS', event: pass('p2', 'h13', 'h87', 0.5, 0.6) });
    state = appReducer(state, { type: 'REMOVE_EVENT', id: 'p2' });

    expect(finish(state.drill)?.fromPlayerId).toBe('h13');
    expect(state.drill.events.filter(isAutoShot)).toHaveLength(1);
  });

  it('survives an undo and redo round trip without multiplying', () => {
    let state = appReducer(stateWith(drill()), {
      type: 'ADD_PASS',
      event: pass('p1', 'h11', 'h13'),
    });
    for (let index = 0; index < 3; index++) {
      state = appReducer(state, { type: 'POP_UNDO' });
      state = appReducer(state, { type: 'REDO' });
    }

    expect(state.drill.events.filter(isAutoShot)).toHaveLength(1);
    expect(authoredEvents(state.drill.events)).toHaveLength(1);
  });

  it('does not bump the document revision on an action that changes nothing else', () => {
    const start = appReducer(stateWith(drill()), {
      type: 'ADD_PASS',
      event: pass('p1', 'h11', 'h13'),
    });
    const revision = start.documentRevision;

    // A selection change is not a document edit, and re-deriving the shot on
    // the way through must not make it look like one.
    const selected = appReducer(start, { type: 'SELECT_PLAYER', id: 'h87' });
    expect(selected.documentRevision).toBe(revision);
  });
});
