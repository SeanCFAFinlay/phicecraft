// ============================================================================
// APP STATE HOOK - React context and reducer for global state
// ============================================================================

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type Dispatch,
} from 'react';
import type {
  AppState,
  AppAction,
  Tool,
  Player,
  SkatePath,
  PassEvent,
  ShotEvent,
  DumpEvent,
  Point,
  ID,
  Camera,
  Toast,
  InteractionState,
} from '@/core/types';
import { createInitialState, appReducer } from '@/core/state';
import { generateId } from '@/utils/id';
import {
  getDrillList,
  getDrill,
  saveDrill,
  getCurrentDrillId,
  setCurrentDrillId,
} from '@/storage';
import { TOOL_HINTS } from '@/core/constants';

// ============================================================================
// CONTEXT
// ============================================================================

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  actions: AppActions;
}

const AppContext = createContext<AppContextValue | null>(null);

// ============================================================================
// ACTION HELPERS
// ============================================================================

interface AppActions {
  // Tool
  setTool: (tool: Tool) => void;

  // Players
  addPlayer: (player: Player) => void;
  removePlayer: (id: ID) => void;
  movePlayer: (id: ID, x: number, y: number) => void;
  setPuckCarrier: (id: ID) => void;

  // Paths
  addSkatePath: (path: SkatePath) => void;
  removeSkatePath: (id: ID) => void;

  // Events
  addPass: (fromPlayer: Player, toPlayer: Player) => void;
  addShot: (fromPlayer: Player, targetPoint: Point) => void;
  addDump: (fromPlayer: Player, targetPoint: Point) => void;

  // Selection
  selectPlayer: (id: ID | null) => void;
  setPassFrom: (id: ID | null) => void;

  // Drill management
  newDrill: () => void;
  renameDrill: (name: string) => void;
  loadDrill: (id: ID) => void;
  saveDrill: () => void;
  clearAllEvents: () => void;

  // Camera
  setCamera: (camera: Camera) => void;
  fitCamera: () => void;
  zoomToZone: (zone: 'full' | 'offensive' | 'defensive') => void;

  // Interaction
  setInteraction: (interaction: Partial<InteractionState>) => void;
  resetInteraction: () => void;

  // Playback
  startPlayback: () => void;
  stopPlayback: () => void;
  setPlaybackProgress: (progress: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  resetPlayback: () => void;

  // Undo
  pushUndo: () => void;
  undo: () => void;

  // UI
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
  toggleMenu: () => void;
  closeMenu: () => void;
  showContextMenu: (position: Point, playerId: ID) => void;
  hideContextMenu: () => void;
  showRenameModal: () => void;
  hideRenameModal: () => void;
  showPlayerInfo: () => void;
  hidePlayerInfo: () => void;
  setModeBanner: (message: string | null) => void;
  setPlayBanner: (message: string | null) => void;
  clearBanners: () => void;
}

// ============================================================================
// PROVIDER
// ============================================================================

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState);
  const autoSaveTimeoutRef = useRef<number | null>(null);

  // Load drill list and current drill on mount
  useEffect(() => {
    const drillList = getDrillList();
    dispatch({ type: 'SET_DRILL_LIST', drills: drillList });

    const currentId = getCurrentDrillId();
    if (currentId) {
      const drill = getDrill(currentId);
      if (drill) {
        dispatch({ type: 'LOAD_DRILL', drill });
      }
    }
  }, []);

  // Auto-save drill when it changes
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      saveDrill(state.drill);
      setCurrentDrillId(state.drill.id);
    }, 1000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [state.drill]);

  // Action creators
  const actions: AppActions = {
    setTool: useCallback((tool: Tool) => {
      dispatch({ type: 'SET_TOOL', tool });
      const hint = TOOL_HINTS[tool];
      if (hint) {
        const toast: Toast = {
          id: generateId(),
          message: hint,
          type: 'info',
          duration: 3800,
        };
        dispatch({ type: 'ADD_TOAST', toast });
      }
    }, []),

    addPlayer: useCallback((player: Player) => {
      dispatch({ type: 'ADD_PLAYER', player });
    }, []),

    removePlayer: useCallback((id: ID) => {
      dispatch({ type: 'PUSH_UNDO' });
      dispatch({ type: 'REMOVE_PLAYER', id });
    }, []),

    movePlayer: useCallback((id: ID, x: number, y: number) => {
      dispatch({ type: 'MOVE_PLAYER', id, x, y });
    }, []),

    setPuckCarrier: useCallback((id: ID) => {
      dispatch({ type: 'SET_PUCK_CARRIER', id });
    }, []),

    addSkatePath: useCallback((path: SkatePath) => {
      dispatch({ type: 'PUSH_UNDO' });
      dispatch({ type: 'ADD_SKATE_PATH', path });
    }, []),

    removeSkatePath: useCallback((id: ID) => {
      dispatch({ type: 'PUSH_UNDO' });
      dispatch({ type: 'REMOVE_SKATE_PATH', id });
    }, []),

    addPass: useCallback((fromPlayer: Player, toPlayer: Player) => {
      dispatch({ type: 'PUSH_UNDO' });
      const event: PassEvent = {
        id: generateId(),
        type: 'pass',
        fromPlayerId: fromPlayer.id,
        toPlayerId: toPlayer.id,
        fromPoint: { x: fromPlayer.x, y: fromPlayer.y },
        toPoint: { x: toPlayer.x, y: toPlayer.y },
        team: fromPlayer.team,
      };
      dispatch({ type: 'ADD_PASS', event });
    }, []),

    addShot: useCallback((fromPlayer: Player, targetPoint: Point) => {
      dispatch({ type: 'PUSH_UNDO' });
      const event: ShotEvent = {
        id: generateId(),
        type: 'shot',
        fromPlayerId: fromPlayer.id,
        fromPoint: { x: fromPlayer.x, y: fromPlayer.y },
        toPoint: targetPoint,
        targetNet: targetPoint.x < 500 ? 'L' : 'R',
        team: fromPlayer.team,
      };
      dispatch({ type: 'ADD_SHOT', event });
    }, []),

    addDump: useCallback((fromPlayer: Player, targetPoint: Point) => {
      dispatch({ type: 'PUSH_UNDO' });
      const event: DumpEvent = {
        id: generateId(),
        type: 'dump',
        fromPlayerId: fromPlayer.id,
        fromPoint: { x: fromPlayer.x, y: fromPlayer.y },
        toPoint: targetPoint,
        targetNet: 'dump',
        team: fromPlayer.team,
      };
      dispatch({ type: 'ADD_DUMP', event });
    }, []),

    selectPlayer: useCallback((id: ID | null) => {
      dispatch({ type: 'SELECT_PLAYER', id });
      if (id) {
        dispatch({ type: 'SHOW_PLAYER_INFO' });
      } else {
        dispatch({ type: 'HIDE_PLAYER_INFO' });
      }
    }, []),

    setPassFrom: useCallback((id: ID | null) => {
      dispatch({ type: 'SET_PASS_FROM', id });
    }, []),

    newDrill: useCallback(() => {
      dispatch({ type: 'NEW_DRILL' });
    }, []),

    renameDrill: useCallback((name: string) => {
      dispatch({ type: 'RENAME_DRILL', name });
    }, []),

    loadDrill: useCallback((id: ID) => {
      const drill = getDrill(id);
      if (drill) {
        dispatch({ type: 'LOAD_DRILL', drill });
        setCurrentDrillId(id);
      }
    }, []),

    saveDrill: useCallback(() => {
      saveDrill(state.drill);
    }, [state.drill]),

    clearAllEvents: useCallback(() => {
      dispatch({ type: 'PUSH_UNDO' });
      dispatch({ type: 'CLEAR_ALL_EVENTS' });
    }, []),

    setCamera: useCallback((camera: Camera) => {
      dispatch({ type: 'SET_CAMERA', camera });
    }, []),

    fitCamera: useCallback(() => {
      dispatch({ type: 'FIT_CAMERA' });
    }, []),

    zoomToZone: useCallback((zone: 'full' | 'offensive' | 'defensive') => {
      dispatch({ type: 'ZOOM_TO_ZONE', zone });
    }, []),

    setInteraction: useCallback((interaction: Partial<InteractionState>) => {
      dispatch({ type: 'SET_INTERACTION', interaction });
    }, []),

    resetInteraction: useCallback(() => {
      dispatch({ type: 'RESET_INTERACTION' });
    }, []),

    startPlayback: useCallback(() => {
      dispatch({ type: 'SAVE_START_SNAPSHOT' });
      dispatch({ type: 'START_PLAYBACK' });
    }, []),

    stopPlayback: useCallback(() => {
      dispatch({ type: 'STOP_PLAYBACK' });
      dispatch({ type: 'CLEAR_BANNERS' });
    }, []),

    setPlaybackProgress: useCallback((progress: number) => {
      dispatch({ type: 'SET_PLAYBACK_PROGRESS', progress });
    }, []),

    setPlaybackSpeed: useCallback((speed: number) => {
      dispatch({ type: 'SET_PLAYBACK_SPEED', speed });
    }, []),

    resetPlayback: useCallback(() => {
      dispatch({ type: 'RESET_PLAYBACK' });
      dispatch({ type: 'RESTORE_START_SNAPSHOT' });
    }, []),

    pushUndo: useCallback(() => {
      dispatch({ type: 'PUSH_UNDO' });
    }, []),

    undo: useCallback(() => {
      dispatch({ type: 'POP_UNDO' });
    }, []),

    showToast: useCallback((
      message: string,
      type: Toast['type'] = 'info',
      duration: number = 2500
    ) => {
      const toast: Toast = {
        id: generateId(),
        message,
        type,
        duration,
      };
      dispatch({ type: 'ADD_TOAST', toast });

      if (duration > 0) {
        setTimeout(() => {
          dispatch({ type: 'REMOVE_TOAST', id: toast.id });
        }, duration);
      }
    }, []),

    toggleMenu: useCallback(() => {
      dispatch({ type: 'TOGGLE_MENU' });
    }, []),

    closeMenu: useCallback(() => {
      dispatch({ type: 'CLOSE_MENU' });
    }, []),

    showContextMenu: useCallback((position: Point, playerId: ID) => {
      dispatch({ type: 'SHOW_CONTEXT_MENU', position, playerId });
    }, []),

    hideContextMenu: useCallback(() => {
      dispatch({ type: 'HIDE_CONTEXT_MENU' });
    }, []),

    showRenameModal: useCallback(() => {
      dispatch({ type: 'SHOW_RENAME_MODAL' });
    }, []),

    hideRenameModal: useCallback(() => {
      dispatch({ type: 'HIDE_RENAME_MODAL' });
    }, []),

    showPlayerInfo: useCallback(() => {
      dispatch({ type: 'SHOW_PLAYER_INFO' });
    }, []),

    hidePlayerInfo: useCallback(() => {
      dispatch({ type: 'HIDE_PLAYER_INFO' });
    }, []),

    setModeBanner: useCallback((message: string | null) => {
      dispatch({ type: 'SET_MODE_BANNER', message });
    }, []),

    setPlayBanner: useCallback((message: string | null) => {
      dispatch({ type: 'SET_PLAY_BANNER', message });
    }, []),

    clearBanners: useCallback(() => {
      dispatch({ type: 'CLEAR_BANNERS' });
    }, []),
  };

  return (
    <AppContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return context;
}

// Convenience hooks for specific parts of state
export function useCurrentTool() {
  const { state } = useAppState();
  return state.ui.currentTool;
}

export function useDrill() {
  const { state } = useAppState();
  return state.drill;
}

export function usePlayback() {
  const { state } = useAppState();
  return state.playback;
}

export function useCamera() {
  const { state } = useAppState();
  return state.camera;
}

export function useSelection() {
  const { state } = useAppState();
  return state.selection;
}

export function useInteraction() {
  const { state } = useAppState();
  return state.interaction;
}
