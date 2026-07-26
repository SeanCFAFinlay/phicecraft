// ============================================================================
// PASS TARGETING
//
// The defect at the centre of this file: targeting used to rank EVERY player
// and route except the passer's, then hand the winner to the domain validator.
// An opponent standing between the passer and a teammate would win on distance
// and the pass would be refused - so the valid teammate behind them was
// effectively untappable, with nothing on screen explaining why.
//
// Eligibility is now decided before ranking. These tests exist to keep that
// ordering, because the bug is invisible until the ice is crowded.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  eligibleReceiverIds,
  eligibleReceivers,
  resolvePassTarget,
  ROUTE_SNAP_RADIUS,
  TOKEN_SNAP_RADIUS,
  type PassTargetContext,
} from './passTargetService';
import { buildDrill, buildPlayer } from '@/test/builders';
import type { Drill, ID, Point } from '@/core/types';

const PASSER = { x: 300, y: 212 };
const TEAMMATE = { x: 760, y: 212 };
/**
 * Directly between the passer and the teammate, nearer the passer, and far
 * enough from the teammate that the two cannot both be within one snap radius
 * - otherwise the teammate would legitimately win and the ordering bug this
 * file is about would be invisible.
 */
const OPPONENT = { x: 500, y: 212 };

function drillWith(overrides: Partial<Drill> = {}): Drill {
  return buildDrill({
    players: [
      buildPlayer({ id: 'h11', number: '11', team: 'home', hasPuck: true, ...PASSER }),
      buildPlayer({ id: 'h13', number: '13', team: 'home', ...TEAMMATE }),
      buildPlayer({ id: 'a87', number: '87', team: 'away', ...OPPONENT }),
    ],
    ...overrides,
  });
}

function contextFor(drill: Drill, passerId: ID = 'h11'): PassTargetContext {
  return {
    drill,
    passerId,
    positionOf: id => {
      const player = drill.players.find(item => item.id === id);
      return player ? { x: player.x, y: player.y } : { x: 0, y: 0 };
    },
    zoom: 1,
    departureAt: 0.2,
    from: PASSER,
  };
}

// ----------------------------------------------------------------------------
// Eligibility comes first
// ----------------------------------------------------------------------------

describe('eligibility is decided before ranking', () => {
  it('never returns an opponent as a receiver, even when it is nearest', () => {
    const context = contextFor(drillWith());

    // Pointer right on the opponent, who sits between passer and teammate.
    const result = resolvePassTarget(context, OPPONENT);

    expect(result.kind).not.toBe('receiver');
  });

  it('says which team the opponent is on rather than doing nothing', () => {
    const result = resolvePassTarget(contextFor(drillWith()), OPPONENT);

    expect(result.kind).toBe('opponent');
    expect(result.kind === 'opponent' && result.reason).toMatch(/other team/);
  });

  it('still finds the teammate behind an opponent', () => {
    // This is the regression: the opponent used to win on distance and the
    // teammate could not be selected at all.
    const result = resolvePassTarget(contextFor(drillWith()), TEAMMATE);

    expect(result.kind).toBe('receiver');
    expect(result.kind === 'receiver' && result.candidate.actorId).toBe('h13');
  });

  it('lists only teammates as eligible', () => {
    expect(eligibleReceiverIds(contextFor(drillWith()))).toEqual(['h13']);
  });

  it('excludes the passer from their own eligible set', () => {
    expect(eligibleReceiverIds(contextFor(drillWith()))).not.toContain('h11');
  });

  it('is empty when the passer does not have the puck', () => {
    const drill = drillWith();
    const context = contextFor(drill, 'h13');
    expect(eligibleReceiverIds(context)).toEqual([]);
  });

  it('is empty once the drill has ended', () => {
    const drill = drillWith({
      events: [
        {
          id: 's1',
          type: 'shot',
          fromPlayerId: 'h11',
          fromPoint: PASSER,
          toPoint: { x: 945, y: 212 },
          targetNet: 'R',
          team: 'home',
          at: 0.3,
          arrivalAt: 0.5,
        },
      ],
    });
    expect(eligibleReceiverIds(contextFor(drill))).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Drawn position, not authored position
// ----------------------------------------------------------------------------

describe('targeting follows where the player is drawn', () => {
  it('uses the scrubbed position the coach can actually see', () => {
    const drill = drillWith();
    const scrubbed: Point = { x: 500, y: 380 };
    const context: PassTargetContext = {
      ...contextFor(drill),
      positionOf: id => (id === 'h13' ? scrubbed : { x: 300, y: 212 }),
    };

    // Hit-testing used the authored start coordinates while the canvas drew
    // the scrubbed one, so after moving the playhead the visible player and
    // the pass target diverged.
    const atDrawn = resolvePassTarget(context, scrubbed);
    expect(atDrawn.kind).toBe('receiver');

    const atAuthored = resolvePassTarget(context, TEAMMATE);
    expect(atAuthored.kind).not.toBe('receiver');
  });
});

// ----------------------------------------------------------------------------
// Token beats route
// ----------------------------------------------------------------------------

describe('ranking', () => {
  const withRoute = () =>
    drillWith({
      skatePaths: [
        {
          id: 'r1',
          ownerId: 'h13',
          team: 'home',
          mode: 'skate',
          finish: 'stop',
          points: [TEAMMATE, { x: 760, y: 380 }],
        },
      ],
    });

  it('accepts a point on a teammate route as a target', () => {
    const result = resolvePassTarget(contextFor(withRoute()), { x: 760, y: 340 });

    expect(result.kind).toBe('receiver');
    expect(result.kind === 'receiver' && result.candidate.targetType).toBe('route');
    expect(result.kind === 'receiver' && result.candidate.actorId).toBe('h13');
  });

  it('prefers a direct token hit over a route hit at the same distance', () => {
    // Both the token and the far end of the route are candidates near here;
    // the token must win so tapping a player never authors a pass to a line.
    const result = resolvePassTarget(contextFor(withRoute()), TEAMMATE);

    expect(result.kind === 'receiver' && result.candidate.targetType).toBe('player');
  });

  it('ignores routes belonging to opponents', () => {
    const drill = drillWith({
      skatePaths: [
        {
          id: 'r1',
          ownerId: 'a87',
          team: 'away',
          mode: 'skate',
          finish: 'stop',
          points: [OPPONENT, { x: 500, y: 380 }],
        },
      ],
    });
    const result = resolvePassTarget(contextFor(drill), { x: 500, y: 340 });

    expect(result.kind).not.toBe('receiver');
  });

  it('respects the snap radii rather than grabbing the whole rink', () => {
    const context = contextFor(drillWith());
    const wellOutside = { x: TEAMMATE.x, y: TEAMMATE.y + TOKEN_SNAP_RADIUS + 60 };

    expect(resolvePassTarget(context, wellOutside).kind).toBe('miss');
    expect(ROUTE_SNAP_RADIUS).toBeLessThan(TOKEN_SNAP_RADIUS);
  });
});

// ----------------------------------------------------------------------------
// Misses and space
// ----------------------------------------------------------------------------

describe('a pointer that hits nothing', () => {
  it('is a miss that explains what to do, not a silent nothing', () => {
    const result = resolvePassTarget(contextFor(drillWith()), { x: 500, y: 60 });

    expect(result.kind).toBe('miss');
    expect(result.kind === 'miss' && result.reason).toMatch(/highlighted teammate/i);
  });

  it('becomes a pass to space only when the caller allows it', () => {
    const context = contextFor(drillWith());
    const openIce = { x: 500, y: 60 };

    // A tap must not author a pass nobody asked for; a drag to open ice must.
    expect(resolvePassTarget(context, openIce).kind).toBe('miss');
    expect(resolvePassTarget(context, openIce, { allowSpace: true }).kind).toBe('space');
  });

  it('reports an opponent rather than falling through to space', () => {
    const result = resolvePassTarget(contextFor(drillWith()), OPPONENT, { allowSpace: true });

    expect(result.kind).toBe('opponent');
  });
});

// ----------------------------------------------------------------------------
// Catch prediction
// ----------------------------------------------------------------------------

describe('catch prediction', () => {
  it('scores every eligible teammate', () => {
    const candidates = eligibleReceivers(contextFor(drillWith()));

    expect(candidates).toHaveLength(1);
    expect(candidates[0].actorId).toBe('h13');
    expect(candidates[0].predictedArrivalAt).toBeGreaterThan(0.2);
  });

  it('calls a standing receiver a clean catch', () => {
    const candidates = eligibleReceivers(contextFor(drillWith()));

    expect(candidates[0].predictedCatchQuality).toBe('clean');
    expect(candidates[0].eligibility).toBe('valid');
    expect(candidates[0].reason).toBeUndefined();
  });

  it('flags a receiver who has to keep skating to meet the puck', () => {
    const drill = drillWith({
      skatePaths: [
        {
          id: 'r1',
          ownerId: 'h13',
          team: 'home',
          mode: 'skate',
          finish: 'stop',
          points: [TEAMMATE, { x: 900, y: 380 }],
        },
      ],
    });
    const candidate = eligibleReceivers(contextFor(drill))[0];

    expect(candidate.predictedCatchQuality).not.toBe('clean');
    expect(candidate.reason).toBeTruthy();
  });

  it('gives a resolved target the same prediction as the candidate list', () => {
    const context = contextFor(drillWith());
    const listed = eligibleReceivers(context)[0];
    const resolved = resolvePassTarget(context, TEAMMATE);

    expect(resolved.kind === 'receiver' && resolved.candidate.predictedCatchQuality).toBe(
      listed.predictedCatchQuality
    );
  });
});
