// ============================================================================
// TOOLBAR - Tool selection bar (fixed row)
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';
import type { Tool } from '@/core/types';

interface ToolButtonProps {
  tool: Tool;
  icon: string;
  label: string;
  color?: string;
}

function ToolButton({ tool, icon, label, color }: ToolButtonProps) {
  const { state, actions } = useAppState();
  const isActive = state.ui.currentTool === tool;

  const activeColor = color || '#00c8f0';
  const activeBg = color ? `${color}20` : 'rgba(0, 200, 240, 0.15)';

  return (
    <button
      onClick={() => actions.setTool(tool)}
      style={isActive ? {
        backgroundColor: activeBg,
        borderColor: activeColor,
        color: activeColor
      } : {}}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-2 px-3 min-w-[52px] cursor-pointer border-2 transition-all active:scale-95 ${
        isActive
          ? ''
          : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[9px] font-bold uppercase tracking-tight">{label}</span>
    </button>
  );
}

export function Toolbar() {
  return (
    <div className="flex-shrink-0 bg-[#0c1825] border-t border-[#1a3045] px-2 py-2">
      <div className="flex items-center justify-center gap-1 overflow-x-auto scrollbar-hide">
        {/* Selection & Drawing */}
        <ToolButton tool="select" icon="✋" label="Select" />
        <ToolButton tool="skate" icon="⛸️" label="Skate" />

        {/* Puck actions */}
        <div className="w-px h-8 bg-[#1a3045] mx-1" />
        <ToolButton tool="pass" icon="➡️" label="Pass" color="#ffd60a" />
        <ToolButton tool="shoot" icon="🏒" label="Shoot" color="#ff6b0f" />

        {/* Add players */}
        <div className="w-px h-8 bg-[#1a3045] mx-1" />
        <ToolButton tool="home" icon="🔴" label="Home" color="#e63946" />
        <ToolButton tool="away" icon="🔵" label="Away" color="#3a86ff" />
        <ToolButton tool="goalie" icon="🥅" label="Goalie" />

        {/* Erase */}
        <div className="w-px h-8 bg-[#1a3045] mx-1" />
        <ToolButton tool="erase" icon="🗑️" label="Erase" color="#ef4444" />
      </div>
    </div>
  );
}
