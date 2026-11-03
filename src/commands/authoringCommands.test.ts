// ============================================================================
// AUTHORING COMMANDS
//
// The single authoring path. These are the hockey rules and the destructive
// semantics, exercised through the command layer every view calls.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { authoredEvents } from '@/engine/puck';
import { createTestHarness, lastToast, toasted, type TestHarness } from '@/test/commandHost';
import { buildDrill, buildDistinctiveRoute, buildPass, buildPlayer } from '@/test/builders';
import { RINK } from '@/core/constants';
import { RINK_MARGIN } from './authoringCommands';

let harness: TestHarness;

/** Home #11 carries; #13 is a teammate; #87 is an opponent. */
function twoTeams() {
  return buildDrill({
    players: [
      buildPlayer({ id: 'h11', number: '11', team: 'home', hasPuck: true, x: 360, y: 212.5 }),
      buildPlayer({ id: 'h13', number: '13', team: 'home', x: 280, y: 122.5 }),
      buildPlayer({ id: 'a87', number: '87', team: 'away', x: 640, y: 212.5 }),
    ],
  });
}

beforeEach(() => {
  harness = createTestHarness();
  harness.loadDrill(twoTeams());
});

// ----------------------------------------------------------------------------
// Placement
// ----------------------------------------------------------------------------

describe('addPlayer', () => {
  it('places a home player with a number no teammate is wearing', () => {
    const result = harness.commands.addPlayer({ x: 400, y: 200 }, 'home');
    expect(result.status).toBe('done');

    const added = harness.getState().drill.players.at(-1)!;
    expect(added.team).toBe('home');
    expect(added.number).not.toBe('11');
    expect(added.number).not.toBe('13');
  });

  it('gives a goalie to whichever team defends that end', () => {
    // Home defends the LEFT net, so a goalie placed on the left is home's.
    harness.commands.addPlayer({ x: 80, y: 212.5 }, 'goalie');
    expect(harness.getState().drill.players.at(-1)).toMatchObject({ team: 'home', role: 'G' });

    harness.commands.addPlayer({ x: 920, y: 212.5 }, 'goalie');
    expect(harness.getState().drill.players.at(-1)).toMatchObject({ team: 'away', role: 'G' });
  });

  it('clamps a placement outside the boards back onto the ice', () => {
    harness.commands.addPlayer({ x: -500, y: -500 }, 'home');
    const added = harness.getState().drill.players.at(-1)!;
    expect(added.x).toBeGreaterThanOrEqual(RINK.x);
    expect(added.y).toBeGreaterThanOrEqual(RINK.y);
  });

  it('says which team and number it placed', () => {
    harness.commands.addPlayer({ x: 400, y: 200 }, 'away');
    expect(lastToast(harness)?.message).toMatch(/^Away #\d+ placed$/);
  });
});

describe('removePlayer', () => {
  it('asks first, and cancelling changes nothing', async () => {
    harness.answerConfirm(false);
    const result = await harness.commands.removePlayer('h13');

    expect(result.status).toBe('cancelled');
    expect(harness.confirmations[0].title).toBe('Remove #13?');
    expect(harness.getState().drill.players).toHaveLength(3);
  });

  it('removes on confirmation and says what it removed', async () => {
    harness.answerConfirm(true);
    await harness.commands.removePlayer('h13');

    expect(harness.getState().drill.players.map(player => player.id)).toEqual(['h11', 'a87']);
    expect(toasted(harness, '#13 removed')).toBe(true);
  });

  it('rejects a player that is already gone', async () => {
    const result = await harness.commands.removePlayer('ghost');
    expect(result.status).toBe('rejected');
  });
});

describe('coaches', () => {
  it('places, moves and removes a coach', () => {
    const placed = harness.commands.addCoach({ x: 500, y: 100 });
    expect(placed.status).toBe('done');
    const id = placed.status === 'done' ? placed.value : '';

    harness.commands.moveCoach(id, 600, 150);
    expect(harness.getState().drill.coaches?.[0]).toMatchObject({ x: 600, y: 150 });

    harness.commands.removeCoach(id);
    expect(harness.getState().drill.coaches).toEqual([]);
  });
});

describe('equipment', () => {
  it('places and removes on-ice equipment items', () => {
    const placed = harness.commands.addEquipment('cone', { x: 300, y: 150 });
    expect(placed.status).toBe('done');
    const id = placed.status === 'done' ? placed.value : '';

    expect(harness.getState().drill.equipment?.[0]).toMatchObject({
      id,
      kind: 'cone',
      position: { x: 300, y: 150 },
    });

    harness.commands.removeEquipment(id);
    expect(harness.getState().drill.equipment).toEqual([]);
  });
});

describe('moving a player', () => {
  it('records ONE undo boundary for the whole gesture', () => {
    harness.commands.beginPlayerMove('h11');
    const undoAfterBegin = harness.getState().undoStack.length;

    for (let step = 0; step < 20; step++) {
      harness.commands.movePlayerTo('h11', 360 + step, 212.5);
    }

    expect(harness.getState().undoStack).toHaveLength(undoAfterBegin);
  });

  it('shows the pending action while moving', () => {
    harness.commands.beginPlayerMove('h11');
    expect(harness.getState().pendingAction).toEqual({ kind: 'move-player', playerId: 'h11' });
  });

  it('clamps the destination to the rink', () => {
    harness.commands.beginPlayerMove('h11');
    harness.commands.movePlayerTo('h11', 99_999, 99_999);

    const moved = harness.getState().drill.players.find(player => player.id === 'h11')!;
    expect(moved.x).toBeLessThanOrEqual(RINK.x + RINK.width - RINK_MARGIN);
    expect(moved.y).toBeLessThanOrEqual(RINK.y + RINK.height - RINK_MARGIN);
  });

  it('rejects moving a player that no longer exists', () => {
    expect(harness.commands.beginPlayerMove('ghost').status).toBe('rejected');
  });
});

// ----------------------------------------------------------------------------
// Puck actions
// ----------------------------------------------------------------------------

describe('requestPass', () => {
  it('accepts a pass to a teammate', () => {
    const result = harness.commands.requestPass('h11', 'h13');
    expect(result.status).toBe('done');
    expect(authoredEvents(harness.getState().drill.events)).toHaveLength(1);
    expect(toasted(harness, 'Pass to #13')).toBe(true);
  });

  it('rejects a pass to an opponent, and explains why', () => {
    const result = harness.commands.requestPass('h11', 'a87');

    expect(result.status).toBe('rejected');
    expect(harness.getState().drill.events).toHaveLength(0);
    expect(toasted(harness, /other team/)).toBe(true);
  });

  it('rejects a pass from someone who does not have the puck', () => {
    const result = harness.commands.requestPass('h13', 'h11');
    expect(result.status).toBe('rejected');
    expect(harness.getState().drill.events).toHaveLength(0);
  });

  it('rejects a pass to a player who is gone', () => {
    expect(harness.commands.requestPass('h11', 'ghost').status).toBe('rejected');
  });

  it('clears the pending action once the pass lands', () => {
    harness.commands.setPendingAction({ kind: 'pass', playerId: 'h11' });
    harness.commands.requestPass('h11', 'h13');
    expect(harness.getState().pendingAction).toEqual({ kind: 'none' });
  });

  it('releases the pass from an explicit origin point on the route, not the player', () => {
    harness.commands.commitRoute('h11', [{ x: 360, y: 212.5 }, { x: 450, y: 212.5 }]);
    const origin = { x: 420, y: 212.5 };
    const result = harness.commands.requestPass('h11', 'h13', { fromPoint: origin });
    expect(result.status).toBe('done');
    const pass = harness.getState().drill.events[0];
    expect(pass.fromPoint.x).toBeGreaterThan(360);
  });
});

describe('requestShot', () => {
  it('accepts a shot from the carrier', () => {
    const result = harness.commands.requestShot('h11', { x: RINK.netRightX, y: RINK.netRightY });
    expect(result.status).toBe('done');
    expect(harness.getState().drill.events[0]).toMatchObject({ type: 'shot', targetNet: 'R' });
  });

  it('records which net it was aimed at', () => {
    harness.commands.requestShot('h11', { x: RINK.netLeftX, y: RINK.netLeftY });
    expect(harness.getState().drill.events[0]).toMatchObject({ targetNet: 'L' });
  });

  it('rejects a shot from someone without the puck', () => {
    expect(
      harness.commands.requestShot('h13', { x: RINK.netRightX, y: RINK.netRightY }).status
    ).toBe('rejected');
  });

  it('accepts an explicit origin fromPoint when requesting shot', () => {
    const shotOrigin = { x: 600, y: 212 };
    const result = harness.commands.requestShot('h11', { x: RINK.netRightX, y: RINK.netRightY }, shotOrigin);
    expect(result.status).toBe('done');
    const shot = harness.getState().drill.events[0];
    expect(shot.fromPoint.x).toBe(shotOrigin.x);
    expect(shot.fromPoint.y).toBe(shotOrigin.y);
  });
});

describe('requestDump', () => {
  it('places the puck on open ice, inside the boards', () => {
    const result = harness.commands.requestDump('h11', { x: 99_999, y: 99_999 });
    expect(result.status).toBe('done');

    const dump = harness.getState().drill.events[0];
    expect(dump.type).toBe('dump');
    expect(dump.toPoint.x).toBeLessThanOrEqual(RINK.x + RINK.width);
  });

  it('is refused once the drill already ends with a shot', () => {
    harness.commands.requestShot('h11', { x: RINK.netRightX, y: RINK.netRightY });
    const result = harness.commands.requestDump('h11', { x: 700, y: 300 });

    expect(result.status).toBe('rejected');
    expect(toasted(harness, /already ends with a shot/)).toBe(true);
  });
});

describe('retargetPass', () => {
  beforeEach(() => {
    harness.commands.requestPass('h11', 'h13');
  });

  it('rejects retargeting to an opponent', () => {
    const eventId = harness.getState().drill.events[0].id;
    const result = harness.commands.retargetPass(eventId, 'a87');

    expect(result.status).toBe('rejected');
    expect(toasted(harness, /other team/)).toBe(true);
  });

  it('rejects a receiver that does not exist', () => {
    const eventId = harness.getState().drill.events[0].id;
    expect(harness.commands.retargetPass(eventId, 'ghost').status).toBe('rejected');
  });

  it('rejects retargeting a pass whose passer is no longer on the ice', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h13', number: '13', team: 'home' }),
          buildPlayer({ id: 'h44', number: '44', team: 'home' }),
        ],
        events: [buildPass({ id: 'p1', fromPlayerId: 'ghost-passer', toPlayerId: 'h13' })],
      })
    );
    expect(harness.commands.retargetPass('p1', 'h44').status).toBe('rejected');
  });

  it('rejects retargeting something that is not a pass', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', hasPuck: true }),
          buildPlayer({ id: 'h13', number: '13' }),
        ],
        events: [
          {
            id: 'dump-1',
            type: 'dump',
            fromPlayerId: 'h11',
            fromPoint: { x: 0, y: 0 },
            toPoint: { x: 100, y: 100 },
            targetNet: 'dump',
            team: 'home',
          },
        ],
      })
    );
    expect(harness.commands.retargetPass('dump-1', 'h13').status).toBe('rejected');
  });
});

describe('convertDumpToPass', () => {
  it('turns a dump into a pass to a teammate', () => {
    harness.commands.requestDump('h11', { x: 700, y: 300 });
    const eventId = harness.getState().drill.events[0].id;

    const result = harness.commands.convertDumpToPass(eventId, 'h13');
    expect(result.status).toBe('done');
    expect(harness.getState().drill.events[0]).toMatchObject({ type: 'pass', toPlayerId: 'h13' });
  });

  it('refuses to convert a dump into a cross-team pass', () => {
    harness.commands.requestDump('h11', { x: 700, y: 300 });
    const eventId = harness.getState().drill.events[0].id;

    expect(harness.commands.convertDumpToPass(eventId, 'a87').status).toBe('rejected');
    expect(harness.getState().drill.events[0].type).toBe('dump');
  });

  it('refuses to convert a dump whose source player is no longer on the ice', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'h13', number: '13', team: 'home' })],
        events: [
          {
            id: 'dump-1',
            type: 'dump',
            fromPlayerId: 'ghost-dumper',
            fromPoint: { x: 0, y: 0 },
            toPoint: { x: 100, y: 100 },
            targetNet: 'dump',
            team: 'home',
          },
        ],
      })
    );
    expect(harness.commands.convertDumpToPass('dump-1', 'h13').status).toBe('rejected');
  });
});

describe('requestPickup', () => {
  it('refuses when there is no loose puck yet', () => {
    const result = harness.commands.requestPickup('h13');
    expect(result.status).toBe('rejected');
    expect(toasted(harness, /no loose puck/i)).toBe(true);
  });

  it('refuses when the skater never gets near the puck', () => {
    harness.commands.requestDump('h11', { x: 900, y: 400 });
    const result = harness.commands.requestPickup('h13');

    expect(result.status).toBe('rejected');
    expect(toasted(harness, /cannot reach the puck/)).toBe(true);
  });

  it('recovers a loose puck when the skater is positioned to reach it', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', team: 'home', hasPuck: true, x: 360, y: 212.5 }),
          // Parked right where the dump below lands, so the timeline search
          // finds a sample within the 32px pickup radius.
          buildPlayer({ id: 'h13', number: '13', team: 'home', x: 700, y: 300 }),
        ],
      })
    );
    harness.commands.requestDump('h11', { x: 700, y: 300 });

    const result = harness.commands.requestPickup('h13');
    expect(result.status).toBe('done');
    const pickup = harness.getState().drill.events.find(e => e.type === 'pickup');
    expect(pickup).toBeDefined();
    expect(pickup?.fromPlayerId).toBe('h13');
    expect(toasted(harness, /recovers the puck/)).toBe(true);
  });
});

describe('removeEvent', () => {
  it('removes the event and closes the inspector', () => {
    harness.commands.requestPass('h11', 'h13');
    const eventId = harness.getState().drill.events[0].id;
    harness.commands.openEventInspector(eventId);

    harness.commands.removeEvent(eventId);
    expect(harness.getState().drill.events).toEqual([]);
    expect(harness.getState().ui.inspector).toEqual({ kind: 'none' });
  });

  it('rejects an event that is already gone', () => {
    expect(harness.commands.removeEvent('ghost').status).toBe('rejected');
  });
});

// ----------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------

describe('routes', () => {
  it('commits a drawn route and keeps its owner selected', () => {
    const points = Array.from({ length: 12 }, (_, index) => ({ x: 300 + index * 20, y: 200 }));
    const result = harness.commands.commitRoute('h13', points);

    expect(result.status).toBe('done');
    expect(harness.getState().drill.skatePaths).toHaveLength(1);
    expect(harness.getState().selection.selectedPlayerId).toBe('h13');
  });

  it('rejects a route with too few points to be a path', () => {
    expect(harness.commands.commitRoute('h13', [{ x: 1, y: 1 }]).status).toBe('rejected');
  });

  it('rejects a route for a player who is gone', () => {
    expect(harness.commands.commitRoute('ghost', [{ x: 1, y: 1 }, { x: 2, y: 2 }]).status).toBe(
      'rejected'
    );
  });

  it('clamps every committed point onto the rink', () => {
    harness.commands.commitRoute('h13', [
      { x: -9999, y: -9999 },
      { x: 9999, y: 9999 },
      { x: 500, y: 200 },
    ]);

    for (const point of harness.getState().drill.skatePaths[0].points) {
      expect(point.x).toBeGreaterThanOrEqual(RINK.x);
      expect(point.x).toBeLessThanOrEqual(RINK.x + RINK.width);
    }
  });

  it('updates the style without losing the other field', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'h13', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('h13')],
      })
    );

    harness.commands.updateRouteStyle('route-distinct', { mode: 'glide' });
    const route = harness.getState().drill.skatePaths[0];
    expect(route.mode).toBe('glide');
    // `finish` was 'coast' and must not have been reset by a partial update.
    expect(route.finish).toBe('coast');
  });

  it('keeps the existing mode when only finish is given', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'h13', hasPuck: true })],
        skatePaths: [buildDistinctiveRoute('h13')],
      })
    );

    harness.commands.updateRouteStyle('route-distinct', { finish: 'stop' });
    const route = harness.getState().drill.skatePaths[0];
    // `mode` was 'backward' and must not have been reset by a partial update.
    expect(route.mode).toBe('backward');
    expect(route.finish).toBe('stop');
  });

  it('ignores a style update for a route that is gone', () => {
    harness.commands.updateRouteStyle('ghost', { mode: 'glide' });
    expect(harness.getState().drill.skatePaths).toEqual([]);
  });

  it('removes a route', () => {
    harness.commands.commitRoute('h13', [
      { x: 300, y: 200 },
      { x: 400, y: 200 },
      { x: 500, y: 220 },
    ]);
    const id = harness.getState().drill.skatePaths[0].id;

    expect(harness.commands.removeRoute(id).status).toBe('done');
    expect(harness.getState().drill.skatePaths).toEqual([]);
  });
});

describe('route control point editing', () => {
  function threePointRoute() {
    harness.commands.commitRoute('h13', [
      { x: 280, y: 122.5 },
      { x: 380, y: 122.5 },
      { x: 480, y: 160 },
    ]);
    return harness.getState().drill.skatePaths[0].id;
  }

  it('moves an interior control point', () => {
    const id = threePointRoute();
    const result = harness.commands.moveRouteControl(id, 1, { x: 390, y: 150 });
    expect(result.status).toBe('done');
    const route = harness.getState().drill.skatePaths.find(p => p.id === id)!;
    expect(route.points[1]).toMatchObject({ x: 390, y: 150 });
  });

  it('refuses to move the starting point, which is pinned to the player', () => {
    const id = threePointRoute();
    const result = harness.commands.moveRouteControl(id, 0, { x: 390, y: 150 });
    expect(result.status).toBe('rejected');
  });

  it('refuses to move a point on a route that is gone', () => {
    expect(harness.commands.moveRouteControl('ghost', 1, { x: 1, y: 1 }).status).toBe('rejected');
  });

  it('inserts a new control point at an index', () => {
    const id = threePointRoute();
    const before = harness.getState().drill.skatePaths.find(p => p.id === id)!.points.length;
    const result = harness.commands.insertRouteControl(id, 1, { x: 330, y: 130 });
    expect(result.status).toBe('done');
    const route = harness.getState().drill.skatePaths.find(p => p.id === id)!;
    expect(route.points.length).toBe(before + 1);
  });

  it('refuses to insert a control point on a route that is gone', () => {
    expect(harness.commands.insertRouteControl('ghost', 1, { x: 1, y: 1 }).status).toBe('rejected');
  });

  it('removes an interior control point', () => {
    const id = threePointRoute();
    const before = harness.getState().drill.skatePaths.find(p => p.id === id)!.points.length;
    const result = harness.commands.removeRouteControl(id, 1);
    expect(result.status).toBe('done');
    const route = harness.getState().drill.skatePaths.find(p => p.id === id)!;
    expect(route.points.length).toBe(before - 1);
  });

  it('refuses to remove the starting point', () => {
    const id = threePointRoute();
    const result = harness.commands.removeRouteControl(id, 0);
    expect(result.status).toBe('rejected');
  });

  it('refuses to remove a point once the route is down to the minimum', () => {
    harness.commands.commitRoute('h13', [{ x: 280, y: 122.5 }, { x: 380, y: 122.5 }]);
    const id = harness.getState().drill.skatePaths[0].id;
    const result = harness.commands.removeRouteControl(id, 1);
    expect(result.status).toBe('rejected');
  });

  it('refuses to remove a control point on a route that is gone', () => {
    expect(harness.commands.removeRouteControl('ghost', 1).status).toBe('rejected');
  });

  it('is a no-op when setRouteShape is given the shape already in effect', () => {
    const id = threePointRoute();
    const before = harness.getState().drill.skatePaths.find(p => p.id === id)!.shape ?? 'spline';
    const result = harness.commands.setRouteShape(id, before);
    expect(result.status).toBe('done');
    expect(toasted(harness, /curves|straight/)).toBe(false);
  });

  it('changes the route shape and announces it', () => {
    const id = threePointRoute();
    const result = harness.commands.setRouteShape(id, 'polyline');
    expect(result.status).toBe('done');
    expect(harness.getState().drill.skatePaths.find(p => p.id === id)!.shape).toBe('polyline');
    expect(toasted(harness, /straight/)).toBe(true);
  });

  it('refuses setRouteShape for a route that is gone', () => {
    expect(harness.commands.setRouteShape('ghost', 'polyline').status).toBe('rejected');
  });

  it('simplifies a route with many points down to a comfortable handful', () => {
    harness.commands.commitRoute('h13', [{ x: 280, y: 122.5 }, { x: 480, y: 160 }]);
    const id = harness.getState().drill.skatePaths[0].id;
    // commitRoute already simplifies down to ROUTE_CONTROL_TARGET, so force a
    // route with more than MAX_COMFORTABLE_CONTROLS points directly.
    harness.dispatch({
      type: 'UPDATE_SKATE_POINTS',
      id,
      points: Array.from({ length: 20 }, (_, i) => ({ x: 280 + i * 20, y: 122.5 + (i % 2) * 10 })),
    });

    const result = harness.commands.simplifyRoute(id);
    expect(result.status).toBe('done');
    const route = harness.getState().drill.skatePaths.find(p => p.id === id)!;
    expect(route.points.length).toBeLessThan(20);
  });

  it('refuses to simplify a route that already has a handful of points', () => {
    const id = threePointRoute();
    const result = harness.commands.simplifyRoute(id);
    expect(result.status).toBe('rejected');
  });

  it('refuses to simplify a route that is gone', () => {
    expect(harness.commands.simplifyRoute('ghost').status).toBe('rejected');
  });
});

// ----------------------------------------------------------------------------
// Off-rink recovery
// ----------------------------------------------------------------------------

describe('recoverOffRinkObjects', () => {
  it('pulls players, coaches, routes and event endpoints back onto the ice', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'stray', hasPuck: true, x: -800, y: -800 }),
          buildPlayer({ id: 'ok', number: '13', x: 500, y: 200 }),
        ],
        coaches: [{ id: 'coach', x: 5000, y: 5000, name: 'Coach' }],
        skatePaths: [
          {
            id: 'route',
            ownerId: 'stray',
            team: 'home',
            mode: 'skate',
            finish: 'stop',
            points: [
              { x: -400, y: -400 },
              { x: 500, y: 200 },
            ],
          },
        ],
        events: [
          {
            id: 'dump',
            type: 'dump',
            fromPlayerId: 'stray',
            fromPoint: { x: 100, y: 100 },
            toPoint: { x: 4000, y: 4000 },
            targetNet: 'dump',
            team: 'home',
          },
        ],
      })
    );

    const result = harness.commands.recoverOffRinkObjects();
    expect(result.status).toBe('done');
    if (result.status === 'done') expect(result.value).toBe(4);

    const state = harness.getState();
    expect(state.drill.players.find(player => player.id === 'stray')!.x).toBeGreaterThanOrEqual(0);
    expect(state.drill.coaches![0].x).toBeLessThanOrEqual(RINK.x + RINK.width);
    expect(state.drill.skatePaths[0].points[0].x).toBeGreaterThanOrEqual(0);
    expect(state.drill.events[0].toPoint.x).toBeLessThanOrEqual(RINK.x + RINK.width);
  });

  it('says so when everything is already on the rink', () => {
    const result = harness.commands.recoverOffRinkObjects();
    expect(result.status === 'done' && result.value).toBe(0);
    expect(toasted(harness, 'already on the rink')).toBe(true);
  });

  it('leaves a shot ending in the net alone', () => {
    harness.commands.requestShot('h11', { x: RINK.netRightX, y: RINK.netRightY });
    const before = harness.getState().drill.events[0].toPoint;

    harness.commands.recoverOffRinkObjects();
    expect(harness.getState().drill.events[0].toPoint).toEqual(before);
  });
});

// ----------------------------------------------------------------------------
// Destructive clears
// ----------------------------------------------------------------------------

describe('destructive clears', () => {
  beforeEach(() => {
    harness.commands.commitRoute('h13', [
      { x: 300, y: 200 },
      { x: 400, y: 200 },
      { x: 500, y: 220 },
    ]);
    harness.commands.requestPass('h11', 'h13');
  });

  it('clearPuckActions asks, then removes events and keeps routes', async () => {
    harness.answerConfirm(true);
    const result = await harness.commands.clearPuckActions();

    expect(result.status).toBe('done');
    expect(harness.confirmations.at(-1)?.id).toBe('clear-puck-actions');
    expect(harness.getState().drill.events).toEqual([]);
    expect(harness.getState().drill.skatePaths).toHaveLength(1);
  });

  it('clearPuckActions cancels cleanly', async () => {
    harness.answerConfirm(false);
    const result = await harness.commands.clearPuckActions();

    expect(result.status).toBe('cancelled');
    expect(authoredEvents(harness.getState().drill.events)).toHaveLength(1);
  });

  it('clearMovementRoutes removes routes and keeps events', async () => {
    harness.answerConfirm(true);
    await harness.commands.clearMovementRoutes();

    expect(harness.getState().drill.skatePaths).toEqual([]);
    expect(authoredEvents(harness.getState().drill.events)).toHaveLength(1);
  });

  it('clearMovementRoutes cancels cleanly', async () => {
    harness.answerConfirm(false);
    const result = await harness.commands.clearMovementRoutes();

    expect(result.status).toBe('cancelled');
    expect(harness.getState().drill.skatePaths).toHaveLength(1);
  });

  it('resetBoard restores the lineup but keeps the name', async () => {
    harness.answerConfirm(true);
    await harness.commands.resetBoard();

    const state = harness.getState();
    expect(state.drill.skatePaths).toEqual([]);
    expect(state.drill.events).toEqual([]);
    expect(state.drill.players.length).toBeGreaterThan(3);
    expect(state.drill.name).toBe('Test Drill');
  });

  it('resetBoard cancels cleanly', async () => {
    harness.answerConfirm(false);
    expect((await harness.commands.resetBoard()).status).toBe('cancelled');
    expect(harness.getState().drill.players).toHaveLength(3);
  });

  it('refuses to clear what is not there', async () => {
    harness.answerConfirm(true);
    await harness.commands.clearPuckActions();
    await harness.commands.clearMovementRoutes();

    expect((await harness.commands.clearPuckActions()).status).toBe('rejected');
    expect((await harness.commands.clearMovementRoutes()).status).toBe('rejected');
  });
});

// ----------------------------------------------------------------------------
// Possession
// ----------------------------------------------------------------------------

describe('setPuckCarrier', () => {
  it('hands the puck over directly when no events exist', async () => {
    const result = await harness.commands.setPuckCarrier('h13');

    expect(result.status).toBe('done');
    expect(harness.confirmations).toHaveLength(0);
    expect(harness.getState().drill.players.find(player => player.hasPuck)!.id).toBe('h13');
  });

  it('asks before restarting a possession sequence that already exists', async () => {
    harness.commands.requestPass('h11', 'h13');
    harness.answerConfirm(true);

    await harness.commands.setPuckCarrier('a87');
    expect(harness.confirmations.at(-1)?.id).toBe('restart-possession');
    expect(harness.getState().drill.events).toEqual([]);
    expect(harness.getState().drill.players.find(player => player.hasPuck)!.id).toBe('a87');
  });

  it('cancelling leaves the existing sequence intact', async () => {
    harness.commands.requestPass('h11', 'h13');
    harness.answerConfirm(false);

    const result = await harness.commands.setPuckCarrier('a87');
    expect(result.status).toBe('cancelled');
    expect(authoredEvents(harness.getState().drill.events)).toHaveLength(1);
  });

  it('rejects a player who is gone', async () => {
    expect((await harness.commands.setPuckCarrier('ghost')).status).toBe('rejected');
  });
});

// ----------------------------------------------------------------------------
// Selection, inspectors, tools, history
// ----------------------------------------------------------------------------

describe('selection and inspectors', () => {
  it('selecting does not open an inspector', () => {
    harness.commands.selectPlayer('h11');
    expect(harness.getState().ui.inspector).toEqual({ kind: 'none' });
  });

  it('deselecting closes any open inspector', () => {
    harness.commands.openPlayerInspector('h11');
    harness.commands.selectPlayer(null);
    expect(harness.getState().ui.inspector).toEqual({ kind: 'none' });
  });

  it('closeInspector closes it', () => {
    harness.commands.openPlayerInspector('h11');
    harness.commands.closeInspector();
    expect(harness.getState().ui.inspector).toEqual({ kind: 'none' });
  });

  it('deselecting an event closes the event inspector', () => {
    harness.commands.requestPass('h11', 'h13');
    const eventId = harness.getState().drill.events[0].id;
    harness.commands.openEventInspector(eventId);
    harness.commands.selectEvent(null);
    expect(harness.getState().ui.inspector).toEqual({ kind: 'none' });
  });
});

describe('tools and steps', () => {
  it('changing tool cancels any pending action', () => {
    harness.commands.setPendingAction({ kind: 'pass', playerId: 'h11' });
    harness.commands.setTool('home');

    expect(harness.getState().ui.currentTool).toBe('home');
    expect(harness.getState().pendingAction).toEqual({ kind: 'none' });
  });

  it('sets the editor step', () => {
    harness.commands.setEditorStep('review');
    expect(harness.getState().ui.editorStep).toBe('review');
  });

  it('cancelling announces it, and does nothing when nothing is pending', () => {
    harness.commands.cancelPendingAction();
    expect(harness.announcements).toEqual([]);

    harness.commands.setPendingAction({ kind: 'shoot', playerId: 'h11' });
    harness.commands.cancelPendingAction();
    expect(harness.announcements).toContain('Action cancelled');
  });
});

describe('jerseys', () => {
  it('sets and swaps team colours', () => {
    harness.commands.setJersey('home', '#112233');
    expect(harness.getState().drill.settings?.jerseys?.home).toBe('#112233');

    harness.commands.swapJerseys();
    expect(harness.getState().drill.settings?.jerseys?.away).toBe('#112233');
    expect(toasted(harness, 'Team colours swapped')).toBe(true);
  });

  it('updates a skater visual profile', () => {
    harness.commands.updatePlayerVisual('h11', { handedness: 'left' });
    expect(harness.getState().drill.players[0].visual?.handedness).toBe('left');
  });
});

describe('history', () => {
  it('says so rather than silently doing nothing', () => {
    harness.commands.undo();
    expect(toasted(harness, 'Nothing to undo')).toBe(true);

    harness.commands.redo();
    expect(toasted(harness, 'Nothing to redo')).toBe(true);
  });

  it('undoes and redoes an edit, announcing each', () => {
    harness.commands.requestPass('h11', 'h13');
    harness.commands.undo();
    expect(harness.getState().drill.events).toEqual([]);
    expect(harness.announcements).toContain('Undone');

    harness.commands.redo();
    expect(authoredEvents(harness.getState().drill.events)).toHaveLength(1);
    expect(harness.announcements).toContain('Redone');
  });

  it('pushUndo records an explicit boundary', () => {
    harness.commands.pushUndo();
    expect(harness.getState().undoStack).toHaveLength(1);
  });
});

describe('event results and paths', () => {
  it('records a coach override on a pass', () => {
    harness.commands.requestPass('h11', 'h13');
    const eventId = harness.getState().drill.events[0].id;

    harness.commands.updatePassResult(eventId, 'missed');
    expect(harness.getState().drill.events[0]).toMatchObject({ catchResult: 'missed' });
  });

  it('records a coach override on a shot', () => {
    harness.commands.requestShot('h11', { x: RINK.netRightX, y: RINK.netRightY });
    const eventId = harness.getState().drill.events[0].id;

    harness.commands.updateShotResult(eventId, 'save');
    expect(harness.getState().drill.events[0]).toMatchObject({ result: 'save' });
  });

  it('re-aims a shot or dump, clamped to the rink', () => {
    harness.commands.requestDump('h11', { x: 700, y: 300 });
    const eventId = harness.getState().drill.events[0].id;

    harness.commands.setEventTarget(eventId, { x: 99_999, y: 99_999 });
    expect(harness.getState().drill.events[0].toPoint.x).toBeLessThanOrEqual(RINK.x + RINK.width);
  });

  it('refuses to re-aim a pass, which lands on its receiver', () => {
    harness.commands.requestPass('h11', 'h13');
    const eventId = harness.getState().drill.events[0].id;
    expect(harness.commands.setEventTarget(eventId, { x: 500, y: 200 }).status).toBe('rejected');
  });
});

describe('pass timing', () => {
  it('places a later pass after the previous one has arrived', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', hasPuck: true, x: 360, y: 212.5 }),
          buildPlayer({ id: 'h13', number: '13', x: 280, y: 122.5 }),
          buildPlayer({ id: 'h44', number: '44', x: 280, y: 302.5 }),
        ],
        events: [buildPass({ id: 'first', fromPlayerId: 'h11', toPlayerId: 'h13', at: 0.2, arrivalAt: 0.4 })],
      })
    );

    harness.commands.requestPass('h13', 'h44');
    const second = harness.getState().drill.events[1];
    expect(second.at!).toBeGreaterThan(0.4);
  });
});

describe('loadFormation', () => {
  it('applies dump routes and puck action as one undoable edit, keeping named players', async () => {
    harness.commands.updatePlayerIdentity('h11', { name: 'Alex', number: '13', role: 'C' });
    const original = structuredClone(harness.getState().drill);
    await harness.commands.loadFormation('dump-in-right-bottom');
    const drill = harness.getState().drill;
    expect(drill.events).toHaveLength(1);
    expect(drill.events[0].type).toBe('dump');
    expect(drill.skatePaths).toHaveLength(2);
    expect(drill.players.find(player => player.hasPuck)).toMatchObject({ name: 'Alex', number: '13' });
    expect(new Set(drill.players.filter(player => player.team === 'home').map(player => player.number)).size).toBe(2);
    harness.commands.undo();
    expect(harness.getState().drill.players).toEqual(original.players);
    expect(harness.getState().drill.events).toEqual(original.events);
    expect(harness.getState().drill.skatePaths).toEqual(original.skatePaths);
  });

  it('rejects quick setups outside Build without changing the lineup', async () => {
    const before = harness.getState().drill;
    harness.commands.setMode('preview');
    expect((await harness.commands.loadFormation('faceoff-center')).status).toBe('rejected');
    expect(harness.getState().drill).toBe(before);
  });
  it('loads a tactical formation immediately when board has no routes or events', async () => {
    const result = await harness.commands.loadFormation('pp-131');
    expect(result.status).toBe('done');

    const state = harness.getState();
    expect(state.drill.players.length).toBe(10);
    expect(state.drill.players.some(p => p.team === 'home' && p.number === '5' && p.hasPuck)).toBe(true);
    expect(toasted(harness, '1-3-1 Power Play formation loaded')).toBe(true);
  });

  it('prompts confirmation when board has drawn routes or events', async () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', hasPuck: true }),
          buildPlayer({ id: 'h13', number: '13' }),
        ],
        events: [buildPass({ id: 'p1', fromPlayerId: 'h11', toPlayerId: 'h13' })],
      })
    );

    harness.answerConfirm(false);
    const cancelledResult = await harness.commands.loadFormation('rush-3v2');
    expect(cancelledResult.status).toBe('cancelled');
    expect(harness.getState().drill.events.length).toBe(1);

    harness.answerConfirm(true);
    const confirmedResult = await harness.commands.loadFormation('rush-3v2');
    expect(confirmedResult.status).toBe('done');
    expect(harness.getState().drill.events.length).toBe(2);
    expect(harness.getState().drill.players.length).toBe(6);
  });

  it('bypasses confirmation modal when skipConfirm is true', async () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', hasPuck: true }),
          buildPlayer({ id: 'h13', number: '13' }),
        ],
        events: [buildPass({ id: 'p1', fromPlayerId: 'h11', toPlayerId: 'h13' })],
      })
    );
    const result = await harness.commands.loadFormation('rush-3v2', true);
    expect(result.status).toBe('done');
    expect(harness.getState().drill.events.length).toBe(2);
    expect(harness.getState().drill.players.length).toBe(6);
  });

  it('can be undone to restore the previous lineup', async () => {
    const originalCount = harness.getState().drill.players.length;
    await harness.commands.loadFormation('breakout-5v5');
    expect(harness.getState().drill.players.length).toBe(8);

    harness.commands.undo();
    expect(harness.getState().drill.players.length).toBe(originalCount);
  });
});

describe('opposing defense movement', () => {
  it('generates backward gap-control routes for defending team', () => {
    const res = harness.commands.generateOpposingDefense('gap');
    expect(res.status).toBe('done');
    if (res.status === 'done') {
      expect(res.value).toBeGreaterThan(0);
    }
    const opposingRoutes = harness.getState().drill.skatePaths.filter(p => p.team === 'away');
    expect(opposingRoutes.length).toBeGreaterThan(0);
    expect(opposingRoutes[0].mode).toBe('backward');
    expect(opposingRoutes[0].finish).toBe('stop');
  });

  it('generates forecheck pressure routes targeting the puck', () => {
    const res = harness.commands.generateOpposingDefense('forecheck');
    expect(res.status).toBe('done');
    const opposingRoutes = harness.getState().drill.skatePaths.filter(p => p.team === 'away');
    expect(opposingRoutes.length).toBeGreaterThan(0);
    expect(opposingRoutes[0].mode).toBe('skate');
  });

  it('gives all three forecheckers distinct roles when the opposing team has a full line', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', team: 'home', hasPuck: true, x: 500, y: 212.5 }),
          buildPlayer({ id: 'a1', number: '1', team: 'away', x: 600, y: 150 }),
          buildPlayer({ id: 'a2', number: '2', team: 'away', x: 650, y: 250 }),
          buildPlayer({ id: 'a3', number: '3', team: 'away', x: 700, y: 180 }),
        ],
      })
    );
    const res = harness.commands.generateOpposingDefense('forecheck');
    expect(res.status).toBe('done');
    const opposingRoutes = harness.getState().drill.skatePaths.filter(p => p.team === 'away');
    // Every skater beyond the first two gets the "support the far side" role.
    expect(opposingRoutes.length).toBe(3);
  });

  it('presses the puck location, not the holder, when no one has possession yet', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', team: 'home' }),
          buildPlayer({ id: 'a87', number: '87', team: 'away' }),
        ],
        initialPuck: { x: 250, y: 100 },
      })
    );
    const res = harness.commands.generateOpposingDefense('forecheck');
    expect(res.status).toBe('done');
    const route = harness.getState().drill.skatePaths.find(p => p.team === 'away')!;
    // Presses toward the initial puck spot (250, 100), not a default centre.
    expect(route.points[route.points.length - 1].x).toBeLessThan(400);
  });

  it('generates box-shift routes that slide toward the puck quadrant', () => {
    const res = harness.commands.generateOpposingDefense('box-shift');
    expect(res.status).toBe('done');
    if (res.status === 'done') {
      expect(res.value).toBeGreaterThan(0);
    }
    const opposingRoutes = harness.getState().drill.skatePaths.filter(p => p.team === 'away');
    expect(opposingRoutes.length).toBeGreaterThan(0);
    expect(opposingRoutes[0].mode).toBe('glide');
    expect(opposingRoutes[0].finish).toBe('stop');
  });

  it('generates backcheck routes sprinting through the middle lane', () => {
    const res = harness.commands.generateOpposingDefense('backcheck');
    expect(res.status).toBe('done');
    if (res.status === 'done') {
      expect(res.value).toBeGreaterThan(0);
    }
    const opposingRoutes = harness.getState().drill.skatePaths.filter(p => p.team === 'away');
    expect(opposingRoutes.length).toBeGreaterThan(0);
    expect(opposingRoutes[0].mode).toBe('skate');
    expect(opposingRoutes[0].finish).toBe('stop');
    // Backcheck is a three-point route through the middle lane (212.5).
    expect(opposingRoutes[0].points.length).toBe(3);
  });

  it('clears opposing routes while preserving home routes', () => {
    harness.commands.generateOpposingDefense('gap');
    expect(harness.getState().drill.skatePaths.length).toBeGreaterThan(0);

    const clearRes = harness.commands.clearOpposingRoutes();
    expect(clearRes.status).toBe('done');
    const remainingOpposing = harness.getState().drill.skatePaths.filter(p => p.team === 'away');
    expect(remainingOpposing.length).toBe(0);
  });

  it('replaces previous defending routes when changing defense tactics instead of stacking', () => {
    harness.commands.generateOpposingDefense('gap');
    const firstCount = harness.getState().drill.skatePaths.filter(p => p.team === 'away').length;
    expect(firstCount).toBeGreaterThan(0);

    harness.commands.generateOpposingDefense('forecheck');
    const secondCount = harness.getState().drill.skatePaths.filter(p => p.team === 'away').length;
    expect(secondCount).toBe(firstCount);
  });

  it('rejects clearing opposing routes when there are none', () => {
    const res = harness.commands.clearOpposingRoutes();
    expect(res.status).toBe('rejected');
  });

  it('creates a canonical defending D-pair when the opposing team has no skaters on the ice', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'h11', number: '11', team: 'home', hasPuck: true })],
      })
    );
    const res = harness.commands.generateOpposingDefense('gap');
    expect(res.status).toBe('done');
    const awaySkaters = harness.getState().drill.players.filter(p => p.team === 'away');
    expect(awaySkaters.length).toBe(2);
    expect(awaySkaters.every(p => p.role === 'D')).toBe(true);
  });
});

describe('coach drill tools and dump & chase', () => {
  it('generates dump and chase drill with puck dumped deep and forward pursuing', () => {
    const res = harness.commands.generateDumpAndChase('bottom-right');
    expect(res.status).toBe('done');
    const state = harness.getState();
    const dump = state.drill.events.find(e => e.type === 'dump');
    expect(dump).toBeDefined();
    expect(dump?.toPoint.x).toBe(885);
    expect(dump?.toPoint.y).toBe(350);

    // Chaser has skate path converging on corner
    const chasePath = state.drill.skatePaths.find(p => p.points.some(pt => pt.x === 885 && pt.y === 350));
    expect(chasePath).toBeDefined();
  });

  it('clears the dumper route and every prior puck action when regenerated on a staged sheet', () => {
    harness.commands.generateDumpAndChase('bottom-right');
    expect(harness.getState().drill.events.length).toBeGreaterThan(0);

    const res = harness.commands.generateDumpAndChase('top-left');
    expect(res.status).toBe('done');
    const state = harness.getState();
    expect(state.drill.events.length).toBe(1);
    expect(state.drill.events[0].toPoint).toMatchObject({ x: 115, y: 75 });
  });

  it('creates a chaser when the attacking team has only the dumper on the ice', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', team: 'home', hasPuck: true }),
          buildPlayer({ id: 'a87', number: '87', team: 'away' }),
        ],
      })
    );
    const before = harness.getState().drill.players.length;

    const res = harness.commands.generateDumpAndChase('bottom-right');
    expect(res.status).toBe('done');
    const state = harness.getState();
    expect(state.drill.players.length).toBe(before + 1);
    const chaser = state.drill.players.find(p => p.team === 'home' && p.id !== 'h11')!;
    expect(chaser).toBeDefined();
    expect(chaser.role).toBe('LW');
  });

  it('creates a dumper from scratch when the attacking team has only a goalie on the ice', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h-goalie', number: '30', team: 'home', role: 'G' }),
          buildPlayer({ id: 'a87', number: '87', team: 'away', hasPuck: true }),
        ],
      })
    );

    const res = harness.commands.generateDumpAndChase('bottom-right');
    expect(res.status).toBe('done');
    const state = harness.getState();
    // Away was holding the puck, so it's the attacking team; it had no
    // non-goalie skater, so one was created from scratch to dump it in.
    const dumper = state.drill.players.find(p => p.team === 'away')!;
    expect(dumper).toBeDefined();
    expect(dumper.role).toBe('C');
    expect(dumper.hasPuck).toBe(true);
  });

  it('picks the corner from the selected dumper and adds an F2 support route with a third attacker', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', team: 'home', hasPuck: true, y: 100 }),
          buildPlayer({ id: 'h13', number: '13', team: 'home', y: 150 }),
          buildPlayer({ id: 'h77', number: '77', team: 'home', y: 200 }),
          buildPlayer({ id: 'a87', number: '87', team: 'away' }),
        ],
      })
    );
    harness.commands.selectPlayer('h11');

    // No corner argument: falls back to the selected dumper's y to pick top/bottom.
    const res = harness.commands.generateDumpAndChase();
    expect(res.status).toBe('done');
    const state = harness.getState();
    const dump = state.drill.events.find(e => e.type === 'dump')!;
    expect(dump.toPoint.y).toBe(75);

    const f2Path = state.drill.skatePaths.find(p => p.ownerId === 'h77');
    expect(f2Path).toBeDefined();
    expect(f2Path?.finish).toBe('coast');

    const defenderPath = state.drill.skatePaths.find(p => p.ownerId === 'a87');
    expect(defenderPath).toBeDefined();
  });

  it('generates coach feed and one-timer shot on net', () => {
    const res = harness.commands.generateCoachFeed();
    expect(res.status).toBe('done');
    const state = harness.getState();
    const pass = state.drill.events.find(e => e.type === 'pass');
    const shot = state.drill.events.find(e => e.type === 'shot');
    expect(pass).toBeDefined();
    expect(shot).toBeDefined();
    expect(shot?.result).toBe('goal');
  });

  it('clears prior puck actions when the coach feed is regenerated on an already-staged sheet', () => {
    harness.commands.generateCoachFeed();
    expect(harness.getState().drill.events.length).toBeGreaterThan(0);

    const res = harness.commands.generateCoachFeed();
    expect(res.status).toBe('done');
    // Regenerating replaces, not stacks: still just a pass and a shot.
    expect(harness.getState().drill.events.length).toBe(2);
  });

  it('generates hard board rim and corner retrieval route', () => {
    const res = harness.commands.generateCoachRim();
    expect(res.status).toBe('done');
    const state = harness.getState();
    const rimDump = state.drill.events.find(e => e.type === 'dump');
    expect(rimDump).toBeDefined();
    expect(rimDump?.waypoints?.length).toBeGreaterThan(0);
    const retrieval = state.drill.skatePaths.find(p => p.points.some(pt => pt.x === 885 && pt.y === 75));
    expect(retrieval).toBeDefined();
  });

  it('clears the prior rim event and winger route when the coach rim drill is regenerated', () => {
    harness.commands.generateCoachRim();
    const firstWinger = harness.getState().drill.skatePaths.find(p =>
      p.points.some(pt => pt.x === 885 && pt.y === 75)
    )!;
    expect(firstWinger).toBeDefined();

    const res = harness.commands.generateCoachRim();
    expect(res.status).toBe('done');
    const state = harness.getState();
    expect(state.drill.events.filter(e => e.type === 'dump').length).toBe(1);
    expect(state.drill.skatePaths.filter(p => p.ownerId === firstWinger.ownerId).length).toBe(1);
  });

  it('creates every needed player from an empty sheet instead of relying on an existing roster', () => {
    // Dump & chase with fewer than two players on the ice takes the "apply
    // the full tactical preset" branch rather than assembling dumper/chaser
    // from an existing lineup.
    harness.loadDrill(buildDrill({ players: [] }));
    const res = harness.commands.generateDumpAndChase();
    expect(res.status).toBe('done');
    expect(harness.getState().drill.coaches?.length).toBeGreaterThan(0);
    expect(harness.getState().drill.events.some(e => e.type === 'dump')).toBe(true);
  });

  it('creates a feeder, shooter, defending goalie and coach from a bare sheet for the coach feed', () => {
    harness.loadDrill(buildDrill({ players: [] }));
    const res = harness.commands.generateCoachFeed();
    expect(res.status).toBe('done');
    const state = harness.getState();
    expect(state.drill.players.filter(p => p.team === 'home').length).toBe(2);
    expect(state.drill.players.some(p => p.team === 'away' && p.role === 'G')).toBe(true);
    expect(state.drill.coaches?.length).toBeGreaterThan(0);
  });

  it('creates a rimmer and winger from a bare sheet for the coach rim drill', () => {
    harness.loadDrill(buildDrill({ players: [] }));
    const res = harness.commands.generateCoachRim();
    expect(res.status).toBe('done');
    const state = harness.getState();
    expect(state.drill.players.filter(p => p.team === 'home').length).toBe(2);
    expect(state.drill.players.some(p => p.role === 'D')).toBe(true);
    expect(state.drill.players.some(p => p.role === 'LW')).toBe(true);
  });
});

describe('coach and equipment authoring & undo', () => {
  it('adds, selects, moves, deletes and undoes coach markers', () => {
    const addRes = harness.commands.addCoach({ x: 450, y: 80 });
    expect(addRes.status).toBe('done');
    expect(harness.getState().drill.coaches?.length).toBe(1);
    if (addRes.status !== 'done') throw new Error('addCoach failed');
    const coachId = addRes.value;

    harness.commands.selectCoach(coachId);
    expect(harness.getState().selection.selectedCoachId).toBe(coachId);

    harness.commands.moveCoach(coachId, 500, 100);
    const coach = harness.getState().drill.coaches?.find(c => c.id === coachId);
    expect(coach?.x).toBe(500);
    expect(coach?.y).toBe(100);

    // Undo moving coach
    harness.commands.undo();
    const coachAfterUndo = harness.getState().drill.coaches?.find(c => c.id === coachId);
    expect(coachAfterUndo?.x).toBe(450);
    expect(coachAfterUndo?.y).toBe(80);

    // Delete coach
    harness.commands.removeCoach(coachId);
    expect(harness.getState().drill.coaches?.length).toBe(0);
    expect(harness.getState().selection.selectedCoachId).toBeNull();

    // Undo deletion
    harness.commands.undo();
    expect(harness.getState().drill.coaches?.length).toBe(1);
  });

  it('adds, selects, deletes and undoes equipment', () => {
    const addRes = harness.commands.addEquipment('cone', { x: 300, y: 200 });
    expect(addRes.status).toBe('done');
    expect(harness.getState().drill.equipment?.length).toBe(1);
    if (addRes.status !== 'done') throw new Error('addEquipment failed');
    const equipId = addRes.value;

    harness.commands.selectEquipment(equipId);
    expect(harness.getState().selection.selectedEquipmentId).toBe(equipId);

    // Delete equipment
    harness.commands.removeEquipment(equipId);
    expect(harness.getState().drill.equipment?.length).toBe(0);
    expect(harness.getState().selection.selectedEquipmentId).toBeNull();

    // Undo deletion
    harness.commands.undo();
    expect(harness.getState().drill.equipment?.length).toBe(1);
  });
  it('moves equipment and supports undo/redo', () => {
    const addRes = harness.commands.addEquipment('tire', { x: 300, y: 200 });
    expect(addRes.status).toBe('done');
    if (addRes.status !== 'done') throw new Error('addEquipment failed');
    const equipId = addRes.value;

    harness.commands.moveEquipment(equipId, 450, 250);
    const moved = harness.getState().drill.equipment?.find(e => e.id === equipId);
    expect(moved?.position.x).toBe(450);
    expect(moved?.position.y).toBe(250);

    harness.commands.undo();
    const undone = harness.getState().drill.equipment?.find(e => e.id === equipId);
    expect(undone?.position.x).toBe(300);
    expect(undone?.position.y).toBe(200);

    harness.commands.redo();
    const redone = harness.getState().drill.equipment?.find(e => e.id === equipId);
    expect(redone?.position.x).toBe(450);
    expect(redone?.position.y).toBe(250);
  });
});

describe('bulk removal and object timing', () => {
  it('clears all equipment and supports undo', () => {
    harness.commands.addEquipment('cone', { x: 300, y: 200 });
    harness.commands.addEquipment('tire', { x: 350, y: 220 });
    expect(harness.getState().drill.equipment?.length).toBe(2);

    const clearRes = harness.commands.clearEquipment();
    expect(clearRes.status).toBe('done');
    expect(harness.getState().drill.equipment?.length).toBe(0);

    harness.commands.undo();
    expect(harness.getState().drill.equipment?.length).toBe(2);
  });

  it('rejects clearing equipment when there is none', () => {
    const res = harness.commands.clearEquipment();
    expect(res.status).toBe('rejected');
  });

  it('uses the singular when clearing exactly one piece of equipment', () => {
    harness.commands.addEquipment('cone', { x: 300, y: 200 });
    harness.commands.clearEquipment();
    expect(toasted(harness, 'Cleared 1 equipment item')).toBe(true);
  });

  it('clears opposing team players and supports undo', () => {
    harness.commands.addPlayer({ x: 600, y: 200 }, 'away');
    harness.commands.addPlayer({ x: 650, y: 250 }, 'away');
    const awayCount = harness.getState().drill.players.filter(p => p.team === 'away').length;
    expect(awayCount).toBeGreaterThanOrEqual(2);

    const res = harness.commands.clearOpponents();
    expect(res.status).toBe('done');
    expect(harness.getState().drill.players.filter(p => p.team === 'away').length).toBe(0);

    harness.commands.undo();
    expect(harness.getState().drill.players.filter(p => p.team === 'away').length).toBe(awayCount);
  });

  it('rejects clearing opponents when there are none', () => {
    harness.loadDrill(
      buildDrill({
        players: [buildPlayer({ id: 'h11', number: '11', team: 'home', hasPuck: true })],
      })
    );
    const res = harness.commands.clearOpponents();
    expect(res.status).toBe('rejected');
  });

  it('uses the singular when clearing exactly one opposing player', () => {
    harness.loadDrill(
      buildDrill({
        players: [
          buildPlayer({ id: 'h11', number: '11', team: 'home', hasPuck: true }),
          buildPlayer({ id: 'a87', number: '87', team: 'away' }),
        ],
      })
    );
    harness.commands.clearOpponents();
    expect(toasted(harness, 'Removed 1 opposing player')).toBe(true);
  });

  it('removes selected object via removeSelected', () => {
    const addRes = harness.commands.addEquipment('mini-net', { x: 400, y: 200 });
    if (addRes.status !== 'done') throw new Error('addEquipment failed');
    harness.commands.selectEquipment(addRes.value);

    const removeRes = harness.commands.removeSelected();
    expect(removeRes.status).toBe('done');
    expect(harness.getState().drill.equipment?.some(e => e.id === addRes.value)).toBe(false);
  });

  it('removes the selected player via removeSelected', async () => {
    harness.commands.selectPlayer('h13');
    const removeRes = harness.commands.removeSelected();
    expect(removeRes.status).toBe('done');
    // removeSelected hands off to the async removePlayer (which confirms
    // first) without awaiting it, so give that confirmation a tick to settle.
    await Promise.resolve();
    expect(harness.getState().drill.players.some(p => p.id === 'h13')).toBe(false);
  });

  it('removes the selected coach via removeSelected', () => {
    const addRes = harness.commands.addCoach({ x: 450, y: 80 });
    if (addRes.status !== 'done') throw new Error('addCoach failed');
    harness.commands.selectCoach(addRes.value);

    const removeRes = harness.commands.removeSelected();
    expect(removeRes.status).toBe('done');
    expect(harness.getState().drill.coaches?.some(c => c.id === addRes.value)).toBe(false);
  });

  it('removes the selected puck event via removeSelected', () => {
    harness.commands.requestPass('h11', 'h13');
    const eventId = harness.getState().drill.events[0].id;
    harness.commands.selectEvent(eventId);

    const removeRes = harness.commands.removeSelected();
    expect(removeRes.status).toBe('done');
    expect(harness.getState().drill.events.some(e => e.id === eventId)).toBe(false);
  });

  it('rejects removeSelected when nothing is selected', () => {
    const removeRes = harness.commands.removeSelected();
    expect(removeRes.status).toBe('rejected');
  });

  it('is a no-op when setEventShape is given the shape already in effect', () => {
    harness.commands.requestPass('h11', 'h13');
    const eventId = harness.getState().drill.events[0].id;
    const before = harness.getState().drill.events[0].shape ?? 'spline';

    const res = harness.commands.setEventShape(eventId, before);
    expect(res.status).toBe('done');
    expect(toasted(harness, /curves|straight/)).toBe(false);
  });

  it('changes the puck line shape and announces it', () => {
    harness.commands.requestPass('h11', 'h13');
    const eventId = harness.getState().drill.events[0].id;

    const res = harness.commands.setEventShape(eventId, 'polyline');
    expect(res.status).toBe('done');
    expect(harness.getState().drill.events[0].shape).toBe('polyline');
    expect(toasted(harness, /straight/)).toBe(true);
  });

  it('rejects setEventShape for a puck action that no longer exists', () => {
    expect(harness.commands.setEventShape('ghost', 'polyline').status).toBe('rejected');
  });

  it('snaps the shot origin onto a nearby route point without moving the player', () => {
    harness.commands.commitRoute('h11', [{ x: 360, y: 212.5 }, { x: 500, y: 212.5 }, { x: 650, y: 212.5 }]);
    harness.commands.requestShot('h11', { x: RINK.netRightX, y: RINK.netRightY });
    const shotEvent = harness.getState().drill.events[0];

    // 500,212.5 sits on the route, well within the 25px snap radius, so the
    // snap-to-route branch (not the "no route" or "far from route" branch)
    // runs. The blade position is sampled from the authored animation, so
    // it lands near the route rather than exactly on the clicked point.
    const res = harness.commands.setEventSource(shotEvent.id, { x: 500, y: 212.5 });
    expect(res.status).toBe('done');
    const moved = harness.getState().drill.events[0];
    expect(moved.fromPoint.x).toBeGreaterThan(360);
    expect(moved.fromPoint.x).toBeLessThan(650);
    expect(harness.getState().drill.players.find(p => p.id === 'h11')!.x).toBe(360);
  });

  it('extends the route to a far drag point when adjusting the shot origin', () => {
    harness.commands.commitRoute('h11', [{ x: 360, y: 212.5 }, { x: 500, y: 212.5 }]);
    harness.commands.requestShot('h11', { x: RINK.netRightX, y: RINK.netRightY });
    const shotEvent = harness.getState().drill.events[0];

    // Far from the existing route (>25px), so the last route point is
    // replaced with the drag target instead of snapping onto it.
    const res = harness.commands.setEventSource(shotEvent.id, { x: 500, y: 300 });
    expect(res.status).toBe('done');
    const route = harness.getState().drill.skatePaths.find(p => p.ownerId === 'h11')!;
    expect(route.points[route.points.length - 1]).toMatchObject({ x: 500, y: 300 });
  });

  it('moves the shooter directly when adjusting the shot origin with no authored route', () => {
    harness.commands.requestShot('h11', { x: RINK.netRightX, y: RINK.netRightY });
    const shotEvent = harness.getState().drill.events[0];

    const res = harness.commands.setEventSource(shotEvent.id, { x: 500, y: 300 });
    expect(res.status).toBe('done');
    expect(harness.getState().drill.players.find(p => p.id === 'h11')!).toMatchObject({ x: 500, y: 300 });
  });

  it('rejects setEventSource for a puck action that no longer exists', () => {
    expect(harness.commands.setEventSource('ghost', { x: 500, y: 300 }).status).toBe('rejected');
  });

  it('adjusts event timing via setEventTiming and syncs with skater route', () => {
    harness.commands.addPlayer({ x: 200, y: 200 }, 'home');
    const shooter = harness.getState().drill.players.find(p => p.team === 'home' && p.role !== 'G')!;
    harness.commands.commitRoute(shooter.id, [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 600, y: 200 }]);
    const shotRes = harness.commands.requestShot(shooter.id, { x: 900, y: 212.5 });
    expect(shotRes.status).toBe('done');

    const shotEvent = harness.getState().drill.events.find(e => e.type === 'shot')!;
    expect(shotEvent).toBeDefined();

    // Adjust timing to 50%
    const timingRes = harness.commands.setEventTiming(shotEvent.id, 0.5, true);
    expect(timingRes.status).toBe('done');

    const updated = harness.getState().drill.events.find(e => e.id === shotEvent.id)!;
    expect(updated.at).toBe(0.5);
    // Skater's route was from x=200 to x=600, so at 50% the position should be around x=400
    expect(updated.fromPoint.x).toBeCloseTo(400, 0);

    // Undo should restore previous timing
    harness.commands.undo();
    const undone = harness.getState().drill.events.find(e => e.id === shotEvent.id)!;
    expect(undone.at).not.toBe(0.5);
  });

  it('mirrors drill horizontally and vertically', () => {
    harness.commands.addPlayer({ x: 300, y: 100 }, 'home');
    const p = harness.getState().drill.players.find(pl => pl.x === 300 && pl.y === 100)!;
    expect(p).toBeDefined();

    // Mirror horizontal (top to bottom across y=212.5)
    // 212.5 * 2 - 100 = 325
    const mirrorHRes = harness.commands.mirrorDrill('horizontal');
    expect(mirrorHRes.status).toBe('done');
    const mirroredP = harness.getState().drill.players.find(pl => pl.id === p.id)!;
    expect(mirroredP.y).toBeCloseTo(325, 0);

    // Mirror vertical (end to end across x=500)
    // 500 * 2 - 300 = 700
    const mirrorVRes = harness.commands.mirrorDrill('vertical');
    expect(mirrorVRes.status).toBe('done');
    const mirroredEndToEnd = harness.getState().drill.players.find(pl => pl.id === p.id)!;
    expect(mirroredEndToEnd.x).toBeCloseTo(700, 0);

    // Undo should step back
    harness.commands.undo();
    expect(harness.getState().drill.players.find(pl => pl.id === p.id)!.x).toBeCloseTo(300, 0);
  });

  it('mirrors coaches, equipment, routes and puck action geometry along with players', () => {
    harness.commands.addCoach({ x: 450, y: 80 });
    harness.commands.addEquipment('cone', { x: 300, y: 100 });
    harness.commands.commitRoute('h13', [{ x: 280, y: 122.5 }, { x: 300, y: 90 }]);
    harness.commands.requestPass('h11', 'h13');

    const before = harness.getState().drill;
    const coachBefore = before.coaches![0];
    const equipBefore = before.equipment![0];
    const routeBefore = before.skatePaths.find(p => p.ownerId === 'h13')!;
    const eventBefore = before.events[0];

    const res = harness.commands.mirrorDrill('horizontal');
    expect(res.status).toBe('done');

    const after = harness.getState().drill;
    const coachAfter = after.coaches!.find(c => c.id === coachBefore.id)!;
    const equipAfter = after.equipment!.find(e => e.id === equipBefore.id)!;
    const routeAfter = after.skatePaths.find(p => p.id === routeBefore.id)!;
    const eventAfter = after.events.find(e => e.id === eventBefore.id)!;

    expect(coachAfter.y).toBeCloseTo(425 - coachBefore.y, 0);
    expect(equipAfter.position.y).toBeCloseTo(425 - equipBefore.position.y, 0);
    expect(routeAfter.points[0].y).toBeCloseTo(425 - routeBefore.points[0].y, 0);
    expect(eventAfter.fromPoint.y).toBeCloseTo(425 - eventBefore.fromPoint.y, 0);
    expect(eventAfter.toPoint.y).toBeCloseTo(425 - eventBefore.toPoint.y, 0);
  });

  describe('USA Hockey ADM / Station Splits & Route Drawing Modes', () => {
    it('sets up 3-station cross-ice divider barriers at both blue lines', () => {
      const res = harness.commands.setupStationSplit('cross-ice-3', 'defensive');
      expect(res.status).toBe('done');

      const equipment = harness.getState().drill.equipment ?? [];
      const bumpers = equipment.filter(e => e.kind === 'barrier');
      expect(bumpers.length).toBe(10); // 5 at x=375 and 5 at x=625
      expect(bumpers.every(b => b.rotation === Math.PI / 2)).toBe(true);

      const blueLeft = bumpers.filter(b => b.position.x === 375);
      const blueRight = bumpers.filter(b => b.position.x === 625);
      expect(blueLeft.length).toBe(5);
      expect(blueRight.length).toBe(5);
    });

    it('sets up 2-station half-ice split barriers along the red line', () => {
      const res = harness.commands.setupStationSplit('split-2', 'defensive');
      expect(res.status).toBe('done');

      const equipment = harness.getState().drill.equipment ?? [];
      const bumpers = equipment.filter(e => e.kind === 'barrier');
      expect(bumpers.length).toBe(5);
      expect(bumpers.every(b => b.position.x === 500)).toBe(true);
    });

    it('clears station split bumpers when switching back to full ice', () => {
      harness.commands.setupStationSplit('cross-ice-3');
      expect(harness.getState().drill.equipment?.length).toBeGreaterThan(0);

      const res = harness.commands.setupStationSplit('full');
      expect(res.status).toBe('done');
      const bumpers = (harness.getState().drill.equipment ?? []).filter(e => e.label?.startsWith('station-divider'));
      expect(bumpers.length).toBe(0);
    });

    it('commits route with backward skating mode and gap control', () => {
      const player = harness.getState().drill.players[0];
      const res = harness.commands.commitRoute(player.id, [
        { x: 300, y: 200 },
        { x: 250, y: 200 },
        { x: 200, y: 200 },
      ], 'backward');

      expect(res.status).toBe('done');
      if (res.status === 'done') {
        const route = harness.getState().drill.skatePaths.find(r => r.id === res.value);
        expect(route).toBeDefined();
        expect(route?.mode).toBe('backward');
      }
    });

    it('commits route with glide mode', () => {
      const player = harness.getState().drill.players[0];
      const res = harness.commands.commitRoute(player.id, [
        { x: 300, y: 200 },
        { x: 350, y: 200 },
        { x: 400, y: 200 },
      ], 'glide');

      expect(res.status).toBe('done');
      if (res.status === 'done') {
        const route = harness.getState().drill.skatePaths.find(r => r.id === res.value);
        expect(route).toBeDefined();
        expect(route?.mode).toBe('glide');
      }
    });
  });
});
