// ============================================================================
// PASS OVERLAY - Shows currently selected passer
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';

export function PassOverlay() {
  const { state } = useAppState();

  if (!state.selection.passFromPlayerId) return null;

  const player = state.drill.players.find(p => p.id === state.selection.passFromPlayerId);
  if (!player) return null;

  return (
    <div className="absolute bottom-[90px] left-1/2 -translate-x-1/2 bg-[rgba(6,14,22,0.92)] border-2 border-app-gold rounded-xl py-2 px-4 z-[22] flex items-center gap-2.5 pointer-events-none">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 border-2 ${
          player.team === 'home'
            ? 'bg-home/30 border-home/70 text-[#ff8090]'
            : 'bg-away/30 border-away/70 text-[#70b6ec]'
        }`}
      >
        #{player.number}
      </div>
      <div className="text-xs font-bold text-app-gold">
        Tap a teammate to pass
      </div>
    </div>
  );
}
