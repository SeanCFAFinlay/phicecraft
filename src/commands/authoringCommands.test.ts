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
