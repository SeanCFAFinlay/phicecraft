// ============================================================================
// REDUCER - editor session behaviour
//
// Split out from state.test.ts, which covers the drill document. This file
// covers the things Phase 4 and 5 changed: the three destructive clears, undo
// of settings and jerseys, document revisions, review completion, pending
// actions, selection vs inspectors, and the toast queue.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { authoredEvents } from '@/engine/puck';
import { appReducer, createInitialState } from './state';
import type { AppAction, AppState, PassEvent, Player, SkatePath, Toast } from './types';

function run(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(appReducer, state);
}

function player(id: string, x: number, y: number, hasPuck = false): Player {
  return { id, x, y, team: 'home', number: id, role: 'F', hasPuck };
}

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

// ============================================================================
// The three destructive clears
//
// These replace the single CLEAR_ALL_EVENTS, which removed routes as well as
// events while calling itself "clear all events". Each of the three now says
// exactly what it does, and leaves everything else alone.
// ============================================================================

describe('CLEAR_PUCK_ACTIONS', () => {
  it('removes events only, keeping routes, players, coaches and settings', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a') },
      { type: 'ADD_COACH', coach: { id: 'c1', x: 10, y: 10, name: 'Coach' } },
      { type: 'SET_JERSEY', team: 'home', hex: '#123456' },
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'CLEAR_PUCK_ACTIONS' }
    );

    // Clearing removes everything the coach authored. The route is still
    // there, and a route means a play, so the automatic finishing shot stays -
    // it is derived, not one of the puck actions being cleared.
    expect(authoredEvents(state.drill.events)).toEqual([]);
    expect(state.drill.skatePaths).toHaveLength(1);
    expect(state.drill.players).toHaveLength(2);
    expect(state.drill.coaches).toHaveLength(1);
    expect(state.drill.settings?.jerseys?.home).toBe('#123456');
  });

  it('leaves exactly one valid initial puck carrier', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'CLEAR_PUCK_ACTIONS' }
    );
    expect(state.drill.players.filter(p => p.hasPuck)).toHaveLength(1);
  });

  it('keeps the carrier who already had it rather than resetting to the first player', () => {
    const base = stateWithPlayers();
    const withSecondCarrier: AppState = {
      ...base,
      drill: {
        ...base.drill,
        players: [player('a', 0, 0, false), player('b', 100, 0, true)],
      },
    };
    const state = appReducer(withSecondCarrier, { type: 'CLEAR_PUCK_ACTIONS' });
    expect(state.drill.players.find(p => p.hasPuck)?.id).toBe('b');
  });

  it('is undoable', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'CLEAR_PUCK_ACTIONS' },
      { type: 'POP_UNDO' }
    );
    expect(authoredEvents(state.drill.events)).toHaveLength(1);
  });
});

describe('CLEAR_MOVEMENT_ROUTES', () => {
  it('removes routes only, keeping puck actions', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a') },
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'CLEAR_MOVEMENT_ROUTES' }
    );

    expect(state.drill.skatePaths).toEqual([]);
    expect(authoredEvents(state.drill.events)).toHaveLength(1);
    expect(state.drill.players).toHaveLength(2);
  });

  it('is undoable', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a') },
      { type: 'CLEAR_MOVEMENT_ROUTES' },
      { type: 'POP_UNDO' }
    );
    expect(state.drill.skatePaths).toHaveLength(1);
  });
});

describe('RESET_BOARD', () => {
  it('restores the default lineup and clears routes, events and coaches', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_SKATE_PATH', path: path('a') },
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'ADD_COACH', coach: { id: 'c1', x: 10, y: 10, name: 'Coach' } },
      { type: 'RESET_BOARD' }
    );

    expect(state.drill.skatePaths).toEqual([]);
    expect(state.drill.events).toEqual([]);
    expect(state.drill.coaches).toEqual([]);
    expect(state.drill.players.length).toBeGreaterThan(2);
    expect(state.drill.players.filter(p => p.hasPuck)).toHaveLength(1);
  });

  it('keeps the drill identity, name and settings', () => {
    const start = run(
      stateWithPlayers(),
      { type: 'RENAME_DRILL', name: 'My Breakout' },
      { type: 'SET_JERSEY', team: 'away', hex: '#00ff00' }
    );
    const state = appReducer(start, { type: 'RESET_BOARD' });

    expect(state.drill.id).toBe(start.drill.id);
    expect(state.drill.name).toBe('My Breakout');
    expect(state.drill.settings?.jerseys?.away).toBe('#00ff00');
  });

  it('is undoable', () => {
    const state = run(stateWithPlayers(), { type: 'RESET_BOARD' }, { type: 'POP_UNDO' });
    expect(state.drill.players).toHaveLength(2);
  });
});

// ============================================================================
// Undo snapshots now include settings, so jersey changes are undoable
// ============================================================================

describe('undo of jerseys and settings', () => {
  it('undoes and redoes setting the home jersey', () => {
    const start = stateWithPlayers();
    const changed = appReducer(start, { type: 'SET_JERSEY', team: 'home', hex: '#112233' });
    expect(changed.drill.settings?.jerseys?.home).toBe('#112233');

    const undone = appReducer(changed, { type: 'POP_UNDO' });
    expect(undone.drill.settings?.jerseys?.home).toBeUndefined();

    const redone = appReducer(undone, { type: 'REDO' });
    expect(redone.drill.settings?.jerseys?.home).toBe('#112233');
  });

  it('undoes and redoes setting the away jersey', () => {
    const changed = appReducer(stateWithPlayers(), {
      type: 'SET_JERSEY',
      team: 'away',
      hex: '#445566',
    });
    const undone = appReducer(changed, { type: 'POP_UNDO' });
    expect(undone.drill.settings?.jerseys?.away).toBeUndefined();
    expect(appReducer(undone, { type: 'REDO' }).drill.settings?.jerseys?.away).toBe('#445566');
  });

  it('undoes and redoes a jersey swap', () => {
    const coloured = run(
      stateWithPlayers(),
      { type: 'SET_JERSEY', team: 'home', hex: '#aaaaaa' },
      { type: 'SET_JERSEY', team: 'away', hex: '#bbbbbb' }
    );
    const swapped = appReducer(coloured, { type: 'SWAP_JERSEYS' });
    expect(swapped.drill.settings?.jerseys).toEqual({ home: '#bbbbbb', away: '#aaaaaa' });

    const undone = appReducer(swapped, { type: 'POP_UNDO' });
    expect(undone.drill.settings?.jerseys).toEqual({ home: '#aaaaaa', away: '#bbbbbb' });

    const redone = appReducer(undone, { type: 'REDO' });
    expect(redone.drill.settings?.jerseys).toEqual({ home: '#bbbbbb', away: '#aaaaaa' });
  });

  it('does not share a settings object between snapshots', () => {
    const first = appReducer(stateWithPlayers(), { type: 'SET_JERSEY', team: 'home', hex: '#111' });
    const second = appReducer(first, { type: 'SET_JERSEY', team: 'home', hex: '#222' });

    expect(first.undoStack[0].settings).not.toBe(second.undoStack[1].settings);
    expect(second.undoStack[0].settings?.jerseys?.home).toBeUndefined();
    expect(second.undoStack[1].settings?.jerseys?.home).toBe('#111');
  });

  it('resets history when another drill is loaded', () => {
    const edited = appReducer(stateWithPlayers(), { type: 'SET_JERSEY', team: 'home', hex: '#111' });
    expect(edited.undoStack).toHaveLength(1);

    const loaded = appReducer(edited, { type: 'LOAD_DRILL', drill: createInitialState().drill });
    expect(loaded.undoStack).toEqual([]);
    expect(loaded.redoStack).toEqual([]);
  });
});

// ============================================================================
// Document revision and review completion
// ============================================================================

describe('documentRevision', () => {
  it('increments on a drill edit', () => {
    const state = appReducer(stateWithPlayers(), { type: 'ADD_PASS', event: passEvent('a', 'b') });
    expect(state.documentRevision).toBe(1);
  });

  it('does not increment for a view-only action', () => {
    const edited = appReducer(stateWithPlayers(), { type: 'ADD_PASS', event: passEvent('a', 'b') });
    const viewed = run(edited, { type: 'SELECT_PLAYER', id: 'a' }, { type: 'TOGGLE_MENU' });
    expect(viewed.documentRevision).toBe(edited.documentRevision);
  });

  it('resets when a different drill is loaded', () => {
    const edited = appReducer(stateWithPlayers(), { type: 'ADD_PASS', event: passEvent('a', 'b') });
    const loaded = appReducer(edited, { type: 'LOAD_DRILL', drill: createInitialState().drill });
    expect(loaded.documentRevision).toBe(0);
  });
});

describe('review completion', () => {
  it('marks the current revision reviewed', () => {
    const edited = appReducer(stateWithPlayers(), { type: 'ADD_PASS', event: passEvent('a', 'b') });
    const reviewed = appReducer(edited, { type: 'MARK_REVIEWED' });
    expect(reviewed.reviewedRevision).toBe(reviewed.documentRevision);
  });

  it('is invalidated by any later edit', () => {
    const reviewed = run(
      stateWithPlayers(),
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'MARK_REVIEWED' }
    );
    const edited = appReducer(reviewed, { type: 'ADD_SKATE_PATH', path: path('a') });
    expect(edited.reviewedRevision).toBe(null);
  });

  it('is cleared when another drill is loaded', () => {
    const reviewed = appReducer(stateWithPlayers(), { type: 'MARK_REVIEWED' });
    const loaded = appReducer(reviewed, { type: 'LOAD_DRILL', drill: createInitialState().drill });
    expect(loaded.reviewedRevision).toBe(null);
  });
});

// ============================================================================
// Pending actions
// ============================================================================

describe('pending actions', () => {
  it('is cancelled when its subject is removed', () => {
    const armed = appReducer(stateWithPlayers(), {
      type: 'SET_PENDING_ACTION',
      action: { kind: 'pass', playerId: 'a' },
    });
    expect(armed.pendingAction).toEqual({ kind: 'pass', playerId: 'a' });

    const removed = appReducer(armed, { type: 'REMOVE_PLAYER', id: 'a' });
    expect(removed.pendingAction).toEqual({ kind: 'none' });
  });

  it('is cancelled when a different drill is loaded', () => {
    const armed = appReducer(stateWithPlayers(), {
      type: 'SET_PENDING_ACTION',
      action: { kind: 'pass', playerId: 'a' },
    });
    const loaded = appReducer(armed, { type: 'LOAD_DRILL', drill: createInitialState().drill });
    expect(loaded.pendingAction).toEqual({ kind: 'none' });
  });

  it('is cancelled when a blocking dialog opens', () => {
    const armed = appReducer(stateWithPlayers(), {
      type: 'SET_PENDING_ACTION',
      action: { kind: 'shoot', playerId: 'a' },
    });
    expect(appReducer(armed, { type: 'SHOW_RENAME_MODAL' }).pendingAction).toEqual({ kind: 'none' });
  });

  it('is cancelled when a sheet covers the rink', () => {
    const armed = appReducer(stateWithPlayers(), {
      type: 'SET_PENDING_ACTION',
      action: { kind: 'draw-route', playerId: 'a' },
    });
    expect(appReducer(armed, { type: 'OPEN_SHEET', sheet: 'more' }).pendingAction).toEqual({
      kind: 'none',
    });
  });

  it('clears the pass-from selection when cancelled', () => {
    const armed = run(
      stateWithPlayers(),
      { type: 'SET_PASS_FROM', id: 'a' },
      { type: 'SET_PENDING_ACTION', action: { kind: 'pass', playerId: 'a' } }
    );
    const cancelled = appReducer(armed, { type: 'CANCEL_PENDING_ACTION' });
    expect(cancelled.pendingAction).toEqual({ kind: 'none' });
    expect(cancelled.selection.passFromPlayerId).toBe(null);
  });

  it('survives an unrelated edit', () => {
    const armed = appReducer(stateWithPlayers(), {
      type: 'SET_PENDING_ACTION',
      action: { kind: 'pass', playerId: 'a' },
    });
    const moved = appReducer(armed, { type: 'MOVE_PLAYER', id: 'b', x: 5, y: 5 });
    expect(moved.pendingAction).toEqual({ kind: 'pass', playerId: 'a' });
  });
});

// ============================================================================
// Selection never opens an inspector on its own
// ============================================================================

describe('selection and inspectors', () => {
  it('selecting a player does not open the inspector', () => {
    const state = appReducer(stateWithPlayers(), { type: 'SELECT_PLAYER', id: 'a' });
    expect(state.selection.selectedPlayerId).toBe('a');
    expect(state.ui.inspector).toEqual({ kind: 'none' });
  });

  it('opening the inspector is a separate, explicit action', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'SELECT_PLAYER', id: 'a' },
      { type: 'OPEN_INSPECTOR', target: { kind: 'player', playerId: 'a' } }
    );
    expect(state.ui.inspector).toEqual({ kind: 'player', playerId: 'a' });
  });

  it('selecting a different player closes an open inspector', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'SELECT_PLAYER', id: 'a' },
      { type: 'OPEN_INSPECTOR', target: { kind: 'player', playerId: 'a' } },
      { type: 'SELECT_PLAYER', id: 'b' }
    );
    expect(state.ui.inspector).toEqual({ kind: 'none' });
  });

  it('selecting an event closes a player inspector', () => {
    const state = run(
      stateWithPlayers(),
      { type: 'ADD_PASS', event: passEvent('a', 'b') },
      { type: 'OPEN_INSPECTOR', target: { kind: 'player', playerId: 'a' } },
      { type: 'SELECT_EVENT', id: 'pass-a-b' }
    );
    expect(state.ui.inspector).toEqual({ kind: 'none' });
  });
});

// ============================================================================
// Toast queue
// ============================================================================

describe('toast queue', () => {
  const toast = (id: string, overrides: Partial<Toast> = {}): Toast => ({
    id,
    message: `message ${id}`,
    type: 'info',
    duration: 3000,
    role: 'status',
    priority: 1,
    dedupeKey: id,
    ...overrides,
  });

  it('shows the first toast immediately', () => {
    const state = appReducer(createInitialState(), { type: 'ENQUEUE_TOAST', toast: toast('a') });
    expect(state.ui.activeToast?.id).toBe('a');
    expect(state.ui.toastQueue).toEqual([]);
  });

  it('queues the next one behind it rather than replacing it', () => {
    const state = run(
      createInitialState(),
      { type: 'ENQUEUE_TOAST', toast: toast('a') },
      { type: 'ENQUEUE_TOAST', toast: toast('b') }
    );
    expect(state.ui.activeToast?.id).toBe('a');
    expect(state.ui.toastQueue.map(t => t.id)).toEqual(['b']);
  });

  it('promotes the queued toast when the active one is dismissed', () => {
    const queued = run(
      createInitialState(),
      { type: 'ENQUEUE_TOAST', toast: toast('a') },
      { type: 'ENQUEUE_TOAST', toast: toast('b') }
    );
    const state = appReducer(queued, { type: 'DISMISS_TOAST', id: 'a' });
    expect(state.ui.activeToast?.id).toBe('b');
    expect(state.ui.toastQueue).toEqual([]);
  });

  it('deduplicates a repeated hint', () => {
    const state = run(
      createInitialState(),
      { type: 'ENQUEUE_TOAST', toast: toast('a', { dedupeKey: 'hint' }) },
      { type: 'ENQUEUE_TOAST', toast: toast('b', { dedupeKey: 'hint' }) }
    );
    expect(state.ui.activeToast?.id).toBe('a');
    expect(state.ui.toastQueue).toEqual([]);
  });

  it('lets a failure take over from a routine success', () => {
    const state = run(
      createInitialState(),
      { type: 'ENQUEUE_TOAST', toast: toast('ok', { type: 'success', priority: 2 }) },
      {
        type: 'ENQUEUE_TOAST',
        toast: toast('fail', { type: 'error', priority: 4, role: 'alert', duration: 0 }),
      }
    );
    expect(state.ui.activeToast?.id).toBe('fail');
    expect(state.ui.activeToast?.role).toBe('alert');
  });

  it('never lets a routine success displace a failure', () => {
    const state = run(
      createInitialState(),
      {
        type: 'ENQUEUE_TOAST',
        toast: toast('fail', { type: 'error', priority: 4, role: 'alert', duration: 0 }),
      },
      { type: 'ENQUEUE_TOAST', toast: toast('ok', { type: 'success', priority: 2 }) }
    );
    expect(state.ui.activeToast?.id).toBe('fail');
    expect(state.ui.toastQueue.map(t => t.id)).toEqual(['ok']);
  });

  it('removes a queued toast without disturbing the active one', () => {
    const queued = run(
      createInitialState(),
      { type: 'ENQUEUE_TOAST', toast: toast('a') },
      { type: 'ENQUEUE_TOAST', toast: toast('b') }
    );
    const state = appReducer(queued, { type: 'DISMISS_TOAST', id: 'b' });
    expect(state.ui.activeToast?.id).toBe('a');
    expect(state.ui.toastQueue).toEqual([]);
  });

  it('clears everything', () => {
    const state = run(
      createInitialState(),
      { type: 'ENQUEUE_TOAST', toast: toast('a') },
      { type: 'ENQUEUE_TOAST', toast: toast('b') },
      { type: 'CLEAR_TOASTS' }
    );
    expect(state.ui.activeToast).toBe(null);
    expect(state.ui.toastQueue).toEqual([]);
  });
});
