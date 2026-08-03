// ============================================================================
// EDITOR RUNTIME
//
// The high-frequency systems: the camera store, the playback frame store, the
// requestAnimationFrame clock, and the hold-to-move progress indicator.
//
// They live in a separate context from application state on purpose. Nothing
// in here republishes the app when it changes - consumers subscribe to the one
// store they display.
// ============================================================================

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { CameraStore } from '@/camera/CameraStore';
import type { PlaybackStore } from '@/playback/PlaybackStore';
import { PlaybackController } from '@/playback/PlaybackController';
import type { HoldProgressStore, HoldProgressSnapshot } from '@/ui/HoldProgressStore';
import type { QualityStore } from '@/render/qualityStore';
import { useAppState } from './useAppState';

// ----------------------------------------------------------------------------

export interface EditorRuntime {
  camera: CameraStore;
  playback: PlaybackStore;
  controller: PlaybackController;
  holdProgress: HoldProgressStore;
  /** The auto-degrade render-quality tier, shared by the 2D canvas path and Board3D. */
  quality: QualityStore;
}

const RuntimeContext = createContext<EditorRuntime | null>(null);

/**
 * The camera and frame stores are created by `AppProvider` (the command layer
 * needs them too). This provider adds the clock that drives them and the
 * effects that keep them in step with the document.
 */
export function EditorRuntimeProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, commands, services } = useAppState();

  const stateRef = useRef(state);
  stateRef.current = state;

  const runtime = useMemo<EditorRuntime>(() => {
    const controller = new PlaybackController(services.playback, {
      onComplete: () => {
        dispatch({ type: 'STOP_PLAYBACK' });
        dispatch({ type: 'CLEAR_BANNERS' });
        // Reaching the end IS the review, provided the drill still validates.
        commands.completeReview({ announce: false });

        const events = stateRef.current.drill.events;
        const final = events[events.length - 1];
        const scored = final?.type === 'shot' && (final.result ?? 'goal') === 'goal';
        dispatch({
          type: 'SET_PLAYBACK_LIFECYCLE',
          lifecycle: scored ? 'success' : 'review',
        });
      },
    });

    return {
      camera: services.camera,
      playback: services.playback,
      holdProgress: services.holdProgress,
      quality: services.quality,
      controller,
    };
  }, [services, dispatch, commands]);

  // Keep the frame store pointed at the current document.
  useEffect(() => {
    runtime.playback.setDrill(state.drill);
  }, [runtime, state.drill]);

  // Start and stop the clock from the coarse lifecycle flag only.
  useEffect(() => {
    if (state.playback.isPlaying) {
      runtime.playback.seek(0);
      runtime.controller.start(state.playback.speed);
    } else {
      runtime.controller.stop();
    }
    return () => runtime.controller.stop();
  }, [runtime, state.playback.isPlaying, state.playback.speed]);

  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useEditorRuntime(): EditorRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error('useEditorRuntime must be used within an EditorRuntimeProvider');
  }
  return runtime;
}

/** The hold-to-move progress, for the single component that renders it. */
export function useHoldProgress(): HoldProgressSnapshot {
  const { holdProgress } = useEditorRuntime();
  return useSyncExternalStore(holdProgress.subscribe, holdProgress.getSnapshot, holdProgress.getSnapshot);
}
