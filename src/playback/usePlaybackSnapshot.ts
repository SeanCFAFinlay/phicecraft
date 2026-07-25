// ============================================================================
// PLAYBACK / CAMERA REACT BINDINGS
//
// useSyncExternalStore, so a component subscribes to exactly the store it
// displays and nothing else re-renders when that store changes.
// ============================================================================

import { useSyncExternalStore } from 'react';
import type { CameraStore, CameraSnapshot } from '@/camera/CameraStore';
import type { PlaybackStore, PlaybackDisplaySnapshot } from './PlaybackStore';

/** Coarse playback state: progress to the nearest percent, duration, lifecycle. */
export function usePlaybackSnapshot(store: PlaybackStore): PlaybackDisplaySnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useCameraSnapshot(store: CameraStore): CameraSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
