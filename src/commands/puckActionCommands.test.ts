// ============================================================================
// PASSING AND CHAINING, WITH NO CAP
//
// A drill is built by passing the puck along a chain. Two things this locks
// down:
//
//   - there is NO maximum number of passes. A cap of four used to live in the
//     domain, which made one-touch warm-ups, continuous passing patterns,
//     regroups, station circuits and anything that loops impossible to author
//     honestly. These tests exist to stop it coming back.
//   - committing a pass selects the RECEIVER. That is what makes a chain
//     cheap: the chip's Pass button is immediately pointed at the next link,
//     instead of the coach having to find the new carrier again.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestHarness, toasted, type TestHarness } from '@/test/commandHost';
import { buildDrill, buildPlayer } from '@/test/builders';
import {
  attackingNetFor,
  authoredEvents,
  countPasses,
  isAutoShot,
  validatePass,
} from '@/engine/puck';
import { RINK } from '@/core/constants';

let harness: TestHarness;

/** Six teammates, so a four-pass chain never has to pass to itself. */
const NUMBERS = ['11', '13', '87', '5', '44', '7'];

function lineup() {
  return buildDrill({
    players: NUMBERS.map((number, index) =>
      buildPlayer({
        id: `h${number}`,
        number,
        team: 'home',
        hasPuck: index === 0,
        x: 300 + index * 90,
        y: 200 + (index % 2) * 80,
      })
    ),
  });
}

const state = () => harness.getState();
/** The chain the coach authored, without the automatic finishing shot. */
const events = () => authoredEvents(state().drill.events);
const passes = () => countPasses(events());

/** Pass along the chain `count` times, 11 → 13 → 87 → 5 → 44. */
function chain(count: number) {
  const results = [];
  for (let index = 0; index < count; index++) {
    results.push(harness.commands.requestPass(`h${NUMBERS[index]}`, `h${NUMBERS[index + 1]}`));
  }
  return results;
}

beforeEach(() => {
  harness = createTestHarness();
  harness.loadDrill(lineup());
});

// ----------------------------------------------------------------------------
// The cap
// ----------------------------------------------------------------------------

describe('there is no pass cap', () => {
  it('allows a chain longer than the old limit of four', () => {
    const results = chain(5);

    expect(results.every(result => result.status === 'done')).toBe(true);
    expect(passes()).toBe(5);
  });

  it('does not refuse the fifth pass', () => {
    chain(4);
    const fifth = harness.commands.requestPass('h44', 'h7');

    // The regression: this used to be rejected with "A drill holds 4 passes",
    // a UI concern that had been written into the domain layer.
    expect(fifth.status).toBe('done');
    expect(passes()).toBe(5);
  });

  it('is unrestricted in the domain, not merely in the command layer', () => {
    chain(5);
    const players = state().drill.players;
    const validation = validatePass(
      players.find(player => player.id === 'h7')!,
      players.find(player => player.id === 'h11')!,
      players,
      events()
    );

    expect(validation.valid).toBe(true);
    expect(validation.error).toBeNull();
  });

  it('says nothing about a remaining allowance when a pass commits', () => {
    harness.commands.requestPass('h11', 'h13');

    expect(toasted(harness, /more available/)).toBe(false);
    expect(toasted(harness, /last one/)).toBe(false);
    expect(toasted(harness, 'Pass to #13')).toBe(true);
  });

  it('still refuses a pass that breaks a real hockey rule', () => {
    // Removing the cap must not remove the rules that are actually about
    // hockey rather than about diagram tidiness.
    const away = harness.commands.requestPass('h11', 'h11');
    expect(away.status).toBe('rejected');
  });

  it('allows a shot at any point in the chain', () => {
    chain(5);
    const carrier = state().drill.players.find(player => player.id === 'h7')!;
    const result = harness.commands.requestShot('h7', attackingNetFor(carrier.team));

    expect(result.status).toBe('done');
    expect(events().at(-1)!.type).toBe('shot');
  });

  it('does not block retargeting the last pass', () => {
    chain(4);
    const fourth = events().at(-1)!;
    expect(fourth.type).toBe('pass');

    const result = harness.commands.retargetPass(fourth.id, 'h7');

    expect(result.status).toBe('done');
    expect(passes()).toBe(4);
    const retargeted = events().at(-1)!;
    expect(retargeted.type === 'pass' && retargeted.toPlayerId).toBe('h7');
  });

  it('counts only passes, not shots or recoveries', () => {
    chain(2);
    expect(passes()).toBe(2);
    expect(countPasses([])).toBe(0);
  });
});

// ----------------------------------------------------------------------------
// A drill is not required to end with a shot
// ----------------------------------------------------------------------------

describe('the finish policy decides whether a shot is derived', () => {
  it('derives nothing by default, so a passing warm-up stays a passing warm-up', () => {
    chain(3);

    // The regression: every play used to grow a shot the moment the puck
    // moved, which misrepresents possession games, warm-ups, races and any
    // drill that ends at a zone exit or simply loops.
    expect(state().drill.events.some(isAutoShot)).toBe(false);
    expect(state().drill.events.every(event => event.type === 'pass')).toBe(true);
  });

  it('derives a finishing shot when the drill asks for one', () => {
    harness.loadDrill({
      ...lineup(),
      settings: { ...lineup().settings!, finishPolicy: 'finish-with-shot' },
    });
    chain(2);

    const finish = state().drill.events.at(-1)!;
    expect(isAutoShot(finish)).toBe(true);
    expect(finish.fromPlayerId).toBe('h87');
  });

  it('strips the derived shot when the policy is taken away again', () => {
    harness.loadDrill({
      ...lineup(),
      settings: { ...lineup().settings!, finishPolicy: 'finish-with-shot' },
    });
    chain(2);
    expect(state().drill.events.some(isAutoShot)).toBe(true);

    harness.commands.setFinishPolicy('none');
    expect(state().drill.events.some(isAutoShot)).toBe(false);
    expect(passes()).toBe(2);
  });
});

// ----------------------------------------------------------------------------
// Chaining
// ----------------------------------------------------------------------------

describe('chaining', () => {
  it('selects the receiver, so the next pass starts from the new carrier', () => {
    harness.commands.requestPass('h11', 'h13');

    // This is what turns a four-pass drill into four taps of Pass: the chip is
    // already showing #13, whose Pass button is the next link.
    expect(state().selection.selectedPlayerId).toBe('h13');
  });

  it('moves possession to the receiver each time', () => {
    chain(3);

    const holder = state().drill.players.find(player => player.id === 'h5');
    expect(holder).toBeDefined();
    expect(state().selection.selectedPlayerId).toBe('h5');
  });

  it('clears the pending action so the next tap is not swallowed', () => {
    harness.commands.setPendingAction({ kind: 'pass', playerId: 'h11' });
    harness.commands.requestPass('h11', 'h13');

    expect(state().pendingAction.kind).toBe('none');
  });
});

// ----------------------------------------------------------------------------
// Shooting needs no aim
// ----------------------------------------------------------------------------

describe('attackingNetFor', () => {
  it('sends home at the right net and away at the left', () => {
    expect(attackingNetFor('home')).toEqual({ x: RINK.netRightX, y: RINK.netRightY });
    expect(attackingNetFor('away')).toEqual({ x: RINK.netLeftX, y: RINK.netLeftY });
  });

  it('is enough on its own to fire a shot, with no second input', () => {
    // A team attacks exactly one net, so Shoot is a single tap rather than a
    // mode that then waits for the coach to point at something.
    const result = harness.commands.requestShot('h11', attackingNetFor('home'));

    expect(result.status).toBe('done');
    expect(events()).toHaveLength(1);
    expect(events()[0].type).toBe('shot');
  });
});
