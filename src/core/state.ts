// ============================================================================
// APPLICATION STATE - Reducer and initial state
// ============================================================================

import type {
  AppState,
  AppAction,
  Drill,
  Camera,
  UndoSnapshot,
  Point,
} from './types';
import {
  DEFAULT_CAMERA,
  DEFAULT_PLAYBACK,
  DEFAULT_INTERACTION,
  DEFAULT_SELECTION,
  DEFAULT_UI,
  RINK,
  MAX_UNDO_STACK,
  MIN_ZOOM,
  MAX_ZOOM,
  FIT_PADDING,
  TABLETOP_MAX_TILT,
} from './constants';
import { createNewDrill } from '@/engine/drill';
import { removePlayerFromEvents } from '@/engine/puck';
import {
  updateGhostTrail,
} from '@/engine/playback';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame } from '@/sim/sampleFrame';
import { clamp } from '@/utils/geometry';

/**
 * Create initial application state
 */
export function createInitialState(): AppState {
  const drill = createNewDrill();

  return {
    drill,
    camera: { ...DEFAULT_CAMERA },
    cameraUserAdjusted: false,
    canvasWidth: 0,
    canvasHeight: 0,
    selection: { ...DEFAULT_SELECTION },
    interaction: { ...DEFAULT_INTERACTION },
    playback: { ...DEFAULT_PLAYBACK },
    playbackPositions: {},
    playbackPlayerFrames: {},
    animatedPuck: null,
    ghostTrails: new Map(),
    ui: { ...DEFAULT_UI },
    undoStack: [],
    redoStack: [],
    drillList: [],
    currentDrillId: drill.id,
  };
}

/**
 * Calculate camera to fit the whole rink in the viewport
 */
function calculateFitCamera(canvasWidth: number, canvasHeight: number, base?: Camera): Camera {
  // The tabletop lean/spin is a view preference that survives a re-fit.
  const rotation = base?.rotation ?? 0;
  const tilt = base?.tilt ?? 0;

  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { ...DEFAULT_CAMERA, rotation, tilt };
  }

  const zoom = Math.min(
    (canvasWidth - FIT_PADDING * 2) / RINK.width,
    (canvasHeight - FIT_PADDING * 2) / RINK.height
  );

  return {
    zoom,
    x: (canvasWidth - RINK.width * zoom) / 2 - RINK.x * zoom,
    y: (canvasHeight - RINK.height * zoom) / 2 - RINK.y * zoom,
    rotation,
    tilt,
  };
}

/**
 * Reset playback-derived state back to a clean slate
 */
const CLEARED_PLAYBACK = {
  playbackPositions: {} as Record<string, Point>,
  playbackPlayerFrames: {},
  animatedPuck: null,
  ghostTrails: new Map<string, Point[]>(),
};

/**
 * Re-derive everything that depends on playback progress. Pure: given the same
 * drill and progress it always produces the same positions, puck and events.
 */
function derivePlayback(state: AppState, progress: number): AppState {
  const { players, skatePaths } = state.drill;
  const compiled = compileDrill(state.drill);
  const frame = sampleFrame(compiled, progress * compiled.durationSeconds);
  const positions = Object.fromEntries(
    Object.entries(frame.players).map(([id, playerFrame]) => [id, playerFrame.position])
  );

  // Trails only accumulate while actually playing - scrubbing shouldn't smear.
  let ghostTrails = state.ghostTrails;
  if (state.playback.isPlaying) {
    for (const player of players) {
      const hasPath = skatePaths.some(sp => sp.ownerId === player.id);
      if (hasPath) {
        ghostTrails = updateGhostTrail(ghostTrails, player.id, positions[player.id]);
      }
    }
  }

  return {
    ...state,
    playback: {
      ...state.playback,
      progress,
      duration: frame.durationSeconds,
      firedEvents: frame.firedEventIndices,
      lifecycle: state.playback.isPlaying && frame.lifecycle === 'ready' ? 'active' : frame.lifecycle,
    },
    playbackPositions: positions,
    playbackPlayerFrames: frame.players,
    animatedPuck: frame.puck,
    ghostTrails,
  };
}

/**
 * Create an undo snapshot of the drill's mutable content
 */
function createUndoSnapshot(drill: Drill): UndoSnapshot {
  return structuredClone({
    players: drill.players,
    skatePaths: drill.skatePaths,
    events: drill.events,
    coaches: drill.coaches ?? [],
  });
}

function applySnapshot(state: AppState, snapshot: UndoSnapshot): Drill {
  return {
    ...state.drill,
    players: snapshot.players,
    skatePaths: snapshot.skatePaths,
    events: snapshot.events,
    coaches: snapshot.coaches ?? [],
    updatedAt: Date.now(),
  };
}

/**
 * Actions that change drill content and should each be a single undo step.
 *
 * MOVE_PLAYER is deliberately absent: it fires continuously while dragging, so
 * the caller dispatches PUSH_UNDO once when the gesture starts instead.
 */
const UNDOABLE_ACTIONS: ReadonlySet<AppAction['type']> = new Set([
  'ADD_PLAYER',
  'REMOVE_PLAYER',
  'SET_PUCK_CARRIER',
  'UPDATE_PLAYER_VISUAL',
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
  'CLEAR_ALL_EVENTS',
]);

/**
 * Main application reducer.
 *
 * Wraps the core reducer to record undo history for drill-mutating actions, so
 * individual call sites can't forget to.
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  const next = reduce(state, action);

  // Nothing changed (e.g. a rejected SET_PUCK_CARRIER) - don't record history.
  if (next === state) return state;

  if (UNDOABLE_ACTIONS.has(action.type) || action.type === 'PUSH_UNDO') {
    const undoStack = [...state.undoStack, createUndoSnapshot(state.drill)];
    if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    return { ...next, undoStack, redoStack: [] };
  }

  return next;
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
        ...CLEARED_PLAYBACK,
        drill,
        selection: { ...DEFAULT_SELECTION },
        interaction: { ...DEFAULT_INTERACTION },
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
        undoStack: [],
        redoStack: [],
        currentDrillId: drill.id,
      };
    }

    case 'LOAD_DRILL': {
      return {
        ...state,
        ...CLEARED_PLAYBACK,
        drill: action.drill,
        selection: { ...DEFAULT_SELECTION },
        interaction: { ...DEFAULT_INTERACTION },
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

    case 'CLEAR_ALL_EVENTS': {
      const players = state.drill.players.map((p, i) => ({ ...p, hasPuck: i === 0 }));
      return {
        ...state,
        ...CLEARED_PLAYBACK,
        drill: { ...state.drill, skatePaths: [], events: [], players, updatedAt: Date.now() },
        selection: { ...DEFAULT_SELECTION },
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
      };
    }

    // ========================================================================
    // CAMERA
    // ========================================================================

    case 'SET_CAMERA': {
      return {
        ...state,
        camera: {
          ...action.camera,
          zoom: clamp(action.camera.zoom, MIN_ZOOM, MAX_ZOOM),
          tilt: clamp(action.camera.tilt ?? 0, 0, TABLETOP_MAX_TILT),
        },
        cameraUserAdjusted: true,
      };
    }

    case 'FIT_CAMERA': {
      // An explicit "show me the whole rink" also hands control back to
      // auto-fit, so resizing keeps the rink framed. The tabletop lean/spin is
      // a view preference, so it rides along rather than snapping back to flat.
      return {
        ...state,
        camera: calculateFitCamera(state.canvasWidth, state.canvasHeight, state.camera),
        cameraUserAdjusted: false,
      };
    }

    case 'ZOOM_AT': {
      const { camera } = state;
      const zoom = clamp(camera.zoom * action.factor, MIN_ZOOM, MAX_ZOOM);
      // Keep the world point under the cursor pinned to the same screen point.
      const scale = zoom / camera.zoom;

      return {
        ...state,
        camera: {
          ...camera,
          zoom,
          x: action.screenPoint.x - (action.screenPoint.x - camera.x) * scale,
          y: action.screenPoint.y - (action.screenPoint.y - camera.y) * scale,
        },
        cameraUserAdjusted: true,
      };
    }

    case 'ZOOM_TO_ZONE': {
      const cw = state.canvasWidth;
      const ch = state.canvasHeight;

      const rotation = state.camera.rotation ?? 0;
      const tilt = state.camera.tilt ?? 0;

      if (action.zone === 'full') {
        return {
          ...state,
          camera: calculateFitCamera(cw, ch, state.camera),
          cameraUserAdjusted: false,
        };
      }

      const zoom = clamp(2, MIN_ZOOM, MAX_ZOOM);
      const cx = action.zone === 'offensive'
        ? RINK.x + RINK.width * 0.62
        : RINK.x + RINK.width * 0.38;
      const cy = RINK.centerY;

      return {
        ...state,
        camera: { x: -cx * zoom + cw / 2, y: -cy * zoom + ch / 2, zoom, rotation, tilt },
        cameraUserAdjusted: true,
      };
    }

    // ========================================================================
    // CANVAS
    // ========================================================================

    case 'SET_CANVAS_SIZE': {
      // Keep re-fitting on resize until the user takes the camera over. The
      // first layout pass reports a stale height, so fitting only once would
      // leave the rink cropped.
      const shouldFit = !state.cameraUserAdjusted && action.width > 0 && action.height > 0;

      return {
        ...state,
        canvasWidth: action.width,
        canvasHeight: action.height,
        camera: shouldFit
          ? calculateFitCamera(action.width, action.height, state.camera)
          : state.camera,
      };
    }

    // ========================================================================
    // SELECTION
    // ========================================================================

    case 'SELECT_PLAYER': {
      return {
        ...state,
        selection: { ...state.selection, selectedPlayerId: action.id, selectedEventId: null },
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
        ui: { ...state.ui, showPlayerInfo: false },
      };
    }

    // ========================================================================
    // INTERACTION
    // ========================================================================

    case 'SET_INTERACTION': {
      return {
        ...state,
        interaction: { ...state.interaction, ...action.interaction },
      };
    }

    case 'RESET_INTERACTION': {
      return { ...state, interaction: { ...DEFAULT_INTERACTION } };
    }

    // ========================================================================
    // PLAYBACK
    // ========================================================================

    case 'START_PLAYBACK': {
      return derivePlayback(
        {
          ...state,
          ...CLEARED_PLAYBACK,
          playback: { ...state.playback, isPlaying: true, progress: 0, firedEvents: [] },
        },
        0
      );
    }

    case 'STOP_PLAYBACK': {
      return { ...state, playback: { ...state.playback, isPlaying: false } };
    }

    case 'SET_PLAYBACK_PROGRESS': {
      return derivePlayback(state, clamp(action.progress, 0, 1));
    }

    case 'SET_PLAYBACK_SPEED': {
      return { ...state, playback: { ...state.playback, speed: action.speed } };
    }

    case 'RESET_PLAYBACK': {
      return {
        ...state,
        ...CLEARED_PLAYBACK,
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
      };
    }

    case 'CLEAR_GHOST_TRAILS': {
      return { ...state, ghostTrails: new Map() };
    }

    case 'SET_PLAYBACK_LIFECYCLE': {
      return { ...state, playback: { ...state.playback, lifecycle: action.lifecycle } };
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
        interaction: { ...DEFAULT_INTERACTION },
      };
    }

    case 'SET_EDITOR_STEP': {
      return {
        ...state,
        ui: { ...state.ui, editorStep: action.step },
        selection: { ...state.selection, passFromPlayerId: null },
        interaction: { ...DEFAULT_INTERACTION },
      };
    }

    case 'TOGGLE_MENU': {
      return { ...state, ui: { ...state.ui, showMenu: !state.ui.showMenu } };
    }

    case 'CLOSE_MENU': {
      return { ...state, ui: { ...state.ui, showMenu: false } };
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
      return { ...state, ui: { ...state.ui, showRenameModal: true } };
    }

    case 'HIDE_RENAME_MODAL': {
      return { ...state, ui: { ...state.ui, showRenameModal: false } };
    }

    case 'SHOW_PLAYER_INFO': {
      return { ...state, ui: { ...state.ui, showPlayerInfo: true } };
    }

    case 'HIDE_PLAYER_INFO': {
      return { ...state, ui: { ...state.ui, showPlayerInfo: false } };
    }

    case 'ADD_TOAST': {
      return { ...state, ui: { ...state.ui, toasts: [...state.ui.toasts, action.toast] } };
    }

    case 'REMOVE_TOAST': {
      return {
        ...state,
        ui: { ...state.ui, toasts: state.ui.toasts.filter(t => t.id !== action.id) },
      };
    }

    case 'SET_MODE_BANNER': {
      return { ...state, ui: { ...state.ui, modeBanner: action.message, playBanner: null } };
    }

    case 'SET_PLAY_BANNER': {
      return { ...state, ui: { ...state.ui, playBanner: action.message, modeBanner: null } };
    }

    case 'CLEAR_BANNERS': {
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
        ...CLEARED_PLAYBACK,
        drill: applySnapshot(state, snapshot),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, createUndoSnapshot(state.drill)],
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
        selection: { ...DEFAULT_SELECTION },
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;

      const snapshot = state.redoStack[state.redoStack.length - 1];
      return {
        ...state,
        ...CLEARED_PLAYBACK,
        drill: applySnapshot(state, snapshot),
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, createUndoSnapshot(state.drill)],
        playback: { ...DEFAULT_PLAYBACK, speed: state.playback.speed },
        selection: { ...DEFAULT_SELECTION },
      };
    }

    case 'CLEAR_UNDO': {
      return { ...state, undoStack: [], redoStack: [] };
    }

    default:
      return state;
  }
}
