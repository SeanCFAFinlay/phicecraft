// ============================================================================
// PLAYER INFO PANEL - Shows selected player details
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';
import { getCurrentPuckHolder } from '@/engine/puck';
import { ROLE_NAMES } from '@/core/constants';
import { distance } from '@/utils/geometry';

export function PlayerInfoPanel() {
  const { state, actions } = useAppState();

  if (!state.ui.showPlayerInfo || !state.selection.selectedPlayerId) {
    return null;
  }

  const player = state.drill.players.find(p => p.id === state.selection.selectedPlayerId);
  if (!player) return null;

  const holder = getCurrentPuckHolder(state.drill.players, state.drill.events);
  const hasPuck = holder?.id === player.id || (player.hasPuck && state.drill.events.length === 0);
  const lastEvent = state.drill.events[state.drill.events.length - 1];
  const hasLoosePuck = !holder && Boolean(lastEvent) && (
    lastEvent.type === 'dump' ||
    (lastEvent.type === 'pass' && lastEvent.catchResult === 'missed') ||
    (lastEvent.type === 'shot' && lastEvent.result === 'rebound')
  );
  const route = state.drill.skatePaths.find(path => path.ownerId === player.id);
  const routeFeet = route
    ? route.points.slice(1).reduce((sum, point, index) => sum + distance(route.points[index], point), 0) / 5
    : 0;

  const handleClose = () => {
    actions.selectPlayer(null);
    actions.hideContextMenu();
  };

  return (
    <div
      className={`fixed top-24 right-3 bg-[#081522]/95 backdrop-blur-md border border-app-cyan/25 rounded-2xl py-4 px-4 z-50 w-[230px] shadow-2xl transition-transform ${
        state.ui.showPlayerInfo ? 'translate-x-0' : 'translate-x-[160%]'
      }`}
    >
      <button
        onClick={handleClose}
        aria-label="Close player details"
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

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-app-dim">Movement</div>
        <div className="mt-1.5 text-[11px] leading-relaxed text-white/65">
          Drag the player to reposition. Drag the cyan skate handle to create the route.
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-2 text-[10px]">
          <span className="text-white/45">Route</span>
          <span className={route ? 'font-bold text-app-cyan' : 'text-white/30'}>
            {route ? `${Math.round(routeFeet)} ft` : 'Not drawn'}
          </span>
        </div>
        <button
          onClick={() => {
            actions.setEditorStep('movement');
            actions.setTool('skate');
            actions.showToast(`Drag from #${player.number} to draw a skating route`, 'info');
          }}
          className="mt-2 w-full rounded-lg border border-app-cyan/30 bg-app-cyan/10 px-3 py-2 text-[10px] font-bold text-app-cyan hover:bg-app-cyan/15"
        >
          ⛸ Draw / Replace Route
        </button>
        {route && (
          <>
            <div className="mt-2 grid grid-cols-3 gap-1" aria-label="Skating style">
              {(['skate', 'glide', 'backward'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => actions.updateSkatePath(route.id, { mode, finish: route.finish ?? 'stop' })}
                  className={`rounded-md border px-1 py-1.5 text-[8px] font-black uppercase ${(route.mode ?? 'skate') === mode ? 'border-cyan-300/50 bg-cyan-300/15 text-cyan-200' : 'border-white/10 text-white/35'}`}
                >{mode}</button>
              ))}
            </div>
            <button
              onClick={() => actions.updateSkatePath(route.id, { mode: route.mode ?? 'skate', finish: route.finish === 'coast' ? 'stop' : 'coast' })}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-bold text-white/55 hover:bg-white/10"
            >
              Finish: {(route.finish ?? 'stop') === 'stop' ? 'Hockey stop' : 'Coast'}
            </button>
            <button
              onClick={() => actions.removeSkatePath(route.id)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-white/55 hover:bg-white/10"
            >
              Remove Route
            </button>
          </>
        )}
      </div>

      {player.role !== 'G' && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-app-dim">Skater detail</div>
          <button
            onClick={() => actions.updatePlayerVisual(player.id, { handedness: player.visual?.handedness === 'left' ? 'right' : 'left' })}
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-bold text-white/60"
          >
            Stick: {(player.visual?.handedness ?? 'right')}-handed
          </button>
        </div>
      )}

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-app-dim">Puck actions</div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            disabled={!hasPuck}
            onClick={() => {
              actions.setEditorStep('puck');
              actions.setTool('pass');
            }}
            className="rounded-lg border border-app-gold/30 bg-app-gold/10 px-2 py-2 text-[10px] font-bold text-app-gold disabled:opacity-30"
          >
            → Pass
          </button>
          <button
            disabled={!hasPuck}
            onClick={() => {
              actions.setEditorStep('puck');
              actions.setTool('shoot');
            }}
            className="rounded-lg border border-app-orange/30 bg-app-orange/10 px-2 py-2 text-[10px] font-bold text-app-orange disabled:opacity-30"
          >
            🥅 Shoot
          </button>
        </div>
        {!hasPuck && state.drill.events.length === 0 && (
          <button
            onClick={() => actions.setPuckCarrier(player.id)}
            className="mt-1.5 w-full rounded-lg border border-app-gold/30 bg-app-gold/10 px-3 py-2 text-[10px] font-bold text-app-gold"
          >
            Set as Puck Carrier
          </button>
        )}
        {hasLoosePuck && (
          <button
            onClick={() => {
              actions.addPickup(player);
              actions.showToast(`#${player.number} recovers the loose puck`, 'success');
            }}
            className="mt-1.5 w-full rounded-lg border border-green-400/30 bg-green-400/10 px-3 py-2 text-[10px] font-bold text-green-300"
          >
            Recover Loose Puck
          </button>
        )}
      </div>

      <button
        onClick={() => {
          if (!confirm(`Remove #${player.number} from this drill?`)) return;
          actions.removePlayer(player.id);
          actions.selectPlayer(null);
          actions.showToast(`#${player.number} removed`, 'success');
        }}
        className="mt-3 w-full rounded-lg border border-red-400/20 bg-red-500/5 px-3 py-2 text-[10px] font-bold text-red-300/80 hover:bg-red-500/10"
      >
        Remove Player
      </button>
    </div>
  );
}
