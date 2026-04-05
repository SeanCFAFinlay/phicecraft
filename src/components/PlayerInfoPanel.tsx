// ============================================================================
// PLAYER INFO PANEL - Shows selected player details
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';
import { getCurrentPuckHolder } from '@/engine/puck';
import { ROLE_NAMES } from '@/core/constants';

export function PlayerInfoPanel() {
  const { state, actions } = useAppState();

  if (!state.ui.showPlayerInfo || !state.selection.selectedPlayerId) {
    return null;
  }

  const player = state.drill.players.find(p => p.id === state.selection.selectedPlayerId);
  if (!player) return null;

  const holder = getCurrentPuckHolder(state.drill.players, state.drill.events);
  const hasPuck = holder?.id === player.id || (player.hasPuck && state.drill.events.length === 0);

  const handleClose = () => {
    actions.selectPlayer(null);
    actions.hideContextMenu();
  };

  return (
    <div
      className={`absolute top-1.5 right-1.5 bg-app-surface border border-app-border rounded-xl py-3 px-3.5 z-[15] min-w-[135px] shadow-xl transition-transform ${
        state.ui.showPlayerInfo ? 'translate-x-0' : 'translate-x-[160%]'
      }`}
    >
      <button
        onClick={handleClose}
        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/10 border-none text-app-dim text-xs cursor-pointer flex items-center justify-center hover:bg-white/20"
      >
        ✕
      </button>

      <div className="text-base font-extrabold text-app-text">
        #{player.number} — {player.role}
      </div>

      <div className="text-[10px] text-app-dim mt-0.5">
        {ROLE_NAMES[player.role] || 'Player'}
      </div>

      <div
        className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold ${
          player.team === 'home'
            ? 'bg-home/15 text-[#ff8090]'
            : 'bg-away/15 text-[#70b6ec]'
        }`}
      >
        {player.team === 'home' ? 'HOME' : 'AWAY'}
      </div>

      {hasPuck && (
        <div className="text-[10px] text-app-gold mt-1">
          🏒 Has Puck
        </div>
      )}
    </div>
  );
}
