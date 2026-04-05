// ============================================================================
// SIDE MENU - Slide-out navigation menu
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';

interface MenuItemProps {
  icon: string;
  label: string;
  onClick: () => void;
  dim?: boolean;
}

function MenuItem({ icon, label, onClick, dim }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 py-3 px-3.5 text-[13px] cursor-pointer border-l-2 border-transparent transition-colors text-left w-full bg-transparent text-app-text ${
        dim ? 'opacity-30' : ''
      } hover:bg-app-cyan/5 hover:border-l-app-cyan hover:text-app-cyan active:bg-app-cyan/10`}
    >
      <span className="text-[15px] w-5 text-center">{icon}</span>
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="h-px bg-app-border mx-3.5 my-1" />;
}

function MenuSection({ title }: { title: string }) {
  return (
    <div className="px-3.5 pt-2.5 pb-0.5 text-[9px] tracking-wider text-app-cyan uppercase font-bold">
      {title}
    </div>
  );
}

export function SideMenu() {
  const { state, actions } = useAppState();

  const handleNewDrill = () => {
    if (!confirm('Start new drill?')) return;
    actions.stopPlayback();
    actions.newDrill();
    actions.closeMenu();
    actions.showToast('New drill', 'success');
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={actions.closeMenu}
        className={`fixed inset-0 bg-black/50 z-[70] transition-opacity ${
          state.ui.showMenu
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Menu */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-[min(280px,85vw)] bg-[rgba(5,12,20,0.99)] border-r border-app-border z-[80] flex flex-col overflow-y-auto transition-transform duration-300 ${
          state.ui.showMenu ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 p-4 border-b border-app-border">
          <div className="w-[42px] h-[42px] rounded-lg bg-app-surface flex items-center justify-center text-app-cyan text-xl">
            🏒
          </div>
          <div>
            <div className="text-base font-black tracking-wider text-white">
              PHICE<span className="text-app-cyan">CRAFT</span>
            </div>
            <div className="text-[9px] tracking-wider text-app-dim uppercase mt-0.5">
              Hockey Drill Designer
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <MenuSection title="Quick Actions" />
        <MenuItem
          icon="▶"
          label="Play Drill"
          onClick={() => {
            actions.closeMenu();
            setTimeout(() => actions.startPlayback(), 300);
          }}
        />
        <MenuItem
          icon="⟶"
          label="Pass Tool"
          onClick={() => {
            actions.setTool('pass');
            actions.closeMenu();
          }}
        />
        <MenuItem
          icon="🥅"
          label="Shoot Tool"
          onClick={() => {
            actions.setTool('shoot');
            actions.closeMenu();
          }}
        />
        <MenuItem
          icon="〰"
          label="Skate Tool"
          onClick={() => {
            actions.setTool('skate');
            actions.closeMenu();
          }}
        />

        <MenuDivider />

        {/* Drill */}
        <MenuSection title="Drill" />
        <MenuItem
          icon="✏️"
          label="Rename Drill"
          onClick={() => {
            actions.closeMenu();
            setTimeout(() => actions.showRenameModal(), 300);
          }}
        />
        <MenuItem
          icon="🏒"
          label="New Drill"
          onClick={handleNewDrill}
        />

        <MenuDivider />

        {/* View */}
        <MenuSection title="View" />
        <MenuItem
          icon="⛸"
          label="Full Rink"
          onClick={() => {
            actions.fitCamera();
            actions.closeMenu();
          }}
        />
        <MenuItem
          icon="▶"
          label="Offensive Zone"
          onClick={() => {
            actions.zoomToZone('offensive');
            actions.closeMenu();
          }}
        />
        <MenuItem
          icon="◀"
          label="Defensive Zone"
          onClick={() => {
            actions.zoomToZone('defensive');
            actions.closeMenu();
          }}
        />

        <MenuDivider />

        {/* How To Use */}
        <MenuSection title="How To Use" />
        <MenuItem icon="🏒" label="Tap player with puck → Pass/Shoot" onClick={() => {}} dim />
        <MenuItem icon="⟶" label="Pass tool: tap passer → tap receiver" onClick={() => {}} dim />
        <MenuItem icon="〰" label="Drag any player → draws skate route" onClick={() => {}} dim />
        <MenuItem icon="✋" label="Hold player (0.8s) → reposition" onClick={() => {}} dim />
        <MenuItem icon="🤏" label="Pinch → zoom in/out" onClick={() => {}} dim />

        <MenuDivider />

        {/* Version */}
        <MenuSection title="Version" />
        <MenuItem icon="✅" label="v1.0 — Full hockey pass/shot logic" onClick={() => {}} dim />
      </div>
    </>
  );
}
