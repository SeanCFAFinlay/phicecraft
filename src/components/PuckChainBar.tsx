// ============================================================================
// PUCK CHAIN BAR - Shows sequence of puck possession
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';
import { getPuckChain } from '@/engine/puck';

export function PuckChainBar() {
  const { state } = useAppState();
  const chain = getPuckChain(state.drill.players, state.drill.events);

  return (
    <div className="flex-shrink-0 h-8 flex items-center gap-1.5 px-2.5 bg-[rgba(6,14,22,0.95)] border-b border-app-border overflow-x-auto scrollbar-hide">
      <span className="text-[9px] tracking-wider text-app-dim uppercase flex-shrink-0 whitespace-nowrap">
        PUCK CHAIN:
      </span>

      {chain.length === 0 ? (
        <span className="text-[10px] text-white/20">
          No puck carrier — tap a player → Give Puck
        </span>
      ) : (
        chain.map((node, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <span className={`text-[11px] ${
                node.action === 'shot' || node.action === 'dump'
                  ? 'text-app-orange'
                  : 'text-app-gold'
              }`}>
                {node.action === 'shot' || node.action === 'dump' ? ' 🏒 ' : ' → '}
              </span>
            )}

            {node.action === 'shot' || node.action === 'dump' ? (
              <div
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[8px] font-extrabold flex-shrink-0"
                style={{
                  background: 'rgba(255, 107, 15, 0.2)',
                  borderColor: 'rgba(255, 107, 15, 0.7)',
                  borderWidth: '2px',
                  borderStyle: 'solid',
                  color: '#ff6b0f',
                }}
              >
                GOAL
              </div>
            ) : node.player ? (
              <div
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-extrabold flex-shrink-0 border-2 ${
                  node.player.team === 'home'
                    ? 'bg-home/25 border-home/60 text-[#ff8090]'
                    : 'bg-away/25 border-away/60 text-[#72b8ec]'
                }`}
              >
                #{node.player.number}
              </div>
            ) : null}
          </React.Fragment>
        ))
      )}
    </div>
  );
}
