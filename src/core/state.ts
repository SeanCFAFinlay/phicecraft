// ============================================================================
// APPLICATION STATE - Reducer and initial state
// ============================================================================

import type {
  AppState,
  AppAction,
  Drill,
  Camera,
  UndoSnapshot,
} from './types';
import {
  DEFAULT_CAMERA,
  DEFAULT_PLAYBACK,
  DEFAULT_INTERACTION,
  DEFAULT_SELECTION,
  DEFAULT_UI,
  RINK,
  MAX_UNDO_STACK,
} from './constants';
import { createNewDrill } from '@/engine/drill';
import { removePlayerFromEvents } from '@/engine/puck';
import { createPlayerSnapshot } from '@/engine/playback';

/**
 * Create initial application state
 */
export function createInitialState(): AppState {
  const drill = createNewDrill();

  return {
    drill,
    camera: { ...DEFAULT_CAMERA },
    canvasWidth: 0,
    canvasHeight: 0,
    selection: { ...DEFAULT_SELECTION },
    interaction: { ...DEFAULT_INTERACTION },
    playback: { ...DEFAULT_PLAYBACK },
    animatedPuck: null,
    ghostTrails: new Map(),
    startSnapshot: createPlayerSnapshot(drill.players),
    ui: { ...DEFAULT_UI },
    undoStack: [],
    drillList: [],
    currentDrillId: drill.id,
  };
}

/**
 * Calculate camera to fit rink in viewport
 */
function calculateFitCamera(canvasWidth: number, canvasHeight: number): Camera {
  // Guard against zero dimensions
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  const padding = 16;
  const zoom = Math.min(
    (canvasWidth - padding * 2) / RINK.width,
    (canvasHeight - padding * 2) / RINK.height
  );
  const x = (canvasWidth - RINK.width * zoom) / 2;
  const y = (canvasHeight - RINK.height * zoom) / 2;

  return { x, y, zoom };
}

/**
 * Create an undo snapshot
 */
function createUndoSnapshot(drill: Drill): UndoSnapshot {
  return {
    players: JSON.parse(JSON.stringify(drill.players)),
    skatePaths: JSON.parse(JSON.stringify(drill.skatePaths)),
    events: JSON.parse(JSON.stringify(drill.events)),
  };
}

/**
 * Main application reducer
 */
export function appReducer(state: AppState, action: AppAction): AppState {
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
        interaction: { ...DEFAULT_INTERACTION },
        playback: { ...DEFAULT_PLAYBACK },
        animatedPuck: null,
        ghostTrails: new Map(),
        startSnapshot: createPlayerSnapshot(drill.players),
        undoStack: [],
        currentDrillId: drill.id,
      };
    }

    case 'LOAD_DRILL': {
      return {
        ...state,
        drill: action.drill,
        selection: { ...DEFAULT_SELECTION },
        interaction: { ...DEFAULT_INTERACTION },
        playback: { ...DEFAULT_PLAYBACK },
        animatedPuck: null,
        ghostTrails: new Map(),
        startSnapshot: createPlayerSnapshot(action.drill.players),
        undoStack: [],
        currentDrillId: action.drill.id,
      };
    }

    case 'RENAME_DRILL': {
      return {
        ...state,
        drill: {
          ...state.drill,
          name: action.name,
          updatedAt: Date.now(),
        },
      };
    }

    case 'DELETE_DRILL': {
      return {
        ...state,
        drillList: state.drillList.filter(d => d.id !== action.id),
      };
    }

    case 'SET_DRILL_LIST': {
      return {
        ...state,
        drillList: action.drills,
      };
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
        startSnapshot: createPlayerSnapshot([...state.drill.players, action.player]),
      };
    }

    case 'REMOVE_PLAYER': {
      const newPlayers = state.drill.players.filter(p => p.id !== action.id);
      const newPaths = state.drill.skatePaths.filter(sp => sp.ownerId !== action.id);
      const newEvents = removePlayerFromEvents(action.id, state.drill.events);

      return {
        ...state,
        drill: {
          ...state.drill,
          players: newPlayers,
          skatePaths: newPaths,
          events: newEvents,
          updatedAt: Date.now(),
        },
        selection: state.selection.selectedPlayerId === action.id
          ? { ...state.selection, selectedPlayerId: null }
          : state.selection,
        startSnapshot: createPlayerSnapshot(newPlayers),
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

    case 'SET_PUCK_CARRIER': {
      // Can only set initial puck carrier if no events exist
      if (state.drill.events.length > 0) {
        return state;
      }

      return {
        ...state,
        drill: {
          ...state.drill,
          players: state.drill.players.map(p => ({
            ...p,
            hasPuck: p.id === action.id,
          })),
          updatedAt: Date.now(),
        },
        startSnapshot: createPlayerSnapshot(
          state.drill.players.map(p => ({ ...p, hasPuck: p.id === action.id }))
        ),
      };
    }

    // ========================================================================
    // PATH ACTIONS
    // ========================================================================

    case 'ADD_SKATE_PATH': {
      return {
        ...state,
        drill: {
          ...state.drill,
          skatePaths: [...state.drill.skatePaths, action.path],
          updatedAt: Date.now(),
        },
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

    // ========================================================================
    // EVENT ACTIONS
    // ========================================================================

    case 'ADD_PASS': {
      return {
        ...state,
        drill: {
          ...state.drill,
          events: [...state.drill.events, action.event],
          updatedAt: Date.now(),
        },
        startSnapshot: createPlayerSnapshot(state.drill.players),
      };
    }

    case 'ADD_SHOT': {
      return {
        ...state,
        drill: {
          ...state.drill,
          events: [...state.drill.events, action.event],
          updatedAt: Date.now(),
        },
        startSnapshot: createPlayerSnapshot(state.drill.players),
      };
    }

    case 'ADD_DUMP': {
      return {
        ...state,
        drill: {
          ...state.drill,
          events: [...state.drill.events, action.event],
          updatedAt: Date.now(),
        },
        startSnapshot: createPlayerSnapshot(state.drill.players),
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

    case 'CLEAR_ALL_EVENTS': {
      // Reset puck to first player
      const resetPlayers = state.drill.players.map((p, i) => ({
        ...p,
        hasPuck: i === 0,
      }));

      return {
        ...state,
        drill: {
          ...state.drill,
          skatePaths: [],
          events: [],
          players: resetPlayers,
          updatedAt: Date.now(),
        },
        selection: { ...DEFAULT_SELECTION },
        startSnapshot: createPlayerSnapshot(resetPlayers),
      };
    }

    // ========================================================================
    // CAMERA
    // ========================================================================

    case 'SET_CAMERA': {
      return {
        ...state,
        camera: action.camera,
      };
    }

    case 'FIT_CAMERA': {
      return {
        ...state,
        camera: calculateFitCamera(state.canvasWidth, state.canvasHeight),
      };
    }

    case 'ZOOM_TO_ZONE': {
      const cw = state.canvasWidth;
      const ch = state.canvasHeight;

      if (action.zone === 'full') {
        return {
          ...state,
          camera: calculateFitCamera(cw, ch),
        };
      }

      const zoom = 2;
      const rx = RINK.x;
      const ry = RINK.y;
      const rw = RINK.width;
      const rh = RINK.height;

      let cx: number;
      if (action.zone === 'offensive') {
        cx = rx + rw * 0.62;
      } else {
        cx = rx + rw * 0.38;
      }
      const cy = ry + rh / 2;

      return {
        ...state,
        camera: {
          x: -cx * zoom + cw / 2,
          y: -cy * zoom + ch / 2,
          zoom,
        },
      };
    }

    // ========================================================================
    // CANVAS
    // ========================================================================

    case 'SET_CANVAS_SIZE': {
      return {
        ...state,
        canvasWidth: action.width,
        canvasHeight: action.height,
        camera: calculateFitCamera(action.width, action.height),
      };
    }

    // ========================================================================
    // SELECTION
    // ========================================================================

    case 'SELECT_PLAYER': {
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedPlayerId: action.id,
        },
      };
    }

    case 'SET_PASS_FROM': {
      return {
        ...state,
        selection: {
          ...state.selection,
          passFromPlayerId: action.id,
        },
      };
    }

    // ========================================================================
    // INTERACTION
    // ========================================================================

    case 'SET_INTERACTION': {
      return {
        ...state,
        interaction: {
          ...state.interaction,
          ...action.interaction,
        },
      };
    }

    case 'RESET_INTERACTION': {
      return {
        ...state,
        interaction: { ...DEFAULT_INTERACTION },
      };
    }

    // ========================================================================
    // PLAYBACK
    // ========================================================================

    case 'START_PLAYBACK': {
      return {
        ...state,
        playback: {
          ...state.playback,
          isPlaying: true,
          progress: 0,
          firedEvents: [],
        },
        ghostTrails: new Map(),
        animatedPuck: null,
      };
    }

    case 'STOP_PLAYBACK': {
      return {
        ...state,
        playback: {
          ...state.playback,
          isPlaying: false,
        },
        animatedPuck: null,
      };
    }

    case 'SET_PLAYBACK_PROGRESS': {
      return {
        ...state,
        playback: {
          ...state.playback,
          progress: action.progress,
        },
      };
    }

    case 'SET_PLAYBACK_SPEED': {
      return {
        ...state,
        playback: {
          ...state.playback,
          speed: action.speed,
        },
      };
    }

    case 'FIRE_EVENT': {
      return {
        ...state,
        playback: {
          ...state.playback,
          firedEvents: [...state.playback.firedEvents, action.index],
        },
      };
    }

    case 'RESET_PLAYBACK': {
      return {
        ...state,
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
        ghostTrails: new Map(),
        animatedPuck: null,
      };
    }

    // ========================================================================
    // ANIMATION
    // ========================================================================

    case 'SET_ANIMATED_PUCK': {
      return {
        ...state,
        animatedPuck: action.puck,
      };
    }

    case 'UPDATE_GHOST_TRAIL': {
      const newTrails = new Map(state.ghostTrails);
      const trail = newTrails.get(action.playerId) ?? [];
      trail.push(action.point);
      if (trail.length > 55) trail.shift();
      newTrails.set(action.playerId, trail);

      return {
        ...state,
        ghostTrails: newTrails,
      };
    }

    case 'CLEAR_GHOST_TRAILS': {
      return {
        ...state,
        ghostTrails: new Map(),
      };
    }

    // ========================================================================
    // SNAPSHOT
    // ========================================================================

    case 'SAVE_START_SNAPSHOT': {
      return {
        ...state,
        startSnapshot: createPlayerSnapshot(state.drill.players),
      };
    }

    case 'RESTORE_START_SNAPSHOT': {
      return {
        ...state,
        drill: {
          ...state.drill,
          players: state.drill.players.map(player => {
            const snap = state.startSnapshot.find(s => s.id === player.id);
            if (snap) {
              return { ...player, x: snap.x, y: snap.y, hasPuck: snap.hasPuck };
            }
            return player;
          }),
        },
      };
    }

    // ========================================================================
    // UI
    // ========================================================================

    case 'SET_TOOL': {
      return {
        ...state,
        ui: {
          ...state.ui,
          currentTool: action.tool,
        },
        selection: action.tool !== 'pass'
          ? { ...state.selection, passFromPlayerId: null }
          : state.selection,
        interaction: { ...DEFAULT_INTERACTION },
      };
    }

    case 'TOGGLE_MENU': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showMenu: !state.ui.showMenu,
        },
      };
    }

    case 'CLOSE_MENU': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showMenu: false,
        },
      };
    }

    case 'SHOW_CONTEXT_MENU': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showContextMenu: true,
          contextMenuPosition: action.position,
          contextMenuPlayerId: action.playerId,
        },
      };
    }

    case 'HIDE_CONTEXT_MENU': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showContextMenu: false,
          contextMenuPosition: null,
          contextMenuPlayerId: null,
        },
      };
    }

    case 'SHOW_RENAME_MODAL': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showRenameModal: true,
        },
      };
    }

    case 'HIDE_RENAME_MODAL': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showRenameModal: false,
        },
      };
    }

    case 'SHOW_PLAYER_INFO': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showPlayerInfo: true,
        },
      };
    }

    case 'HIDE_PLAYER_INFO': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showPlayerInfo: false,
        },
      };
    }

    case 'ADD_TOAST': {
      return {
        ...state,
        ui: {
          ...state.ui,
          toasts: [...state.ui.toasts, action.toast],
        },
      };
    }

    case 'REMOVE_TOAST': {
      return {
        ...state,
        ui: {
          ...state.ui,
          toasts: state.ui.toasts.filter(t => t.id !== action.id),
        },
      };
    }

    case 'SET_MODE_BANNER': {
      return {
        ...state,
        ui: {
          ...state.ui,
          modeBanner: action.message,
          playBanner: null,
        },
      };
    }

    case 'SET_PLAY_BANNER': {
      return {
        ...state,
        ui: {
          ...state.ui,
          playBanner: action.message,
          modeBanner: null,
        },
      };
    }

    case 'CLEAR_BANNERS': {
      return {
        ...state,
        ui: {
          ...state.ui,
          modeBanner: null,
          playBanner: null,
        },
      };
    }

    // ========================================================================
    // UNDO
    // ========================================================================

    case 'PUSH_UNDO': {
      const newStack = [...state.undoStack, createUndoSnapshot(state.drill)];
      if (newStack.length > MAX_UNDO_STACK) {
        newStack.shift();
      }
      return {
        ...state,
        undoStack: newStack,
      };
    }

    case 'POP_UNDO': {
      if (state.undoStack.length === 0) return state;

      const snapshot = state.undoStack[state.undoStack.length - 1];
      return {
        ...state,
        drill: {
          ...state.drill,
          players: snapshot.players,
          skatePaths: snapshot.skatePaths,
          events: snapshot.events,
          updatedAt: Date.now(),
        },
        undoStack: state.undoStack.slice(0, -1),
        startSnapshot: createPlayerSnapshot(snapshot.players),
      };
    }

    case 'CLEAR_UNDO': {
      return {
        ...state,
        undoStack: [],
      };
    }

    default:
      return state;
  }
}
