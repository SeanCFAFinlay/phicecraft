import type { ID } from '@/core/types';

export interface PossessionState {
  carrierId: ID | null;
  releasedById: ID | null;
}

export function transferPossession(state: PossessionState, nextCarrierId: ID | null): PossessionState {
  if (state.carrierId === nextCarrierId) return state;
  return { carrierId: nextCarrierId, releasedById: state.carrierId };
}
