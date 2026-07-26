// ============================================================================
// WHAT THE PUCK CAN DO RIGHT NOW
//
// Derived once, from the domain rules, so every control that offers Pass or
// Shoot agrees on whether they are available and on why not.
// ============================================================================

import { useAppState } from '@/hooks/useAppState';
import {
  canAddEvents,
  countPasses,
  getCurrentPuckHolder,
  MAX_PASSES_PER_DRILL,
} from '@/engine/puck';
import type { Player } from '@/core/types';

export interface PuckActionsState {
  carrier: Player | null;
  /** Passes already in the drill, and how many are left. */
  passesUsed: number;
  passesLeft: number;
  canPass: boolean;
  canShoot: boolean;
  /** Why Pass is unavailable, for the button's title and screen readers. */
  passBlockedReason: string | null;
}

export function usePuckActions(): PuckActionsState {
  const { state } = useAppState();
  const { players, events } = state.drill;

  const carrier = getCurrentPuckHolder(players, events);
  const passesUsed = countPasses(events);
  const passesLeft = Math.max(0, MAX_PASSES_PER_DRILL - passesUsed);
  const open = canAddEvents(events);

  const passBlockedReason = !carrier
    ? 'No one has the puck yet'
    : !open
      ? 'The drill has already ended'
      : passesLeft === 0
        ? `A drill holds ${MAX_PASSES_PER_DRILL} passes`
        : null;

  return {
    carrier,
    passesUsed,
    passesLeft,
    canPass: !!carrier && open && passesLeft > 0,
    canShoot: !!carrier && open,
    passBlockedReason,
  };
}
