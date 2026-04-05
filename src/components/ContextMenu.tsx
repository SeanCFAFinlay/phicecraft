// ============================================================================
// CONTEXT MENU - Player action context menu
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';
import { getCurrentPuckHolder, canAddEvents, getTargetNet, validatePass, validateShot } from '@/engine/puck';
import { RINK } from '@/core/constants';

interface MenuButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'gold' | 'orange';
}

function MenuButton({ icon, label, onClick, disabled, variant = 'default' }: MenuButtonProps) {
  const variantClasses = {
    default: 'text-app-text',
    gold: 'text-app-gold',
    orange: 'text-app-orange',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 py-2.5 px-3 rounded-lg border-none bg-transparent text-[13px] cursor-pointer w-full text-left transition-colors ${variantClasses[variant]} ${
        disabled ? 'opacity-30 pointer-events-none' : 'hover:bg-app-cyan/10 active:bg-app-cyan/15'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="h-px bg-app-border my-0.5" />;
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-1.5 pb-0.5 text-[9px] tracking-wider text-app-dim uppercase font-bold">
      {children}
    </div>
  );
}

export function ContextMenu() {
  const { state, actions } = useAppState();

  if (!state.ui.showContextMenu || !state.ui.contextMenuPosition || !state.ui.contextMenuPlayerId) {
    return null;
  }

  const player = state.drill.players.find(p => p.id === state.ui.contextMenuPlayerId);
  if (!player) return null;

  const holder = getCurrentPuckHolder(state.drill.players, state.drill.events);
  const hasPuck = holder?.id === player.id || (player.hasPuck && state.drill.events.length === 0);
  const canPass = canAddEvents(state.drill.events) && hasPuck;
  const canShoot = canAddEvents(state.drill.events) && hasPuck;
  const showGivePuck = !hasPuck && state.drill.events.length === 0;

  const handlePass = () => {
    actions.hideContextMenu();
    if (!hasPuck) {
      actions.showToast(`#${player.number} doesn't have the puck`, 'warning');
      return;
    }
    actions.setTool('pass');
    actions.setPassFrom(player.id);
    actions.setModeBanner(`Pass from #${player.number} — tap a teammate`);
  };

  const handleShoot = () => {
    actions.hideContextMenu();
    if (!hasPuck) {
      actions.showToast(`#${player.number} doesn't have the puck`, 'warning');
      return;
    }
    const net = getTargetNet(player.team);
    const validation = validateShot(player, state.drill.players, state.drill.events);
    if (validation.valid) {
      actions.addShot(player, net);
      actions.showToast('Shot on net!', 'success');
    } else {
      actions.showToast(validation.error!, 'warning');
    }
  };

  const handleSkate = () => {
    actions.hideContextMenu();
    actions.setTool('skate');
    actions.showToast(`Drag from #${player.number} to draw path`, 'info');
  };

  const handleDump = () => {
    actions.hideContextMenu();
    if (!hasPuck) {
      actions.showToast(`#${player.number} doesn't have the puck`, 'warning');
      return;
    }
    // Dump to corner
    const tx = player.team === 'home' ? RINK.x + RINK.width * 0.87 : RINK.x + RINK.width * 0.13;
    const ty = player.y < RINK.y + RINK.height / 2 ? RINK.y + RINK.height * 0.18 : RINK.y + RINK.height * 0.82;
    actions.addDump(player, { x: tx, y: ty });
    actions.selectPlayer(null);
    actions.setTool('select');
    actions.showToast('Dump in!', 'success');
  };

  const handleGivePuck = () => {
    actions.hideContextMenu();
    if (state.drill.events.length > 0) {
      actions.showToast('Clear events first to reassign initial puck carrier', 'warning');
      return;
    }
    actions.setPuckCarrier(player.id);
    actions.showToast(`#${player.number} now has the puck`, 'success');
  };

  const handleDelete = () => {
    actions.hideContextMenu();
    actions.removePlayer(player.id);
    actions.selectPlayer(null);
    actions.showToast('Player removed', 'success');
  };

  const handleClose = () => {
    actions.hideContextMenu();
  };

  // Position menu
  const pos = state.ui.contextMenuPosition;
  const left = Math.max(4, Math.min(pos.x + 8, state.canvasWidth - 195));
  const top = Math.max(4, Math.min(pos.y + 8, state.canvasHeight - 295));

  return (
    <div
      style={{ left, top }}
      className="absolute bg-app-surface border border-app-border rounded-xl p-1.5 z-40 flex flex-col gap-0.5 min-w-[185px] shadow-2xl"
    >
      <MenuLabel>Actions</MenuLabel>
      <MenuButton
        icon="⟶"
        label="Pass to Teammate"
        onClick={handlePass}
        disabled={!canPass}
        variant="gold"
      />
      <MenuButton
        icon="🥅"
        label="Shoot on Net"
        onClick={handleShoot}
        disabled={!canShoot}
        variant="orange"
      />
      <MenuButton
        icon="〰"
        label="Draw Skate Path"
        onClick={handleSkate}
      />
      <MenuButton
        icon="💨"
        label="Dump In / Chip"
        onClick={handleDump}
        disabled={!canPass}
      />

      <MenuDivider />

      <MenuLabel>Player</MenuLabel>
      {showGivePuck && (
        <MenuButton
          icon="🏒"
          label="Give Puck"
          onClick={handleGivePuck}
        />
      )}
      <MenuButton
        icon="🗑"
        label="Remove Player"
        onClick={handleDelete}
      />
      <MenuButton
        icon="✕"
        label="Close"
        onClick={handleClose}
      />
    </div>
  );
}
