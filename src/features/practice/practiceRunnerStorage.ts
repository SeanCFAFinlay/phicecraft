// ============================================================================
// PRACTICE RUNNER STORAGE & HELPERS
// ============================================================================

export interface SessionRunState {
  sessionId: string;
  currentBlockIndex: number;
  currentRotation: number;
  accumulatedSeconds: number;
  isRunning: boolean;
  timerStartedAtTimestamp: number | null;
  completedBlockIds: string[];
  skippedBlockIds: string[];
  modifiedBlockIds: string[];
  observations: Record<string, string>;
}

export const RUNNER_STORAGE_KEY_PREFIX = 'phicecraft:practice_run:';

export function getSessionRunStorageKey(sessionId: string): string {
  return `${RUNNER_STORAGE_KEY_PREFIX}${sessionId}`;
}

export function createInitialRunState(sessionId: string): SessionRunState {
  return {
    sessionId,
    currentBlockIndex: 0,
    currentRotation: 1,
    accumulatedSeconds: 0,
    isRunning: false,
    timerStartedAtTimestamp: null,
    completedBlockIds: [],
    skippedBlockIds: [],
    modifiedBlockIds: [],
    observations: {},
  };
}

export function loadSessionRunState(sessionId: string): SessionRunState {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return createInitialRunState(sessionId);
  }
  try {
    const raw = localStorage.getItem(getSessionRunStorageKey(sessionId));
    if (!raw) return createInitialRunState(sessionId);
    const parsed = JSON.parse(raw) as SessionRunState;
    // Calculate elapsed time if it was running across suspension/reload
    if (parsed.isRunning && parsed.timerStartedAtTimestamp) {
      const now = Date.now();
      const elapsedSinceStart = Math.max(0, Math.floor((now - parsed.timerStartedAtTimestamp) / 1000));
      return {
        ...parsed,
        accumulatedSeconds: parsed.accumulatedSeconds + elapsedSinceStart,
        timerStartedAtTimestamp: now,
      };
    }
    return parsed;
  } catch {
    return createInitialRunState(sessionId);
  }
}

export function saveSessionRunState(state: SessionRunState): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getSessionRunStorageKey(state.sessionId), JSON.stringify(state));
  } catch {
    // quota or storage disabled
  }
}

export function clearSessionRunState(sessionId: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(getSessionRunStorageKey(sessionId));
  } catch {
    // ignore
  }
}
