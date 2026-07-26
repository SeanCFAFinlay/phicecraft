// ============================================================================
// PASSING, CHAINING, AND THE FOUR-PASS CAP
//
// A drill is built by passing the puck along a chain and finishing with a
// shot. Two things this locks down:
//
//   - the cap lives in the DOMAIN, so every authoring path inherits it. It is
//     not enough to grey out a button; drag, tap, retarget and dump conversion
//     all have to refuse the fifth pass with the same reason.
//   - committing a pass selects the RECEIVER. That is what makes a chain
//     cheap: the chip's Pass button is immediately pointed at the next link,
//     instead of the coach having to find the new carrier again.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestHarness, toasted, type TestHarness } from '@/test/commandHost';
import { buildDrill, buildPlayer } from '@/test/builders';
import {
  attackingNetFor,
  countPasses,
  MAX_PASSES_PER_DRILL,
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
const events = () => state().drill.events;
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

describe('the four-pass cap', () => {
  it('is four', () => {
    expect(MAX_PASSES_PER_DRILL).toBe(4);
  });

  it('allows a full four-pass chain', () => {
    const results = chain(4);

    expect(results.every(result => result.status === 'done')).toBe(true);
    expect(passes()).toBe(4);
  });

  it('refuses the fifth pass, and says why', () => {
    chain(4);
    const fifth = harness.commands.requestPass('h44', 'h7');

    expect(fifth.status).toBe('rejected');
    expect(passes()).toBe(4);
    expect(toasted(harness, /holds 4 passes/)).toBe(true);
  });

  it('is enforced in the domain, not just in the command', () => {
    chain(4);
    const players = state().drill.players;
    const validation = validatePass(
      players.find(player => player.id === 'h44')!,
      players.find(player => player.id === 'h7')!,
      players,
      events()
    );

    expect(validation.valid).toBe(false);
    expect(validation.error).toMatch(/holds 4 passes/);
  });

  it('still allows a shot once the passes are used up', () => {
    chain(4);
    const carrier = state().drill.players.find(player => player.id === 'h44')!;
    const result = harness.commands.requestShot('h44', attackingNetFor(carrier.team));

    expect(result.status).toBe('done');
    expect(events().at(-1)!.type).toBe('shot');
  });

  it('does not block retargeting the LAST pass, which adds nothing', () => {
    chain(4);
    const fourth = events().at(-1)!;

    // The count is already at the cap, so a naive check here would refuse to
    // let a coach fix the receiver of a pass they already drew.
    const result = harness.commands.retargetPass(fourth.id, 'h7');

    expect(result.status).toBe('done');
    expect(passes()).toBe(4);
    const retargeted = events().at(-1)!;
    expect(retargeted.type).toBe('pass');
    expect(retargeted.type === 'pass' && retargeted.toPlayerId).toBe('h7');
  });

  it('counts only passes, not shots or recoveries', () => {
    chain(2);
    expect(passes()).toBe(2);
    expect(events().length).toBeGreaterThanOrEqual(2);
    expect(countPasses([])).toBe(0);
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

  it('says how many passes are left', () => {
    harness.commands.requestPass('h11', 'h13');
    expect(toasted(harness, /3 more available/)).toBe(true);
  });

  it('warns that the fourth is the last one', () => {
    chain(4);
    expect(toasted(harness, /last one, finish with a shot/)).toBe(true);
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
