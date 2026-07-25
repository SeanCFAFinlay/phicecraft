// ============================================================================
// VALIDATION AND EVENT-OUTCOME CACHES
//
// Both are keyed to `documentRevision`, not to playback progress.
//
// Before this, `ValidationPanel` and `EventInfoPanel` each called
// `compileDrill()` + `sampleFrame()` inside render - so during playback, with
// the reducer republishing on every tick, a hidden panel re-simulated the whole
// drill 60 times a second.
// ============================================================================

import { useMemo } from 'react';
import type { Drill, ID } from '@/core/types';
import { validateDrillMechanics, type MechanicsIssue } from '@/engine/drillValidation';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame } from '@/sim/sampleFrame';
import { useAppState } from '@/hooks/useAppState';

interface RevisionCache<T> {
  revision: number;
  drill: Drill | null;
  value: T | null;
}

const validationCache: RevisionCache<MechanicsIssue[]> = { revision: -1, drill: null, value: null };
const outcomeCache: RevisionCache<Map<ID, string>> = { revision: -1, drill: null, value: null };

function readCache<T>(cache: RevisionCache<T>, revision: number, drill: Drill, compute: () => T): T {
  if (cache.revision === revision && cache.drill === drill && cache.value !== null) {
    return cache.value;
  }
  const value = compute();
  cache.revision = revision;
  cache.drill = drill;
  cache.value = value;
  return value;
}

/** Blocking errors and warnings for the current document revision. */
export function useDrillValidation(): MechanicsIssue[] {
  const { state } = useAppState();
  const { drill, documentRevision } = state;

  return useMemo(
    () => readCache(validationCache, documentRevision, drill, () => validateDrillMechanics(drill)),
    [drill, documentRevision]
  );
}

/**
 * The engine's final outcome for each event, by event ID. Computed once per
 * document revision from the FINAL frame - never re-sampled per playback tick.
 */
export function useEventOutcomes(): Map<ID, string> {
  const { state } = useAppState();
  const { drill, documentRevision } = state;

  return useMemo(
    () =>
      readCache(outcomeCache, documentRevision, drill, () => {
        const compiled = compileDrill(drill);
        const final = sampleFrame(compiled, compiled.durationSeconds);
        const outcomes = new Map<ID, string>();
        for (const execution of final.eventExecutions) {
          if (execution.outcome) outcomes.set(execution.eventId, execution.outcome);
        }
        return outcomes;
      }),
    [drill, documentRevision]
  );
}

/** Test hook: forget both caches. */
export function __resetValidationCaches(): void {
  validationCache.revision = -1;
  validationCache.drill = null;
  validationCache.value = null;
  outcomeCache.revision = -1;
  outcomeCache.drill = null;
  outcomeCache.value = null;
}
