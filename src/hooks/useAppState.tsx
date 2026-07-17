// ============================================================================
// APP STATE HOOK - React context and reducer for global state
// ============================================================================

import {
  createContext,
  useContext,
  useReducer,
  useMemo,
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
  PickupEvent,
  Point,
  ID,
  Camera,
  Toast,
  Team,
  InteractionState,
} from '@/core/types';
import { createInitialState, appReducer } from '@/core/state';
import { generateId } from '@/utils/id';
import { distance } from '@/utils/geometry';
import {
  getAuthoredPassInterception,
  getAuthoredPlayerBlade,
  getAuthoredPuck,
  getAuthoredReleaseProgress,
} from '@/sim/authoring';
import {
  getDrillList,
  getDrill,
  saveDrill as persistDrill,
  deleteDrill as removeStoredDrill,
  getCurrentDrillId,
  setCurrentDrillId,
  exportAllDrills,
  importDrills as importDrillsJson,
} from '@/storage';
import { TOOL_HINTS, RINK_CENTER_X, AUTOSAVE_DELAY } from '@/core/constants';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { fiveManCornerRetrievalDrill } from '@/fixtures/fiveManCornerRetrieval.v1';
import { fiveManCrossCornerDrill } from '@/fixtures/fiveManCrossCorner.v1';
import { fiveManLowHighDrill } from '@/fixtures/fiveManLowHigh.v1';

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
// ACTIONS
// ============================================================================

export interface AppActions {
  // Tool
  setTool: (tool: Tool) => void;
  setEditorStep: (step: AppState['ui']['editorStep']) => void;

  // Players
  addPlayer: (player: Player) => void;
  removePlayer: (id: ID) => void;
  beginPlayerMove: () => void;
  movePlayer: (id: ID, x: number, y: number) => void;
  setPuckCarrier: (id: ID) => void;
  updatePlayerVisual: (id: ID, visual: Partial<NonNullable<Player['visual']>>) => void;

  // Paths
  addSkatePath: (path: SkatePath) => void;
  removeSkatePath: (id: ID) => void;
  updateSkatePath: (id: ID, updates: Pick<SkatePath, 'mode' | 'finish'>) => void;

  // Events
  addPass: (fromPlayer: Player, toPlayer: Player, fromPoint?: Point, toPoint?: Point) => void;
  addPathPass: (fromPlayerId: ID, toPlayerId: ID, fromPoint: Point, toPoint: Point, team: Team) => void;
  addShot: (fromPlayer: Player, targetPoint: Point, fromPoint?: Point) => void;
  addDump: (fromPlayer: Player, targetPoint: Point, fromPoint?: Point) => void;
  addPickup: (player: Player) => void;

  // Selection
  selectPlayer: (id: ID | null) => void;
  setPassFrom: (id: ID | null) => void;
  selectEvent: (id: ID | null) => void;
  removeEvent: (id: ID) => void;
  updatePassResult: (id: ID, result: 'caught' | 'missed' | undefined) => void;
  updateShotResult: (id: ID, result: 'goal' | 'save' | 'rebound' | 'wide' | 'post' | undefined) => void;
  convertDumpToPass: (eventId: ID, receiverId: ID) => void;
  retargetPass: (eventId: ID, receiverId: ID) => void;

  // Drill management
  newDrill: () => void;
  loadMechanicsDemo: () => void;
  loadFiveManCornerRetrieval: () => void;
  loadFiveManCrossCorner: () => void;
  loadFiveManLowHigh: () => void;
  renameDrill: (name: string) => void;
  loadDrill: (id: ID) => void;
  saveDrill: () => void;
  deleteDrill: (id: ID) => void;
  clearAllEvents: () => void;
  exportDrills: () => void;
  importDrills: (json: string) => void;

  // Camera
  setCamera: (camera: Camera) => void;
  fitCamera: () => void;
  zoomToZone: (zone: 'full' | 'offensive' | 'defensive') => void;
  zoomAt: (factor: number, screenPoint: Point) => void;

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
  redo: () => void;

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
  toggleDiagnostics: () => void;
}

/**
 * Trigger a browser download of a text file
 */
function downloadFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// PROVIDER
// ============================================================================

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState);
  const autoSaveTimeoutRef = useRef<number | null>(null);

  // Actions are built once and must never go stale, so anything that needs to
  // read current state reads it through this ref rather than closing over it.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load drill list and current drill on mount
  useEffect(() => {
    dispatch({ type: 'SET_DRILL_LIST', drills: getDrillList() });

    const currentId = getCurrentDrillId();
    if (currentId) {
      const drill = getDrill(currentId);
      if (drill) dispatch({ type: 'LOAD_DRILL', drill });
    }
  }, []);

  // Auto-save the drill when it changes. Playback no longer writes to the
  // drill, so this only fires on real edits.
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      persistDrill(state.drill);
      setCurrentDrillId(state.drill.id);
      dispatch({ type: 'SET_DRILL_LIST', drills: getDrillList() });
    }, AUTOSAVE_DELAY);

    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [state.drill]);

  const actions = useMemo<AppActions>(() => {
    const toast = (message: string, type: Toast['type'] = 'info', duration = 2500) => {
      const t: Toast = { id: generateId(), message, type, duration };
      dispatch({ type: 'ADD_TOAST', toast: t });
      if (duration > 0) {
        window.setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id: t.id }), duration);
      }
    };

    const refreshDrillList = () =>
      dispatch({ type: 'SET_DRILL_LIST', drills: getDrillList() });

    return {
      setTool: tool => {
        dispatch({ type: 'SET_TOOL', tool });
        const hint = TOOL_HINTS[tool];
        if (hint) toast(hint, 'info', 3800);
      },
      setEditorStep: step => dispatch({ type: 'SET_EDITOR_STEP', step }),

      addPlayer: player => dispatch({ type: 'ADD_PLAYER', player }),
      removePlayer: id => dispatch({ type: 'REMOVE_PLAYER', id }),
      beginPlayerMove: () => dispatch({ type: 'PUSH_UNDO' }),
      movePlayer: (id, x, y) => dispatch({ type: 'MOVE_PLAYER', id, x, y }),
      setPuckCarrier: id => dispatch({ type: 'SET_PUCK_CARRIER', id }),
      updatePlayerVisual: (id, visual) => dispatch({ type: 'UPDATE_PLAYER_VISUAL', id, visual }),

      addSkatePath: path => dispatch({ type: 'ADD_SKATE_PATH', path }),
      removeSkatePath: id => dispatch({ type: 'REMOVE_SKATE_PATH', id }),
      updateSkatePath: (id, updates) => dispatch({ type: 'UPDATE_SKATE_PATH', id, updates }),

      addPass: (fromPlayer, toPlayer, fromPoint, _toPoint) => {
        const s = stateRef.current;
        const authoredSource = fromPoint ?? { x: fromPlayer.x, y: fromPlayer.y };
        const sourcePath = s.drill.skatePaths.find(path => path.ownerId === fromPlayer.id);
        const previousArrival = s.drill.events.length
          ? s.drill.events[s.drill.events.length - 1].arrivalAt ?? 0
          : 0;
        const authoredTime = sourcePath
          ? getAuthoredReleaseProgress(s.drill, fromPlayer.id, authoredSource)
          : Math.max(0.12, previousArrival + 0.04);
        const sourceTime = Math.min(0.94, Math.max(authoredTime, previousArrival + 0.04));
        const source = getAuthoredPlayerBlade(s.drill, fromPlayer.id, sourceTime) ?? authoredSource;
        const interception = getAuthoredPassInterception(s.drill, source, toPlayer.id, sourceTime) ?? {
          toPoint: { x: toPlayer.x, y: toPlayer.y },
          arrivalAt: Math.min(0.98, sourceTime + 0.08),
        };
        // A pass addressed to a player always resolves to that skater's stick
        // socket. Clicking the body is the easy targeting gesture; the engine
        // handles the hockey-specific catch point for stationary and moving
        // receivers alike.
        const target = interception.toPoint;
        const arrivalAt = interception.arrivalAt;
        const event: PassEvent = {
          id: generateId(),
          type: 'pass',
          fromPlayerId: fromPlayer.id,
          toPlayerId: toPlayer.id,
          fromPoint: source,
          toPoint: target,
          team: fromPlayer.team,
          at: sourceTime,
          arrivalAt,
        };
        dispatch({ type: 'ADD_PASS', event });
      },

      addPathPass: (fromPlayerId, toPlayerId, fromPoint, toPoint, team) => {
        const s = stateRef.current;
        const fromPath = s.drill.skatePaths.find(path => path.ownerId === fromPlayerId);
        const receiver = s.drill.players.find(player => player.id === toPlayerId);
        const passer = s.drill.players.find(player => player.id === fromPlayerId);
        const authoredTime = fromPath
          ? getAuthoredReleaseProgress(s.drill, fromPlayerId, fromPoint)
          : 0.12;
        const previousArrival = s.drill.events.length
          ? s.drill.events[s.drill.events.length - 1].arrivalAt ?? 0
          : 0;
        const at = Math.min(0.94, Math.max(authoredTime, previousArrival + 0.04));
        const releasePoint = passer
          ? getAuthoredPlayerBlade(s.drill, passer.id, at) ?? fromPoint
          : fromPoint;
        const interception = receiver
          ? getAuthoredPassInterception(s.drill, releasePoint, receiver.id, at) ?? { toPoint, arrivalAt: Math.min(0.98, at + 0.08) }
          : { toPoint, arrivalAt: Math.min(0.98, at + 0.06) };
        const event: PassEvent = {
          id: generateId(),
          type: 'pass',
          fromPlayerId,
          toPlayerId,
          fromPoint: releasePoint,
          toPoint: interception.toPoint,
          team,
          at,
          arrivalAt: interception.arrivalAt,
        };
        dispatch({ type: 'ADD_PASS', event });
      },

      addShot: (fromPlayer, targetPoint, fromPoint) => {
        const s = stateRef.current;
        const authoredSource = fromPoint ?? { x: fromPlayer.x, y: fromPlayer.y };
        const sourcePath = s.drill.skatePaths.find(path => path.ownerId === fromPlayer.id);
        const previousArrival = s.drill.events[s.drill.events.length - 1]?.arrivalAt ?? 0;
        const pathTime = sourcePath
          ? getAuthoredReleaseProgress(s.drill, fromPlayer.id, authoredSource)
          : Math.max(0.12, previousArrival + 0.04);
        const at = Math.min(0.94, Math.max(pathTime, previousArrival + 0.04));
        const source = getAuthoredPlayerBlade(s.drill, fromPlayer.id, at) ?? authoredSource;
        const flight = Math.max(0.025, (distance(source, targetPoint) / 5) / 75 / s.playback.duration);
        const event: ShotEvent = {
          id: generateId(),
          type: 'shot',
          fromPlayerId: fromPlayer.id,
          fromPoint: source,
          toPoint: targetPoint,
          targetNet: targetPoint.x < RINK_CENTER_X ? 'L' : 'R',
          team: fromPlayer.team,
          at,
          arrivalAt: Math.min(1, at + flight),
        };
        dispatch({ type: 'ADD_SHOT', event });
      },

      addDump: (fromPlayer, targetPoint, fromPoint) => {
        const s = stateRef.current;
        const authoredSource = fromPoint ?? { x: fromPlayer.x, y: fromPlayer.y };
        const sourcePath = s.drill.skatePaths.find(path => path.ownerId === fromPlayer.id);
        const previousArrival = s.drill.events[s.drill.events.length - 1]?.arrivalAt ?? 0;
        const pathTime = sourcePath
          ? getAuthoredReleaseProgress(s.drill, fromPlayer.id, authoredSource)
          : Math.max(0.12, previousArrival + 0.04);
        const at = Math.min(0.94, Math.max(pathTime, previousArrival + 0.04));
        const source = getAuthoredPlayerBlade(s.drill, fromPlayer.id, at) ?? authoredSource;
        const flight = Math.max(0.035, (distance(source, targetPoint) / 5) / 50 / s.playback.duration);
        const event: DumpEvent = {
          id: generateId(),
          type: 'dump',
          fromPlayerId: fromPlayer.id,
          fromPoint: source,
          toPoint: targetPoint,
          targetNet: 'dump',
          team: fromPlayer.team,
          at,
          arrivalAt: Math.min(1, at + flight),
        };
        dispatch({ type: 'ADD_DUMP', event });
      },

      addPickup: player => {
        const s = stateRef.current;
        const last = s.drill.events[s.drill.events.length - 1];
        if (!last) return;
        const searchStart = Math.min(0.96, (last.arrivalAt ?? 0.72) + 0.01);
        let best: { at: number; puck: Point; stick: Point; gap: number } | null = null;

        for (let sample = 0; sample <= 48; sample++) {
          const at = searchStart + (0.98 - searchStart) * (sample / 48);
          const puck = getAuthoredPuck(s.drill, at);
          if (!puck || puck.state !== 'loose') continue;
          const stick = getAuthoredPlayerBlade(s.drill, player.id, at) ?? { x: player.x, y: player.y };
          const gap = distance(puck, stick);
          if (!best || gap < best.gap) {
            best = { at, puck: { x: puck.x, y: puck.y }, stick, gap };
          }
        }

        if (!best || best.gap > 32) {
          toast(
            `#${player.number} cannot reach the puck. Draw their route through the loose puck first.`,
            'error',
            4200
          );
          return;
        }

        const arrivalAt = Math.min(0.995, best.at + 0.02);
        const catchPoint = getAuthoredPlayerBlade(s.drill, player.id, arrivalAt) ?? best.stick;
        const event: PickupEvent = {
          id: generateId(),
          type: 'pickup',
          fromPlayerId: player.id,
          fromPoint: best.puck,
          toPoint: catchPoint,
          team: player.team,
          at: best.at,
          arrivalAt,
        };
        dispatch({ type: 'ADD_PICKUP', event });
      },

      selectPlayer: id => {
        dispatch({ type: 'SELECT_PLAYER', id });
        dispatch({ type: id ? 'SHOW_PLAYER_INFO' : 'HIDE_PLAYER_INFO' });
      },
      setPassFrom: id => dispatch({ type: 'SET_PASS_FROM', id }),
      selectEvent: id => dispatch({ type: 'SELECT_EVENT', id }),
      removeEvent: id => dispatch({ type: 'REMOVE_EVENT', id }),
      updatePassResult: (id, result) => dispatch({ type: 'UPDATE_PASS_RESULT', id, result }),
      updateShotResult: (id, result) => dispatch({ type: 'UPDATE_SHOT_RESULT', id, result }),
      convertDumpToPass: (eventId, receiverId) => {
        const s = stateRef.current;
        const existing = s.drill.events.find(event => event.id === eventId);
        const receiver = s.drill.players.find(player => player.id === receiverId);
        if (!existing || existing.type !== 'dump' || !receiver || receiver.id === existing.fromPlayerId) {
          toast('That receiver is not available for this puck action', 'error');
          return;
        }
        const at = existing.at ?? 0.5;
        const interception = getAuthoredPassInterception(s.drill, existing.fromPoint, receiver.id, at) ?? {
          toPoint: { x: receiver.x, y: receiver.y },
          arrivalAt: Math.min(0.98, at + 0.08),
        };
        const pass: PassEvent = {
          id: existing.id,
          type: 'pass',
          fromPlayerId: existing.fromPlayerId,
          toPlayerId: receiver.id,
          fromPoint: existing.fromPoint,
          toPoint: interception.toPoint,
          team: existing.team,
          at,
          arrivalAt: interception.arrivalAt,
        };
        dispatch({ type: 'CONVERT_DUMP_TO_PASS', event: pass });
        toast(`Pass assigned to #${receiver.number} — receiver will collect`, 'success', 3600);
      },
      retargetPass: (eventId, receiverId) => {
        const s = stateRef.current;
        const existing = s.drill.events.find(event => event.id === eventId);
        const receiver = s.drill.players.find(player => player.id === receiverId);
        if (!existing || existing.type !== 'pass' || !receiver || receiver.id === existing.fromPlayerId) {
          toast('That receiver is not available for this pass', 'error');
          return;
        }
        const at = existing.at ?? 0.5;
        const interception = getAuthoredPassInterception(s.drill, existing.fromPoint, receiver.id, at) ?? {
          toPoint: { x: receiver.x, y: receiver.y },
          arrivalAt: Math.min(0.98, at + 0.08),
        };
        dispatch({
          type: 'RETARGET_PASS',
          event: {
            ...existing,
            toPlayerId: receiver.id,
            toPoint: interception.toPoint,
            arrivalAt: interception.arrivalAt,
            catchResult: undefined,
            catchQuality: undefined,
          },
        });
        toast(`Receiver changed to #${receiver.number}`, 'success');
      },

      newDrill: () => dispatch({ type: 'NEW_DRILL' }),
      loadMechanicsDemo: () => {
        const now = Date.now();
        dispatch({
          type: 'LOAD_DRILL',
          drill: {
            ...structuredClone(giveAndGoRegressionDrill),
            id: generateId(),
            createdAt: now,
            updatedAt: now,
          },
        });
      },
      loadFiveManCornerRetrieval: () => {
        const now = Date.now();
        dispatch({
          type: 'LOAD_DRILL',
          drill: {
            ...structuredClone(fiveManCornerRetrievalDrill),
            id: generateId(),
            createdAt: now,
            updatedAt: now,
          },
        });
      },
      loadFiveManCrossCorner: () => {
        const now = Date.now();
        dispatch({
          type: 'LOAD_DRILL',
          drill: {
            ...structuredClone(fiveManCrossCornerDrill),
            id: generateId(),
            createdAt: now,
            updatedAt: now,
          },
        });
      },
      loadFiveManLowHigh: () => {
        const now = Date.now();
        dispatch({
          type: 'LOAD_DRILL',
          drill: {
            ...structuredClone(fiveManLowHighDrill),
            id: generateId(),
            createdAt: now,
            updatedAt: now,
          },
        });
      },
      renameDrill: name => dispatch({ type: 'RENAME_DRILL', name }),

      loadDrill: id => {
        const drill = getDrill(id);
        if (!drill) {
          toast('Could not load that drill', 'error');
          return;
        }
        dispatch({ type: 'LOAD_DRILL', drill });
        setCurrentDrillId(id);
      },

      saveDrill: () => {
        persistDrill(stateRef.current.drill);
        refreshDrillList();
        toast('Drill saved', 'success');
      },

      deleteDrill: id => {
        removeStoredDrill(id);
        dispatch({ type: 'DELETE_DRILL', id });

        // Deleting the drill you're looking at leaves nothing on screen, so
        // fall back to the next most recent, or a fresh drill.
        if (stateRef.current.drill.id === id) {
          const next = getDrillList().find(d => d.id !== id);
          const drill = next ? getDrill(next.id) : null;
          if (drill) {
            dispatch({ type: 'LOAD_DRILL', drill });
            setCurrentDrillId(drill.id);
          } else {
            dispatch({ type: 'NEW_DRILL' });
            setCurrentDrillId(null);
          }
        }
        toast('Drill deleted', 'success');
      },

      clearAllEvents: () => dispatch({ type: 'CLEAR_ALL_EVENTS' }),

      exportDrills: () => {
        // Flush the current drill first so an export never misses recent edits.
        persistDrill(stateRef.current.drill);
        const json = exportAllDrills();
        downloadFile('phicecraft-drills.json', json);
        toast('Drills exported', 'success');
      },

      importDrills: json => {
        const { imported, failed } = importDrillsJson(json);
        refreshDrillList();

        if (imported === 0) {
          toast('Nothing could be imported from that file', 'error');
          return;
        }

        // Show the user what they just imported rather than leaving them on the
        // old drill wondering whether it worked.
        const newest = getDrillList()[0];
        const drill = newest ? getDrill(newest.id) : null;
        if (drill) {
          dispatch({ type: 'LOAD_DRILL', drill });
          setCurrentDrillId(drill.id);
        }

        toast(
          failed > 0
            ? `Imported ${imported} drill(s), ${failed} failed`
            : `Imported ${imported} drill(s)`,
          failed > 0 ? 'warning' : 'success'
        );
      },

      setCamera: camera => dispatch({ type: 'SET_CAMERA', camera }),
      fitCamera: () => dispatch({ type: 'FIT_CAMERA' }),
      zoomToZone: zone => dispatch({ type: 'ZOOM_TO_ZONE', zone }),
      zoomAt: (factor, screenPoint) => dispatch({ type: 'ZOOM_AT', factor, screenPoint }),

      setInteraction: interaction => dispatch({ type: 'SET_INTERACTION', interaction }),
      resetInteraction: () => dispatch({ type: 'RESET_INTERACTION' }),

      startPlayback: () => dispatch({ type: 'START_PLAYBACK' }),
      stopPlayback: () => {
        dispatch({ type: 'STOP_PLAYBACK' });
        dispatch({ type: 'CLEAR_BANNERS' });
      },
      setPlaybackProgress: progress => dispatch({ type: 'SET_PLAYBACK_PROGRESS', progress }),
      setPlaybackSpeed: speed => dispatch({ type: 'SET_PLAYBACK_SPEED', speed }),
      resetPlayback: () => dispatch({ type: 'RESET_PLAYBACK' }),

      pushUndo: () => dispatch({ type: 'PUSH_UNDO' }),
      undo: () => {
        if (stateRef.current.undoStack.length === 0) {
          toast('Nothing to undo', 'info', 1200);
          return;
        }
        dispatch({ type: 'POP_UNDO' });
      },
      redo: () => {
        if (stateRef.current.redoStack.length === 0) {
          toast('Nothing to redo', 'info', 1200);
          return;
        }
        dispatch({ type: 'REDO' });
      },

      showToast: toast,
      toggleMenu: () => dispatch({ type: 'TOGGLE_MENU' }),
      closeMenu: () => dispatch({ type: 'CLOSE_MENU' }),
      showContextMenu: (position, playerId) =>
        dispatch({ type: 'SHOW_CONTEXT_MENU', position, playerId }),
      hideContextMenu: () => dispatch({ type: 'HIDE_CONTEXT_MENU' }),
      showRenameModal: () => dispatch({ type: 'SHOW_RENAME_MODAL' }),
      hideRenameModal: () => dispatch({ type: 'HIDE_RENAME_MODAL' }),
      showPlayerInfo: () => dispatch({ type: 'SHOW_PLAYER_INFO' }),
      hidePlayerInfo: () => dispatch({ type: 'HIDE_PLAYER_INFO' }),
      setModeBanner: message => dispatch({ type: 'SET_MODE_BANNER', message }),
      setPlayBanner: message => dispatch({ type: 'SET_PLAY_BANNER', message }),
      clearBanners: () => dispatch({ type: 'CLEAR_BANNERS' }),
      toggleDiagnostics: () => dispatch({ type: 'TOGGLE_DIAGNOSTICS' }),
    };
  }, []);

  const value = useMemo(() => ({ state, dispatch, actions }), [state, actions]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ============================================================================
// HOOKS
// ============================================================================

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return context;
}
