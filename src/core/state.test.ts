import { describe, it, expect } from 'vitest';
import { authoredEvents } from '@/engine/puck';
import { appReducer, createInitialState } from './state';
import { MAX_UNDO_STACK } from './constants';
import type { AppState, AppAction, PassEvent, ShotEvent, DumpEvent, PickupEvent, SkatePath, Player } from './types';

/** Apply a sequence of actions to a starting state */
function run(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(appReducer, state);
}

/** A player with a predictable id, unlike engine/drill's uuid-generating one */
function player(id: string, x: number, y: number, hasPuck = false): Player {
  return { id, x, y, team: 'home', number: id, role: 'F', hasPuck };
}

/** A state with a known, minimal roster rather than the default lineup */
function stateWithPlayers(): AppState {
  const base = createInitialState();
  return {
    ...base,
    drill: {
      ...base.drill,
      players: [player('a', 0, 0, true), player('b', 100, 0)],
      skatePaths: [],
      events: [],
    },
  };
}

function passEvent(from: string, to: string): PassEvent {
  return {
    id: `pass-${from}-${to}`,
    type: 'pass',
    fromPlayerId: from,
    toPlayerId: to,
    fromPoint: { x: 0, y: 0 },
    toPoint: { x: 100, y: 0 },
    team: 'home',
  };
}

function shotEvent(from: string): ShotEvent {
  return {
    id: `shot-${from}`,
    type: 'shot',
    fromPlayerId: from,
    fromPoint: { x: 100, y: 0 },
    toPoint: { x: 980, y: 250 },
    targetNet: 'R',
    team: 'home',
    result: 'rebound',
  };
}

function dumpEvent(from: string): DumpEvent {
  return {
    id: `dump-${from}`,
    type: 'dump',
    fromPlayerId: from,
    fromPoint: { x: 0, y: 0 },
    toPoint: { x: 400, y: 200 },
    targetNet: 'dump',
    team: 'home',
    at: 0.2,
    arrivalAt: 0.4,
  };
}

function pickupEvent(playerId: string): PickupEvent {
  return {
    id: `pickup-${playerId}`,
    type: 'pickup',
    fromPlayerId: playerId,
    fromPoint: { x: 800, y: 250 },
    toPoint: { x: 800, y: 250 },
    team: 'home',
  };
}

function path(ownerId: string, id = `path-${ownerId}`): SkatePath {
  return {
    id,
    ownerId,
    team: 'home',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  };
}

describe('createInitialState', () => {
  it('starts with a drill, no history and nothing playing', () => {
    const state = createInitialState();
    expect(state.drill.players.length).toBeGreaterThan(0);
    expect(state.undoStack).toEqual([]);
    expect(state.redoStack).toEqual([]);
    expect(state.playback.isPlaying).toBe(false);
    // The playback FRAME is owned by src/playback/PlaybackStore now; the
    // reducer only carries the coarse lifecycle.
    expect(state.playback.lifecycle).toBe('ready');
    expect(state.documentRevision).toBe(0);
    expect(state.reviewedRevision).toBe(null);
    expect(state.pendingAction).toEqual({ kind: 'none' });
  });

  it('gives exactly one player the puck', () => {
    expect(createInitialState().drill.players.filter(p => p.hasPuck)).toHaveLength(1);
  });
});

describe('undo', () => {
  it('records an entry for adding a player, and reverses it', () => {
    const start = stateWithPlayers();
    const added = appReducer(start, {
      type: 'ADD_PLAYER',
      player: player('c', 5, 5),
    });

    expect(added.drill.players).toHaveLength(3);
    expect(added.undoStack).toHaveLength(1);

    const undone = appReducer(added, { type: 'POP_UNDO' });
    expect(undone.drill.players).toHaveLength(2);
    expect(undone.undoStack).toHaveLength(0);
  });

  it('reverses a skate path', () => {
    const start = stateWithPlayers();
    const withPath = appReducer(start, { type: 'ADD_SKATE_PATH', path: path('a') });
    expect(appReducer(withPath, { type: 'POP_UNDO' }).drill.skatePaths).toHaveLength(0);
  });

  it('reverses a pass', () => {
    const start = stateWithPlayers();
    const withPass = appReducer(start, { type: 'ADD_PASS', event: passEvent('a', 'b') });
    expect(appReducer(withPass, { type: 'POP_UNDO' }).drill.events).toHaveLength(0);
  });

  it('does nothing when there is no history', () => {
    const start = stateWithPlayers();
    expect(appReducer(start, { type: 'POP_UNDO' })).toBe(start);
  });

  it('does not record history for actions that changed nothing', () => {
    // SET_PUCK_CARRIER is rejected once events exist; it shouldn't leave a
    // dead undo entry behind that swallows the user's next undo.
    const withEvent = appReducer(stateWithPlayers(), {
      type: 'ADD_PASS',
      event: passEvent('a', 'b'),
    });
    const attempted = appReducer(withEvent, { type: 'SET_PUCK_CARRIER', id: 'b' });

    expect(attempted).toBe(withEvent);
    expect(attempted.undoStack).toHaveLength(1);
  });

  it('does not record history for view-only actions', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'SELECT_PLAYER', id: 'a' },
      { type: 'SET_TOOL', tool: 'home' },
      { type: 'TOGGLE_MENU' }
    );
    expect(state.undoStack).toEqual([]);
  });

  it('caps the stack, dropping the oldest entry', () => {
    let state = stateWithPlayers();
    for (let i = 0; i < MAX_UNDO_STACK + 5; i++) {
      state = appReducer(state, {
        type: 'ADD_PLAYER',
        player: player(`p${i}`, i, i),
      });
    }
    expect(state.undoStack).toHaveLength(MAX_UNDO_STACK);
  });

  it('snapshots deeply, so later edits cannot corrupt history', () => {
    const start = stateWithPlayers();
    const added = appReducer(start, { type: 'ADD_PASS', event: passEvent('a', 'b') });
    const moved = appReducer(added, { type: 'MOVE_PLAYER', id: 'a', x: 999, y: 999 });
    const undone = appReducer(moved, { type: 'POP_UNDO' });

    // The snapshot was taken before the pass, when 'a' was still at 0,0.
    expect(undone.drill.players.find(p => p.id === 'a')?.x).toBe(0);
  });
});

describe('redo', () => {
  it('reapplies an undone action', () => {
    const start = stateWithPlayers();
    const added = appReducer(start, {
      type: 'ADD_PLAYER',
      player: player('c', 5, 5),
    });
    const undone = appReducer(added, { type: 'POP_UNDO' });
    const redone = appReducer(undone, { type: 'REDO' });

    expect(redone.drill.players).toHaveLength(3);
    expect(redone.redoStack).toHaveLength(0);
    expect(redone.undoStack).toHaveLength(1);
  });

  it('does nothing when there is nothing to redo', () => {
    const start = stateWithPlayers();
    expect(appReducer(start, { type: 'REDO' })).toBe(start);
  });

  it('is cleared by a fresh edit, so history cannot fork', () => {
    const start = stateWithPlayers();
    const added = appReducer(start, {
      type: 'ADD_PLAYER',
      player: player('c', 5, 5),
    });
    const undone = appReducer(added, { type: 'POP_UNDO' });
    expect(undone.redoStack).toHaveLength(1);

    const diverged = appReducer(undone, { type: 'ADD_SKATE_PATH', path: path('a') });
    expect(diverged.redoStack).toEqual([]);
  });

  it('round-trips repeatedly', () => {
    let state = appReducer(stateWithPlayers(), { type: 'ADD_PASS', event: passEvent('a', 'b') });
    for (let i = 0; i < 3; i++) {
      state = appReducer(state, { type: 'POP_UNDO' });
      expect(authoredEvents(state.drill.events)).toHaveLength(0);
      state = appReducer(state, { type: 'REDO' });
      // The automatic finishing shot rides along; the AUTHORED chain is what
      // undo and redo are about.
      expect(authoredEvents(state.drill.events)).toHaveLength(1);
    }
  });
});

describe('REMOVE_PLAYER', () => {
  it('removes the player, their path and their events', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a') },
      { type: 'ADD_PASS', event: passEvent('a', 'b') }
    );

    const removed = appReducer(state, { type: 'REMOVE_PLAYER', id: 'a' });
    expect(removed.drill.players.map(p => p.id)).toEqual(['b']);
    expect(removed.drill.skatePaths).toHaveLength(0);
    expect(removed.drill.events).toHaveLength(0);
  });

  it('hands the puck to someone else when the carrier is removed', () => {
    // Otherwise the drill is left with no puck at all and passes stop working.
    const removed = appReducer(stateWithPlayers(), { type: 'REMOVE_PLAYER', id: 'a' });
    expect(removed.drill.players.filter(p => p.hasPuck)).toHaveLength(1);
  });

  it('clears the selection if the removed player was selected', () => {
    const selected = appReducer(stateWithPlayers(), { type: 'SELECT_PLAYER', id: 'a' });
    const removed = appReducer(selected, { type: 'REMOVE_PLAYER', id: 'a' });
    expect(removed.selection.selectedPlayerId).toBeNull();
  });
});

describe('SET_PUCK_CARRIER', () => {
  it('moves the puck and leaves exactly one carrier', () => {
    const state = appReducer(stateWithPlayers(), { type: 'SET_PUCK_CARRIER', id: 'b' });
    expect(state.drill.players.filter(p => p.hasPuck).map(p => p.id)).toEqual(['b']);
  });

  it('is rejected once events exist, since possession is then derived', () => {
    const withEvent = appReducer(stateWithPlayers(), {
      type: 'ADD_PASS',
      event: passEvent('a', 'b'),
    });
    expect(appReducer(withEvent, { type: 'SET_PUCK_CARRIER', id: 'b' })).toBe(withEvent);
  });
});

describe('ADD_SKATE_PATH', () => {
  it('replaces a player existing path rather than stacking a second one', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a', 'first') },
      { type: 'ADD_SKATE_PATH', path: path('a', 'second') }
    );
    expect(state.drill.skatePaths.map(p => p.id)).toEqual(['second']);
  });

  it('keeps paths belonging to other players', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a') },
      { type: 'ADD_SKATE_PATH', path: path('b') }
    );
    expect(state.drill.skatePaths).toHaveLength(2);
  });
});

describe('event results', () => {
  it('converts an open-ice dump into a caught player-to-player pass', () => {
    const dump = dumpEvent('a');
    const pass = { ...passEvent('a', 'b'), id: dump.id, catchResult: 'caught' as const };
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_DUMP', event: dump },
      { type: 'CONVERT_DUMP_TO_PASS', event: pass }
    );

    expect(authoredEvents(state.drill.events)).toEqual([pass]);
    expect(state.drill.events[0]).toMatchObject({ type: 'pass', toPlayerId: 'b', catchResult: 'caught' });
  });

  it('retargets a pass without changing its place in the event chain', () => {
    const original = passEvent('a', 'b');
    const retargeted = { ...original, toPlayerId: 'c', toPoint: { x: 200, y: 8 } };
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_PLAYER', player: player('c', 200, 0) },
      { type: 'ADD_PASS', event: original },
      { type: 'RETARGET_PASS', event: retargeted }
    );

    expect(authoredEvents(state.drill.events)).toEqual([retargeted]);
  });

  it('turns a pass into a miss and removes impossible downstream actions', () => {
    const first = passEvent('a', 'b');
    const second = { ...passEvent('b', 'a'), id: 'second-pass' };
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_PASS', event: first },
      { type: 'ADD_PASS', event: second },
      { type: 'UPDATE_PASS_RESULT', id: first.id, result: 'missed' }
    );

    expect(state.drill.events).toHaveLength(1);
    expect(state.drill.events[0]).toMatchObject({ id: first.id, catchResult: 'missed' });
  });

  it('keeps a rebound recovery but removes it when the shot becomes dead', () => {
    const shot = shotEvent('a');
    const recovered = run(
      stateWithPlayers(),
      { type: 'ADD_SHOT', event: shot },
      { type: 'ADD_PICKUP', event: pickupEvent('b') }
    );

    const rebound = appReducer(recovered, {
      type: 'UPDATE_SHOT_RESULT',
      id: shot.id,
      result: 'rebound',
    });
    expect(authoredEvents(rebound.drill.events)).toHaveLength(2);

    const covered = appReducer(rebound, {
      type: 'UPDATE_SHOT_RESULT',
      id: shot.id,
      result: 'save',
    });
    expect(covered.drill.events).toHaveLength(1);
    expect(covered.drill.events[0]).toMatchObject({ result: 'save' });
  });

  it('makes result changes undoable', () => {
    const pass = passEvent('a', 'b');
    const changed = run(
      stateWithPlayers(),
      { type: 'ADD_PASS', event: pass },
      { type: 'UPDATE_PASS_RESULT', id: pass.id, result: 'missed' }
    );
    const undone = appReducer(changed, { type: 'POP_UNDO' });
    expect(undone.drill.events[0]).not.toHaveProperty('catchResult');
  });
});



describe('NEW_DRILL / LOAD_DRILL', () => {
  it('clears history so you cannot undo into the previous drill', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'NEW_DRILL' }
    );
    expect(state.undoStack).toEqual([]);
    expect(state.redoStack).toEqual([]);
  });

  it('points currentDrillId at the loaded drill', () => {
    const base = createInitialState();
    const drill = { ...base.drill, id: 'other', name: 'Other' };
    expect(appReducer(base, { type: 'LOAD_DRILL', drill }).currentDrillId).toBe('other');
  });

  it('starts with no last-created drill', () => {
    expect(createInitialState().lastCreatedDrillId).toBeNull();
  });

  it('stamps lastCreatedDrillId on a fresh new drill, so a phone can recognize it without needing zero players', () => {
    const state = appReducer(createInitialState(), { type: 'NEW_DRILL' });
    expect(state.lastCreatedDrillId).toBe(state.drill.id);
    expect(state.currentDrillId).toBe(state.drill.id);
  });

  it('leaves lastCreatedDrillId alone when loading an existing drill', () => {
    const created = appReducer(createInitialState(), { type: 'NEW_DRILL' });
    const other = { ...created.drill, id: 'other', name: 'Other' };
    const loaded = appReducer(created, { type: 'LOAD_DRILL', drill: other });
    expect(loaded.lastCreatedDrillId).toBe(created.lastCreatedDrillId);
    expect(loaded.currentDrillId).toBe('other');
  });
});

describe('SET_MODE', () => {
  it('defaults to build', () => {
    expect(createInitialState().ui.mode).toBe('build');
  });

  it('entering preview clears the pending action and closes chrome', () => {
    let state = createInitialState();
    state = appReducer(state, { type: 'SET_PENDING_ACTION', action: { kind: 'pass', playerId: state.drill.players[0].id } });
    state = appReducer(state, { type: 'OPEN_SHEET', sheet: 'more' });
    state = appReducer(state, { type: 'SET_MODE', mode: 'preview' });
    expect(state.ui.mode).toBe('preview');
    expect(state.pendingAction.kind).toBe('none');
    expect(state.ui.openSheet).toBe('none');
    expect(state.ui.showMenu).toBe(false);
    expect(state.ui.inspector.kind).toBe('none');
  });

  it('outside build, document edits are ignored', () => {
    let state = createInitialState();
    const before = state.drill;
    const nonCarrierId = before.players.find(p => !p.hasPuck)!.id;
    state = appReducer(state, { type: 'SET_MODE', mode: 'preview' });
    const moved = appReducer(state, { type: 'SET_PUCK_CARRIER', id: nonCarrierId });
    expect(moved.drill).toBe(state.drill);
    expect(moved.undoStack).toBe(state.undoStack);
  });

  it('outside build, arming an action is ignored', () => {
    let state = createInitialState();
    state = appReducer(state, { type: 'SET_MODE', mode: 'present' });
    const armed = appReducer(state, { type: 'SET_PENDING_ACTION', action: { kind: 'pass', playerId: state.drill.players[0].id } });
    expect(armed.pendingAction.kind).toBe('none');
  });

  it('LOAD_DRILL still works outside build (library can hand over a drill)', () => {
    let state = createInitialState();
    state = appReducer(state, { type: 'SET_MODE', mode: 'preview' });
    const drill = { ...state.drill, id: 'other', name: 'Other' };
    const loaded = appReducer(state, { type: 'LOAD_DRILL', drill });
    expect(loaded.drill.id).toBe('other');
  });

  it('playback actions still work outside build', () => {
    let state = createInitialState();
    state = appReducer(state, { type: 'SET_MODE', mode: 'present' });
    state = appReducer(state, { type: 'START_PLAYBACK' });
    expect(state.playback.isPlaying).toBe(true);
  });
});
