// ============================================================================
// WHAT THE PUCK CAN DO RIGHT NOW
//
// Derived once, from the domain rules, so every control that offers Pass or
// Shoot agrees on whether they are available and on why not.
// ============================================================================

import { useAppState } from '@/hooks/useAppState';
import { canAddEvents, countPasses, getCurrentPuckHolder } from '@/engine/puck';
import type { Player } from '@/core/types';

export interface PuckActionsState {
  carrier: Player | null;
  /** Passes already in the drill. A readout only - there is no maximum. */
  passesUsed: number;
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
  const open = canAddEvents(events);

  const passBlockedReason = !carrier
    ? 'No one has the puck yet'
    : !open
      ? 'The drill has already ended'
      : null;

  return {
    carrier,
    passesUsed,
    canPass: !!carrier && open,
    canShoot: !!carrier && open,
    passBlockedReason,
  };
}
