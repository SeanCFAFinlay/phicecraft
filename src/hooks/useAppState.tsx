// ============================================================================
// APP STATE - reducer, context, and the command-service host
//
// This file no longer owns persistence, import/export, gestures, or playback.
// It owns exactly three things:
//   1. the low-frequency editor state (reducer + context),
//   2. the wiring that gives the command service what it needs,
//   3. the auto-save trigger.
// Everything else lives in src/commands, src/persistence, src/playback,
// src/camera, and src/editor/input.
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
import type { AppState, AppAction } from '@/core/types';
import { createInitialState, appReducer } from '@/core/state';
import { AUTOSAVE_DELAY, TOAST_PRIORITY } from '@/core/constants';
import { createDrillCommandService, type DrillCommandService, type Notifier, type ToastInput } from '@/commands';
import { getRepository, getSaveCoordinator, type DrillRepository, type SaveCoordinator } from '@/persistence';
import { DialogController } from '@/ui/DialogController';
import { Announcer } from '@/ui/announcer';
import { ImportPreviewStore } from '@/ui/ImportPreviewStore';
import { HoldProgressStore } from '@/ui/HoldProgressStore';
import { CameraStore } from '@/camera/CameraStore';
import { PlaybackStore } from '@/playback/PlaybackStore';
import { downloadTextFile } from '@/ui/download';
import { generateId } from '@/utils/id';

// ============================================================================
// CONTEXT
// ============================================================================

export interface AppServices {
  repository: DrillRepository;
  coordinator: SaveCoordinator;
  dialogs: DialogController;
  announcer: Announcer;
  importPreviews: ImportPreviewStore;
  /** High-frequency stores. React reads them through useSyncExternalStore. */
  camera: CameraStore;
  playback: PlaybackStore;
  holdProgress: HoldProgressStore;
}

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  commands: DrillCommandService;
  services: AppServices;
}

const AppContext = createContext<AppContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export interface AppProviderProps {
  children: ReactNode;
  /** Tests inject their own repository, coordinator, and clock. */
  services?: Partial<AppServices>;
  now?: () => number;
  /** Disable the initial load, for isolated component tests. */
  autoInitialize?: boolean;
}

export function AppProvider({ children, services, now, autoInitialize = true }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState);

  // Commands must never go stale, so anything reading current state does so
  // through this ref rather than closing over a render's value.
  const stateRef = useRef(state);
  stateRef.current = state;

  const resolvedServices = useMemo<AppServices>(
    () => ({
      repository: services?.repository ?? getRepository(),
      coordinator: services?.coordinator ?? getSaveCoordinator(),
      dialogs: services?.dialogs ?? new DialogController(),
      announcer: services?.announcer ?? new Announcer(),
      importPreviews: services?.importPreviews ?? new ImportPreviewStore(),
      camera: services?.camera ?? new CameraStore(),
      playback: services?.playback ?? new PlaybackStore(),
      holdProgress: services?.holdProgress ?? new HoldProgressStore(),
    }),
    [
      services?.repository,
      services?.coordinator,
      services?.dialogs,
      services?.announcer,
      services?.importPreviews,
      services?.camera,
      services?.playback,
      services?.holdProgress,
    ]
  );

  const commands = useMemo<DrillCommandService>(() => {
    const notify: Notifier = {
      toast(input: ToastInput) {
        const type = input.type ?? 'info';
        dispatch({
          type: 'ENQUEUE_TOAST',
          toast: {
            id: generateId(),
            message: input.message,
            type,
            duration: input.duration ?? (type === 'error' ? 0 : 3000),
            role: input.role ?? (type === 'error' ? 'alert' : 'status'),
            priority: input.priority ?? TOAST_PRIORITY[type],
            dedupeKey: input.dedupeKey ?? input.message,
          },
        });
      },
      dismiss(id) {
        dispatch({ type: 'DISMISS_TOAST', id });
      },
    };

    return createDrillCommandService({
      getState: () => stateRef.current,
      dispatch,
      repository: resolvedServices.repository,
      coordinator: resolvedServices.coordinator,
      camera: resolvedServices.camera,
      playback: resolvedServices.playback,
      notify,
      confirm: resolvedServices.dialogs.confirm,
      promptForText: resolvedServices.dialogs.promptForText,
      confirmUnsavedExport: resolvedServices.dialogs.confirmUnsavedExport,
      download: downloadTextFile,
      announce: resolvedServices.announcer.announce,
      publishImportPreview: preview => resolvedServices.importPreviews.set(preview),
      now: now ?? Date.now,
    });
  }, [resolvedServices, now]);

  // Open storage, migrate legacy data, and restore the last drill.
  useEffect(() => {
    if (!autoInitialize) return;
    void commands.initialize();
  }, [commands, autoInitialize]);

  // Auto-save on idle.
  //
  // The edit is marked dirty immediately, so the status bar is honest the
  // moment something changes, and the write itself is debounced. `flush()`
  // is a no-op when the document is already durable, so loading a drill (which
  // the command layer adopts as saved) does not trigger a pointless write.
  const coordinator = resolvedServices.coordinator;
  useEffect(() => {
    if (coordinator.pendingDocument === state.drill) return;
    coordinator.markDirty(state.drill);
  }, [state.drill, coordinator]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void coordinator.flush();
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [state.drill, coordinator]);

  const value = useMemo(
    () => ({ state, dispatch, commands, services: resolvedServices }),
    [state, commands, resolvedServices]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ============================================================================
// HOOKS
// ============================================================================

export function useAppState(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return context;
}

/** Just the command service, for views that only issue commands. */
export function useCommands(): DrillCommandService {
  return useAppState().commands;
}

export function useAppServices(): AppServices {
  return useAppState().services;
}
