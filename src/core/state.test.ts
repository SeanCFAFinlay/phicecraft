import { describe, it, expect } from 'vitest';
import { appReducer, createInitialState } from './state';
import { MAX_UNDO_STACK, RINK, MIN_ZOOM, MAX_ZOOM } from './constants';
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
    expect(state.playbackPositions).toEqual({});
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
      { type: 'SET_TOOL', tool: 'pass' },
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
      expect(state.drill.events).toHaveLength(0);
      state = appReducer(state, { type: 'REDO' });
      expect(state.drill.events).toHaveLength(1);
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

    expect(state.drill.events).toEqual([pass]);
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

    expect(state.drill.events).toEqual([retargeted]);
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
    expect(rebound.drill.events).toHaveLength(2);

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

describe('playback', () => {
  const playing = (progress: number) => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a') },
      { type: 'START_PLAYBACK' },
      { type: 'SET_PLAYBACK_PROGRESS', progress }
    );
    return state;
  };

  it('never moves players in the drill itself', () => {
    // This is the invariant that keeps an interrupted playback from
    // persisting animation frames as the drill's real state.
    const state = playing(0.5);
    expect(state.drill.players.find(p => p.id === 'a')).toMatchObject({ x: 0, y: 0 });
  });

  it('exposes interpolated positions separately', () => {
    const finished = playing(1);
    expect(finished.playbackPlayerFrames.a.routeProgress).toBe(1);
    expect(finished.playbackPositions.a.y).toBeGreaterThan(0);
  });

  it('clamps progress to 0..1', () => {
    expect(playing(5).playback.progress).toBe(1);
    expect(playing(-5).playback.progress).toBe(0);
  });

  it('derives fired events from progress', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'START_PLAYBACK' },
      { type: 'SET_PLAYBACK_PROGRESS', progress: 0.9 }
    );
    expect(state.playback.firedEvents).toEqual([0]);

    // Scrubbing back un-fires it.
    const back = appReducer(state, { type: 'SET_PLAYBACK_PROGRESS', progress: 0.1 });
    expect(back.playback.firedEvents).toEqual([]);
  });

  it('accumulates ghost trails only while playing', () => {
    const played = playing(0.5);
    expect(played.ghostTrails.get('a')?.length).toBeGreaterThan(0);

    const scrubbed = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a') },
      { type: 'SET_PLAYBACK_PROGRESS', progress: 0.5 }
    );
    expect(scrubbed.ghostTrails.size).toBe(0);
  });

  it('resets back to a clean slate', () => {
    const reset = appReducer(playing(0.8), { type: 'RESET_PLAYBACK' });
    expect(reset.playback.progress).toBe(0);
    expect(reset.playbackPositions).toEqual({});
    expect(reset.animatedPuck).toBeNull();
    expect(reset.ghostTrails.size).toBe(0);
  });

  it('keeps the chosen speed across a reset', () => {
    const state = run(stateWithPlayers(), { type: 'SET_PLAYBACK_SPEED', speed: 2 });
    expect(appReducer(state, { type: 'RESET_PLAYBACK' }).playback.speed).toBe(2);
  });

  it('restarts from zero', () => {
    expect(appReducer(playing(0.8), { type: 'START_PLAYBACK' }).playback.progress).toBe(0);
  });
});

describe('camera', () => {
  const sized = () =>
    appReducer(createInitialState(), { type: 'SET_CANVAS_SIZE', width: 1000, height: 500 });

  it('fits the rink on the first real canvas size', () => {
    const state = sized();
    expect(state.cameraUserAdjusted).toBe(false);
    expect(state.camera.zoom).toBeGreaterThan(0);
  });

  it('ignores a zero-sized canvas', () => {
    const state = appReducer(createInitialState(), {
      type: 'SET_CANVAS_SIZE',
      width: 0,
      height: 0,
    });
    expect(state.camera).toEqual(createInitialState().camera);
  });

  it('keeps re-fitting on resize until the user takes over', () => {
    // The first layout pass reports a stale height. Fitting only once left the
    // rink cropped, because the corrected size arrived on a later resize.
    const first = appReducer(createInitialState(), {
      type: 'SET_CANVAS_SIZE',
      width: 1000,
      height: 900, // too tall - layout hasn't settled
    });
    const corrected = appReducer(first, {
      type: 'SET_CANVAS_SIZE',
      width: 1000,
      height: 500,
    });

    expect(corrected.camera).not.toEqual(first.camera);
    expect(corrected.camera).toEqual(appReducer(corrected, { type: 'FIT_CAMERA' }).camera);
  });

  it('always fits the whole rink inside the canvas', () => {
    for (const [w, h] of [[1000, 500], [400, 900], [1600, 300], [900, 901]]) {
      const { camera } = appReducer(createInitialState(), {
        type: 'SET_CANVAS_SIZE',
        width: w,
        height: h,
      });
      expect(camera.x).toBeGreaterThanOrEqual(0);
      expect(camera.y).toBeGreaterThanOrEqual(0);
      expect(camera.x + RINK.width * camera.zoom).toBeLessThanOrEqual(w + 0.001);
      expect(camera.y + RINK.height * camera.zoom).toBeLessThanOrEqual(h + 0.001);
    }
  });

  it('leaves the camera alone on resize once the user has panned or zoomed', () => {
    // Refitting on every resize would throw away the user's zoom.
    const zoomed = appReducer(sized(), { type: 'ZOOM_TO_ZONE', zone: 'offensive' });
    const resized = appReducer(zoomed, { type: 'SET_CANVAS_SIZE', width: 800, height: 400 });
    expect(resized.camera).toEqual(zoomed.camera);
  });

  it('hands control back to auto-fit when the user asks for the full rink', () => {
    const zoomed = appReducer(sized(), { type: 'ZOOM_AT', factor: 3, screenPoint: { x: 0, y: 0 } });
    expect(zoomed.cameraUserAdjusted).toBe(true);

    const fitted = appReducer(zoomed, { type: 'FIT_CAMERA' });
    expect(fitted.cameraUserAdjusted).toBe(false);

    const resized = appReducer(fitted, { type: 'SET_CANVAS_SIZE', width: 600, height: 300 });
    expect(resized.camera).toEqual(appReducer(resized, { type: 'FIT_CAMERA' }).camera);
  });

  it('clamps zoom to the allowed range', () => {
    const state = sized();
    expect(appReducer(state, {
      type: 'SET_CAMERA',
      camera: { x: 0, y: 0, zoom: 500 },
    }).camera.zoom).toBe(MAX_ZOOM);

    expect(appReducer(state, {
      type: 'SET_CAMERA',
      camera: { x: 0, y: 0, zoom: 0.0001 },
    }).camera.zoom).toBe(MIN_ZOOM);
  });

  it('keeps the anchor point fixed when zooming at a point', () => {
    const state = appReducer(sized(), { type: 'SET_CAMERA', camera: { x: 0, y: 0, zoom: 1 } });
    const anchor = { x: 400, y: 300 };

    const zoomed = appReducer(state, { type: 'ZOOM_AT', factor: 2, screenPoint: anchor });

    // The world point under the anchor must still be under the anchor.
    const worldBefore = (anchor.x - state.camera.x) / state.camera.zoom;
    const worldAfter = (anchor.x - zoomed.camera.x) / zoomed.camera.zoom;
    expect(worldAfter).toBeCloseTo(worldBefore);
    expect(zoomed.camera.zoom).toBe(2);
  });

  it('centres the offensive zone right of the defensive zone', () => {
    const off = appReducer(sized(), { type: 'ZOOM_TO_ZONE', zone: 'offensive' });
    const def = appReducer(sized(), { type: 'ZOOM_TO_ZONE', zone: 'defensive' });
    expect(off.camera.x).toBeLessThan(def.camera.x);
  });

  it('fits the whole rink for the full zone', () => {
    const full = appReducer(sized(), { type: 'ZOOM_TO_ZONE', zone: 'full' });
    expect(full.camera.zoom).toBeCloseTo(appReducer(sized(), { type: 'FIT_CAMERA' }).camera.zoom);
  });

  it('centres the rink when fitted', () => {
    const state = appReducer(createInitialState(), {
      type: 'SET_CANVAS_SIZE',
      width: 1000,
      height: 1000,
    });
    const { camera } = state;
    const drawnHeight = RINK.height * camera.zoom;
    expect(camera.y).toBeCloseTo((1000 - drawnHeight) / 2);
  });
});

describe('CLEAR_ALL_EVENTS', () => {
  it('drops paths and events but keeps the players', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a') },
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'CLEAR_ALL_EVENTS' }
    );

    expect(state.drill.players).toHaveLength(2);
    expect(state.drill.skatePaths).toEqual([]);
    expect(state.drill.events).toEqual([]);
    expect(state.drill.players.filter(p => p.hasPuck)).toHaveLength(1);
  });

  it('is undoable', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'CLEAR_ALL_EVENTS' },
      { type: 'POP_UNDO' }
    );
    expect(state.drill.events).toHaveLength(1);
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
});
