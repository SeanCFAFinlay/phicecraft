// ============================================================================
// APPLICATION STATE - Reducer and initial state
//
// This reducer owns the PERSISTED DOCUMENT and the LOW-FREQUENCY EDITOR
// SESSION, and nothing else.
//
// Deliberately not here any more:
//   - camera        -> src/camera/CameraStore (changes on every pointer move)
//   - playback frame-> src/playback/PlaybackStore (changes 60x a second)
//   - pointer/drag  -> src/editor/input (transient, never rendered by React)
//
// Those all used to live in this object, which meant a pan, a pinch, or a
// single playback frame republished the whole application state and re-rendered
// every panel, toolbar and toast in the app.
// ============================================================================

import type {
  AppState,
  AppAction,
  Drill,
  Player,
  UndoSnapshot,
} from './types';
import {
  DEFAULT_PLAYBACK,
  DEFAULT_SELECTION,
  DEFAULT_UI,
  MAX_UNDO_STACK,
} from './constants';
import { DEFAULT_JERSEYS } from '@/core/types';
import { createDefaultPlayers, createNewDrill } from '@/engine/drill';
import { removePlayerFromEvents } from '@/engine/puck';

const FALLBACK_SETTINGS = {
  assistance: 'standard' as const,
  recovery: 'nearest-teammate' as const,
  timeLimitSeconds: 8,
  reducedEffects: false,
};

/**
 * Create initial application state
 */
export function createInitialState(): AppState {
  const drill = createNewDrill();

  return {
    drill,
    documentRevision: 0,
    reviewedRevision: null,
    pendingAction: { kind: 'none' },
    selection: { ...DEFAULT_SELECTION },
    playback: { ...DEFAULT_PLAYBACK },
    ui: { ...DEFAULT_UI },
    undoStack: [],
    redoStack: [],
    drillList: [],
    currentDrillId: drill.id,
  };
}

/**
 * Guarantee exactly one initial puck carrier, preferring whoever already had
 * it. Used by the clear commands, which must never leave a drill with no puck.
 */
function ensureSingleCarrier(players: Player[]): Player[] {
  if (players.length === 0) return players;
  const existing = players.findIndex(player => player.hasPuck);
  const carrierIndex = existing >= 0 ? existing : 0;
  return players.map((player, index) => ({ ...player, hasPuck: index === carrierIndex }));
}

/**
 * Create an undo snapshot of the drill's mutable content.
 *
 * structuredClone is a deep copy, so two snapshots never share a settings
 * object and a later edit cannot reach back and rewrite history.
 */
function createUndoSnapshot(drill: Drill): UndoSnapshot {
  return structuredClone({
    players: drill.players,
    skatePaths: drill.skatePaths,
    events: drill.events,
    coaches: drill.coaches ?? [],
    settings: drill.settings,
  });
}

function applySnapshot(state: AppState, snapshot: UndoSnapshot): Drill {
  return {
    ...state.drill,
    players: snapshot.players,
    skatePaths: snapshot.skatePaths,
    events: snapshot.events,
    coaches: snapshot.coaches ?? [],
    settings: snapshot.settings,
    updatedAt: Date.now(),
  };
}

/**
 * Actions that change drill content and should each be a single undo step.
 *
 * MOVE_PLAYER is deliberately absent: it fires continuously while dragging, so
 * the command layer dispatches PUSH_UNDO once when the gesture starts instead.
 */
const UNDOABLE_ACTIONS: ReadonlySet<AppAction['type']> = new Set([
  'ADD_PLAYER',
  'REMOVE_PLAYER',
  'SET_PUCK_CARRIER',
  'UPDATE_PLAYER_VISUAL',
  'SET_JERSEY',
  'SWAP_JERSEYS',
  'ADD_COACH',
  'REMOVE_COACH',
  'ADD_SKATE_PATH',
  'REMOVE_SKATE_PATH',
  'UPDATE_SKATE_PATH',
  'ADD_PASS',
  'ADD_SHOT',
  'ADD_DUMP',
  'ADD_PICKUP',
  'REMOVE_EVENT',
  'UPDATE_PASS_RESULT',
  'UPDATE_SHOT_RESULT',
  'CONVERT_DUMP_TO_PASS',
  'RETARGET_PASS',
  'CLEAR_PUCK_ACTIONS',
  'CLEAR_MOVEMENT_ROUTES',
  'RESET_BOARD',
]);

/** Actions that begin a fresh document; their history is dropped, not extended. */
const DOCUMENT_SWITCH_ACTIONS: ReadonlySet<AppAction['type']> = new Set(['NEW_DRILL', 'LOAD_DRILL']);

/**
 * Main application reducer.
 *
 * Wraps the core reducer to:
 *   - record undo history for drill-mutating actions, so individual call sites
 *     can't forget to,
 *   - bump `documentRevision` whenever the drill actually changes, which is
 *     what validation caches and review completion key off,
 *   - cancel any pending hockey action whose subject just disappeared.
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  const next = reduce(state, action);

  // Nothing changed (e.g. a rejected SET_PUCK_CARRIER) - don't record history.
  if (next === state) return state;

  let result = next;

  if (next.drill !== state.drill) {
    result = { ...result, documentRevision: state.documentRevision + 1 };
    // An edit invalidates any prior review of this drill.
    if (!DOCUMENT_SWITCH_ACTIONS.has(action.type)) {
      result = { ...result, reviewedRevision: null };
    }
  }

  if (DOCUMENT_SWITCH_ACTIONS.has(action.type)) {
    result = { ...result, documentRevision: 0, reviewedRevision: null };
  }

  result = cancelOrphanedPendingAction(result);

  if (UNDOABLE_ACTIONS.has(action.type) || action.type === 'PUSH_UNDO') {
    const undoStack = [...state.undoStack, createUndoSnapshot(state.drill)];
    if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    return { ...result, undoStack, redoStack: [] };
  }

  return result;
}

/**
 * Automatic cancellation: if the player, coach, route, or event a pending
 * action refers to has been removed, the action is dropped rather than left
 * pointing at nothing.
 */
function cancelOrphanedPendingAction(state: AppState): AppState {
  const pending = state.pendingAction;
  if (pending.kind === 'none') return state;

  const exists = (() => {
    switch (pending.kind) {
      case 'move-player':
      case 'draw-route':
      case 'pass':
      case 'shoot':
        return state.drill.players.some(player => player.id === pending.playerId);
      case 'move-coach':
        return (state.drill.coaches ?? []).some(coach => coach.id === pending.coachId);
      case 'edit-route':
        return state.drill.skatePaths.some(path => path.id === pending.pathId);
      case 'edit-event':
        return state.drill.events.some(event => event.id === pending.eventId);
    }
  })();

  return exists ? state : { ...state, pendingAction: { kind: 'none' } };
}

function reduce(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // ========================================================================
    // DRILL MANAGEMENT
    // ========================================================================

    case 'NEW_DRILL': {
      const drill = createNewDrill();
      return {
        ...state,
        drill,
        selection: { ...DEFAULT_SELECTION },
        pendingAction: { kind: 'none' },
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
        undoStack: [],
        redoStack: [],
        currentDrillId: drill.id,
      };
    }

    case 'LOAD_DRILL': {
      return {
        ...state,
        drill: action.drill,
        selection: { ...DEFAULT_SELECTION },
        pendingAction: { kind: 'none' },
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
        undoStack: [],
        redoStack: [],
        currentDrillId: action.drill.id,
      };
    }

    case 'RENAME_DRILL': {
      return {
        ...state,
        drill: { ...state.drill, name: action.name, updatedAt: Date.now() },
      };
    }

    case 'DELETE_DRILL': {
      return {
        ...state,
        drillList: state.drillList.filter(d => d.id !== action.id),
      };
    }

    case 'SET_DRILL_LIST': {
      return { ...state, drillList: action.drills };
    }

    // ========================================================================
    // PLAYER ACTIONS
    // ========================================================================

    case 'ADD_PLAYER': {
      return {
        ...state,
        drill: {
          ...state.drill,
          players: [...state.drill.players, action.player],
          updatedAt: Date.now(),
        },
      };
    }

    case 'REMOVE_PLAYER': {
      const players = state.drill.players.filter(p => p.id !== action.id);
      const skatePaths = state.drill.skatePaths.filter(sp => sp.ownerId !== action.id);
      const events = removePlayerFromEvents(action.id, state.drill.events);

      // Removing the initial carrier would leave the drill with no puck at all,
      // so hand it to whoever is left.
      const hasCarrier = players.some(p => p.hasPuck);
      const withPuck = hasCarrier || players.length === 0
        ? players
        : players.map((p, i) => ({ ...p, hasPuck: i === 0 }));

      return {
        ...state,
        drill: { ...state.drill, players: withPuck, skatePaths, events, updatedAt: Date.now() },
        selection: state.selection.selectedPlayerId === action.id
          ? { ...state.selection, selectedPlayerId: null }
          : state.selection,
      };
    }

    case 'MOVE_PLAYER': {
      return {
        ...state,
        drill: {
          ...state.drill,
          players: state.drill.players.map(p =>
            p.id === action.id ? { ...p, x: action.x, y: action.y } : p
          ),
          updatedAt: Date.now(),
        },
      };
    }

    case 'SET_JERSEY': {
      const jerseys = {
        home: state.drill.settings?.jerseys?.home ?? DEFAULT_JERSEYS.home,
        away: state.drill.settings?.jerseys?.away ?? DEFAULT_JERSEYS.away,
        [action.team]: action.hex,
      };
      return {
        ...state,
        drill: {
          ...state.drill,
          settings: { ...(state.drill.settings ?? FALLBACK_SETTINGS), jerseys },
          updatedAt: Date.now(),
        },
      };
    }

    case 'SWAP_JERSEYS': {
      const home = state.drill.settings?.jerseys?.home ?? DEFAULT_JERSEYS.home;
      const away = state.drill.settings?.jerseys?.away ?? DEFAULT_JERSEYS.away;
      return {
        ...state,
        drill: {
          ...state.drill,
          settings: {
            ...(state.drill.settings ?? FALLBACK_SETTINGS),
            jerseys: { home: away, away: home },
          },
          updatedAt: Date.now(),
        },
      };
    }

    case 'ADD_COACH': {
      return {
        ...state,
        drill: {
          ...state.drill,
          coaches: [...(state.drill.coaches ?? []), action.coach],
          updatedAt: Date.now(),
        },
      };
    }

    case 'MOVE_COACH': {
      return {
        ...state,
        drill: {
          ...state.drill,
          coaches: (state.drill.coaches ?? []).map(c =>
            c.id === action.id ? { ...c, x: action.x, y: action.y } : c
          ),
          updatedAt: Date.now(),
        },
      };
    }

    case 'REMOVE_COACH': {
      return {
        ...state,
        drill: {
          ...state.drill,
          coaches: (state.drill.coaches ?? []).filter(c => c.id !== action.id),
          updatedAt: Date.now(),
        },
      };
    }

    case 'UPDATE_SKATE_POINTS': {
      return {
        ...state,
        drill: {
          ...state.drill,
          skatePaths: state.drill.skatePaths.map(sp =>
            sp.id === action.id ? { ...sp, points: action.points } : sp
          ),
          updatedAt: Date.now(),
        },
      };
    }

    case 'UPDATE_EVENT_PATH': {
      return {
        ...state,
        drill: {
          ...state.drill,
          events: state.drill.events.map(ev => {
            if (ev.id !== action.id) return ev;
            const next = { ...ev };
            if (action.toPoint) next.toPoint = action.toPoint;
            if (action.via === null) delete next.via;
            else if (action.via) next.via = action.via;
            return next;
          }),
          updatedAt: Date.now(),
        },
      };
    }

    case 'UPDATE_PLAYER_VISUAL': {
      return {
        ...state,
        drill: {
          ...state.drill,
          players: state.drill.players.map(player => player.id === action.id
            ? { ...player, visual: { handedness: 'right', visor: true, ...player.visual, ...action.visual } }
            : player),
          updatedAt: Date.now(),
        },
      };
    }

    case 'SET_PUCK_CARRIER': {
      // The initial carrier only makes sense before any events exist; after
      // that possession is derived from the event chain.
      if (state.drill.events.length > 0) return state;

      return {
        ...state,
        drill: {
          ...state.drill,
          players: state.drill.players.map(p => ({ ...p, hasPuck: p.id === action.id })),
          updatedAt: Date.now(),
        },
      };
    }

    // ========================================================================
    // PATH ACTIONS
    // ========================================================================

    case 'ADD_SKATE_PATH': {
      // One path per player - a second drag replaces the first.
      const skatePaths = [
        ...state.drill.skatePaths.filter(sp => sp.ownerId !== action.path.ownerId),
        action.path,
      ];
      return {
        ...state,
        drill: { ...state.drill, skatePaths, updatedAt: Date.now() },
      };
    }

    case 'REMOVE_SKATE_PATH': {
      return {
        ...state,
        drill: {
          ...state.drill,
          skatePaths: state.drill.skatePaths.filter(sp => sp.id !== action.id),
          updatedAt: Date.now(),
        },
      };
    }

    case 'UPDATE_SKATE_PATH': {
      return {
        ...state,
        drill: {
          ...state.drill,
          skatePaths: state.drill.skatePaths.map(path => path.id === action.id ? { ...path, ...action.updates } : path),
          updatedAt: Date.now(),
        },
      };
    }

    // ========================================================================
    // EVENT ACTIONS
    // ========================================================================

    case 'ADD_PASS':
    case 'ADD_SHOT':
    case 'ADD_DUMP':
    case 'ADD_PICKUP': {
      return {
        ...state,
        drill: {
          ...state.drill,
          events: [...state.drill.events, action.event],
          updatedAt: Date.now(),
        },
      };
    }

    case 'REMOVE_EVENT': {
      return {
        ...state,
        drill: {
          ...state.drill,
          events: state.drill.events.filter(e => e.id !== action.id),
          updatedAt: Date.now(),
        },
      };
    }

    case 'UPDATE_PASS_RESULT': {
      const eventIndex = state.drill.events.findIndex(event => event.id === action.id);
      const updatedEvents = state.drill.events.map(event =>
        event.id === action.id && event.type === 'pass'
          ? { ...event, catchResult: action.result }
          : event
      );
      return {
        ...state,
        drill: {
          ...state.drill,
          // A miss breaks possession. Later authored actions are no longer
          // physically valid and must be rebuilt after a recovery.
          events: action.result === 'missed' && eventIndex >= 0
            ? updatedEvents.slice(0, eventIndex + 1)
            : updatedEvents,
          updatedAt: Date.now(),
        },
      };
    }

    case 'UPDATE_SHOT_RESULT': {
      const eventIndex = state.drill.events.findIndex(event => event.id === action.id);
      const updatedEvents = state.drill.events.map(event =>
        event.id === action.id && event.type === 'shot'
          ? { ...event, result: action.result }
          : event
      );
      return {
        ...state,
        drill: {
          ...state.drill,
          events: action.result !== undefined && action.result !== 'rebound' && eventIndex >= 0
            ? updatedEvents.slice(0, eventIndex + 1)
            : updatedEvents,
          updatedAt: Date.now(),
        },
      };
    }

    case 'CONVERT_DUMP_TO_PASS':
    case 'RETARGET_PASS': {
      return {
        ...state,
        drill: {
          ...state.drill,
          events: state.drill.events.map(existing =>
            existing.id === action.event.id ? action.event : existing
          ),
          updatedAt: Date.now(),
        },
      };
    }

    // ========================================================================
    // DESTRUCTIVE CLEARS
    //
    // Three commands, three exact meanings. Each one says in its name what it
    // removes, and each leaves everything else alone. The single
    // "Clear all events" this replaced removed routes too.
    // ========================================================================

    case 'CLEAR_PUCK_ACTIONS': {
      return {
        ...state,
        drill: {
          ...state.drill,
          events: [],
          players: ensureSingleCarrier(state.drill.players),
          updatedAt: Date.now(),
        },
        selection: { ...DEFAULT_SELECTION },
        pendingAction: { kind: 'none' },
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
      };
    }

    case 'CLEAR_MOVEMENT_ROUTES': {
      return {
        ...state,
        drill: { ...state.drill, skatePaths: [], updatedAt: Date.now() },
        selection: { ...DEFAULT_SELECTION },
        pendingAction: { kind: 'none' },
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
      };
    }

    case 'RESET_BOARD': {
      return {
        ...state,
        drill: {
          ...state.drill,
          players: createDefaultPlayers(),
          skatePaths: [],
          events: [],
          coaches: [],
          updatedAt: Date.now(),
        },
        selection: { ...DEFAULT_SELECTION },
        pendingAction: { kind: 'none' },
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
      };
    }

    // ========================================================================
    // SELECTION
    //
    // Selecting highlights and shows a compact chip. It never opens a full
    // inspector - that takes a second, explicit gesture.
    // ========================================================================

    case 'SELECT_PLAYER': {
      return {
        ...state,
        selection: { ...state.selection, selectedPlayerId: action.id, selectedEventId: null },
        ui: {
          ...state.ui,
          inspector:
            state.ui.inspector.kind === 'event' ||
            (state.ui.inspector.kind === 'player' && state.ui.inspector.playerId !== action.id)
              ? { kind: 'none' }
              : state.ui.inspector,
        },
      };
    }

    case 'SET_PASS_FROM': {
      return {
        ...state,
        selection: { ...state.selection, passFromPlayerId: action.id },
      };
    }

    case 'SELECT_EVENT': {
      return {
        ...state,
        selection: { ...state.selection, selectedEventId: action.id, selectedPlayerId: null },
        ui: {
          ...state.ui,
          inspector:
            state.ui.inspector.kind === 'player' ||
            (state.ui.inspector.kind === 'event' && state.ui.inspector.eventId !== action.id)
              ? { kind: 'none' }
              : state.ui.inspector,
        },
      };
    }

    // ========================================================================
    // PLAYBACK LIFECYCLE
    //
    // Only the coarse lifecycle lives here. Progress, sampled positions, the
    // puck and ghost trails are owned by src/playback/PlaybackStore, which the
    // canvas subscribes to directly.
    // ========================================================================

    case 'START_PLAYBACK': {
      return { ...state, playback: { ...state.playback, isPlaying: true, lifecycle: 'active' } };
    }

    case 'STOP_PLAYBACK': {
      if (!state.playback.isPlaying) return state;
      return { ...state, playback: { ...state.playback, isPlaying: false } };
    }

    case 'SET_PLAYBACK_SPEED': {
      return { ...state, playback: { ...state.playback, speed: action.speed } };
    }

    case 'RESET_PLAYBACK': {
      return { ...state, playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed } };
    }

    case 'SET_PLAYBACK_LIFECYCLE': {
      if (state.playback.lifecycle === action.lifecycle) return state;
      return { ...state, playback: { ...state.playback, lifecycle: action.lifecycle } };
    }

    case 'MARK_REVIEWED': {
      return { ...state, reviewedRevision: state.documentRevision };
    }

    // ========================================================================
    // PENDING ACTION
    // ========================================================================

    case 'SET_PENDING_ACTION': {
      return { ...state, pendingAction: action.action };
    }

    case 'CANCEL_PENDING_ACTION': {
      if (state.pendingAction.kind === 'none' && state.selection.passFromPlayerId === null) {
        return state;
      }
      return {
        ...state,
        pendingAction: { kind: 'none' },
        selection: { ...state.selection, passFromPlayerId: null },
        ui: { ...state.ui, modeBanner: null },
      };
    }

    // ========================================================================
    // UI
    // ========================================================================

    case 'SET_TOOL': {
      return {
        ...state,
        ui: { ...state.ui, currentTool: action.tool },
        selection: action.tool !== 'pass'
          ? { ...state.selection, passFromPlayerId: null }
          : state.selection,
      };
    }

    case 'SET_EDITOR_STEP': {
      return {
        ...state,
        ui: { ...state.ui, editorStep: action.step },
        selection: { ...state.selection, passFromPlayerId: null },
      };
    }

    case 'TOGGLE_MENU': {
      return { ...state, ui: { ...state.ui, showMenu: !state.ui.showMenu } };
    }

    case 'CLOSE_MENU': {
      if (!state.ui.showMenu) return state;
      return { ...state, ui: { ...state.ui, showMenu: false } };
    }

    case 'SHOW_RENAME_MODAL': {
      // A blocking dialog cancels any half-finished hockey action.
      return {
        ...state,
        ui: { ...state.ui, showRenameModal: true },
        pendingAction: { kind: 'none' },
      };
    }

    case 'HIDE_RENAME_MODAL': {
      return { ...state, ui: { ...state.ui, showRenameModal: false } };
    }

    case 'OPEN_INSPECTOR': {
      return { ...state, ui: { ...state.ui, inspector: action.target } };
    }

    case 'CLOSE_INSPECTOR': {
      if (state.ui.inspector.kind === 'none') return state;
      return { ...state, ui: { ...state.ui, inspector: { kind: 'none' } } };
    }

    case 'OPEN_SHEET': {
      // A sheet covering the rink cancels a pending hockey action, which can
      // no longer be completed by tapping the ice.
      return {
        ...state,
        ui: { ...state.ui, openSheet: action.sheet },
        pendingAction: action.sheet === 'none' ? state.pendingAction : { kind: 'none' },
      };
    }

    case 'CLOSE_SHEET': {
      if (state.ui.openSheet === 'none') return state;
      return { ...state, ui: { ...state.ui, openSheet: 'none' } };
    }

    // ========================================================================
    // TOASTS
    //
    // A deliberate queue. The toast on screen stays until it is dismissed or
    // times out; the next one follows. A higher-priority message (a failure)
    // may take over from a routine one, but never the other way round.
    // ========================================================================

    case 'ENQUEUE_TOAST': {
      const { activeToast, toastQueue } = state.ui;
      const incoming = action.toast;

      const duplicate =
        activeToast?.dedupeKey === incoming.dedupeKey ||
        toastQueue.some(queued => queued.dedupeKey === incoming.dedupeKey);
      if (duplicate) return state;

      if (!activeToast) {
        return { ...state, ui: { ...state.ui, activeToast: incoming } };
      }

      if (incoming.priority > activeToast.priority) {
        return { ...state, ui: { ...state.ui, activeToast: incoming } };
      }

      return { ...state, ui: { ...state.ui, toastQueue: [...toastQueue, incoming] } };
    }

    case 'DISMISS_TOAST': {
      const { activeToast, toastQueue } = state.ui;

      if (activeToast?.id === action.id) {
        const [next, ...rest] = toastQueue;
        return { ...state, ui: { ...state.ui, activeToast: next ?? null, toastQueue: rest } };
      }

      const filtered = toastQueue.filter(toast => toast.id !== action.id);
      if (filtered.length === toastQueue.length) return state;
      return { ...state, ui: { ...state.ui, toastQueue: filtered } };
    }

    case 'CLEAR_TOASTS': {
      if (!state.ui.activeToast && state.ui.toastQueue.length === 0) return state;
      return { ...state, ui: { ...state.ui, activeToast: null, toastQueue: [] } };
    }

    case 'SET_MODE_BANNER': {
      return { ...state, ui: { ...state.ui, modeBanner: action.message, playBanner: null } };
    }

    case 'SET_PLAY_BANNER': {
      return { ...state, ui: { ...state.ui, playBanner: action.message, modeBanner: null } };
    }

    case 'CLEAR_BANNERS': {
      if (!state.ui.modeBanner && !state.ui.playBanner) return state;
      return { ...state, ui: { ...state.ui, modeBanner: null, playBanner: null } };
    }

    case 'TOGGLE_DIAGNOSTICS': {
      return { ...state, ui: { ...state.ui, showDiagnostics: !state.ui.showDiagnostics } };
    }

    // ========================================================================
    // UNDO / REDO
    // ========================================================================

    case 'PUSH_UNDO': {
      // The stack entry itself is added by appReducer; this just marks the point.
      return { ...state };
    }

    case 'POP_UNDO': {
      if (state.undoStack.length === 0) return state;

      const snapshot = state.undoStack[state.undoStack.length - 1];
      return {
        ...state,
        drill: applySnapshot(state, snapshot),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, createUndoSnapshot(state.drill)],
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
        selection: { ...DEFAULT_SELECTION },
        pendingAction: { kind: 'none' },
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;

      const snapshot = state.redoStack[state.redoStack.length - 1];
      return {
        ...state,
        drill: applySnapshot(state, snapshot),
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, createUndoSnapshot(state.drill)],
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
        selection: { ...DEFAULT_SELECTION },
        pendingAction: { kind: 'none' },
      };
    }

    case 'CLEAR_UNDO': {
      return { ...state, undoStack: [], redoStack: [] };
    }

    default:
      return state;
  }
}
