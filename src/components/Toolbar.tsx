// ============================================================================
// TOOLBAR - Tool selection bar
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';
import type { Tool } from '@/core/types';

interface ToolButtonProps {
  tool: Tool;
  icon: string;
  label: string;
  variant?: 'default' | 'gold' | 'red';
}

function ToolButton({ tool, icon, label, variant = 'default' }: ToolButtonProps) {
  const { state, actions } = useAppState();
  const isActive = state.ui.currentTool === tool;

  const variantClasses = {
    default: isActive ? 'bg-app-cyan/15 border-app-cyan text-app-cyan' : '',
    gold: isActive ? 'bg-app-gold/15 border-app-gold text-app-gold' : '',
    red: isActive ? 'bg-app-orange/15 border-app-orange text-app-orange' : '',
  };

  return (
    <button
      onClick={() => actions.setTool(tool)}
      className={`flex flex-col items-center gap-[3px] bg-white/5 border-[1.5px] border-transparent rounded-[9px] py-[7px] px-1 cursor-pointer text-app-dim min-w-[42px] flex-shrink-0 transition-all active:scale-[0.88] ${variantClasses[variant]}`}
    >
      <span className="text-[17px] leading-tight">{icon}</span>
      <span className="text-[8px] font-extrabold uppercase tracking-tight whitespace-nowrap">{label}</span>
    </button>
  );
}

function ToolSeparator() {
  return <div className="w-px h-[26px] bg-app-border self-center mx-0.5 flex-shrink-0" />;
}

export function Toolbar() {
  return (
    <div className="absolute bottom-[72px] left-0 right-0 flex justify-center pointer-events-none z-[15]">
      <div className="flex items-center gap-0.5 bg-app-surface border border-app-border rounded-2xl px-2 py-1 pb-2 pointer-events-auto overflow-x-auto max-w-[calc(100vw-14px)] scrollbar-hide">
        <ToolButton tool="select" icon="↖" label="Select" />
        <ToolButton tool="skate" icon="〰" label="Skate" />
        <ToolButton tool="pass" icon="⟶" label="Pass" variant="gold" />
        <ToolButton tool="shoot" icon="🥅" label="Shoot" variant="red" />

        <ToolSeparator />

        <ToolButton tool="home" icon="🔴" label="Home" />
        <ToolButton tool="away" icon="🔵" label="Away" />
        <ToolButton tool="goalie" icon="🧤" label="Goalie" />

        <ToolSeparator />

        <ToolButton tool="erase" icon="⌫" label="Erase" />
      </div>
    </div>
  );
}
