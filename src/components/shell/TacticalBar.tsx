// ============================================================================
// TACTICAL BAR
//
// BenchIQ-grade whiteboard toolbar for hockey coaches:
// - Move (Select & Drag pointer)
// - Players ▾ (Home, Away, Goalie, Coach, Reset)
// - Objects ▾ (Cone, Tire, Mini-Net, Barrier)
// - Draw ▾ (Skate Route, Pass, Shoot on Net, Dump In)
// - Lineups ▾ (Power Play, Penalty Kill, 3v2 Rush, Breakout, Faceoff)
// - Export ▾ (Diagram PNG, Printable PDF, JSON)
// - Zone View Pills (Full, O-Zone, D-Zone, 2D/3D, Fit, Help ?)
// ============================================================================

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { usePuckActions } from '@/hooks/usePuckActions';
import { useViewActions } from './useViewActions';
import { useResponsive } from '@/ui/useResponsive';
import { attackingNetFor } from '@/engine/puck';
import { exportDrillImageFile } from '@/ui/exportImage';
import type { Tool } from '@/core/types';
import type { PlayFormationPreset } from '@/engine/formations';

interface FlyoutProps {
  label: string;
  icon: string;
  active?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}

function FlyoutMenu({ label, icon, active, isOpen, onToggle, onClose, children }: FlyoutProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`touch-target flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition-all ${
          active
            ? 'border border-app-cyan bg-app-cyan/20 text-app-cyan shadow-[0_0_8px_rgba(0,229,255,0.3)]'
            : 'border border-white/10 bg-white/[0.04] text-white/80 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
        }`}
      >
        <span>{icon}</span>
        <span className="hidden sm:inline">{label}</span>
        <span className="text-[9px] text-white/50">▾</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-cyan-500/30 bg-[#07131e]/98 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  sublabel,
  active,
  onClick,
  tone = 'default',
}: {
  icon: string | ReactNode;
  label: string;
  sublabel?: string;
  active?: boolean;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`touch-target flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-bold transition-colors ${
        active
          ? 'bg-app-cyan/20 text-app-cyan'
          : tone === 'danger'
            ? 'text-red-300 hover:bg-red-500/15'
            : 'text-white/85 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[13px]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div>{label}</div>
        {sublabel && <div className="text-[10px] font-normal text-white/50">{sublabel}</div>}
      </div>
      {active && <span className="text-app-cyan text-[11px]">✓</span>}
    </button>
  );
}

export function TacticalBar() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { isCompactLandscape } = useResponsive();
  const { carrier } = usePuckActions();
  const { is3D, toggle3D, fit, zoomToZone } = useViewActions();

  const [openMenu, setOpenMenu] = useState<'players' | 'objects' | 'draw' | 'lineups' | 'export' | null>(null);

  const currentTool = state.ui.currentTool;
  const isMove = currentTool === 'move';
  const isPlacingPlayer = currentTool === 'home' || currentTool === 'away' || currentTool === 'goalie' || currentTool === 'coach';
  const isPlacingObject = currentTool === 'cone' || currentTool === 'tire' || currentTool === 'mini-net' || currentTool === 'barrier';
  const isDrawing = state.pendingAction.kind !== 'none';
  const selectedPlayer = state.selection.selectedPlayerId
    ? state.drill.players.find(p => p.id === state.selection.selectedPlayerId)
    : null;

  if (state.ui.mode !== 'build' || isCompactLandscape) return null;

  const closeMenu = () => setOpenMenu(null);
  const toggleMenu = (menu: 'players' | 'objects' | 'draw' | 'lineups' | 'export') => {
    setOpenMenu(prev => (prev === menu ? null : menu));
  };

  const selectTool = (tool: Tool) => {
    commands.setTool(tool);
    closeMenu();
  };

  const applyFormation = async (preset: PlayFormationPreset) => {
    closeMenu();
    await commands.loadFormation(preset);
  };

  return (
    <div
      role="toolbar"
      aria-label="Tactical whiteboard controls"
      className="app-chrome safe-x z-20 flex flex-shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#050e17]/95 px-2.5 py-1 backdrop-blur-md select-none"
    >
      {/* LEFT: Tactical Whiteboard Verbs */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
        {/* Pointer / Move tool */}
        <button
          type="button"
          onClick={() => selectTool('move')}
          aria-label="Select and move players"
          aria-pressed={isMove && !isDrawing}
          className={`touch-target flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition-all ${
            isMove && !isDrawing
              ? 'border border-app-cyan bg-app-cyan/20 text-app-cyan shadow-[0_0_8px_rgba(0,229,255,0.3)]'
              : 'border border-white/10 bg-white/[0.04] text-white/80 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <span>👆</span>
          <span>Move</span>
        </button>

        {/* Players Flyout */}
        <FlyoutMenu
          label="Players"
          icon="🏒"
          active={isPlacingPlayer}
          isOpen={openMenu === 'players'}
          onToggle={() => toggleMenu('players')}
          onClose={closeMenu}
        >
          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-app-cyan/70">
            Add to Ice (tap ice to place)
          </div>
          <MenuItem
            icon="🔵"
            label="Home Skater"
            sublabel="Blue team jersey"
            active={currentTool === 'home'}
            onClick={() => selectTool('home')}
          />
          <MenuItem
            icon="🔴"
            label="Away Skater"
            sublabel="Red team jersey"
            active={currentTool === 'away'}
            onClick={() => selectTool('away')}
          />
          <MenuItem
            icon="🥅"
            label="Goalie"
            sublabel="Crease goaltender"
            active={currentTool === 'goalie'}
            onClick={() => selectTool('goalie')}
          />
          <MenuItem
            icon="📋"
            label="Coach"
            sublabel="Coach on ice"
            active={currentTool === 'coach'}
            onClick={() => selectTool('coach')}
          />
          <div className="my-1 border-t border-white/10" />
          <MenuItem
            icon="🔄"
            label="Reset Lineup"
            sublabel="Restore starting board"
            tone="danger"
            onClick={() => {
              closeMenu();
              void commands.resetBoard();
            }}
          />
        </FlyoutMenu>

        {/* Objects / Equipment Flyout */}
        <FlyoutMenu
          label="Objects"
          icon="🔶"
          active={isPlacingObject}
          isOpen={openMenu === 'objects'}
          onToggle={() => toggleMenu('objects')}
          onClose={closeMenu}
        >
          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-app-gold/70">
            Training Gear (tap ice to place)
          </div>
          <MenuItem
            icon="🟠"
            label="Cone"
            sublabel="Agility / turning marker"
            active={currentTool === 'cone'}
            onClick={() => selectTool('cone')}
          />
          <MenuItem
            icon="⚫"
            label="Tire"
            sublabel="Obstacle / screen dummy"
            active={currentTool === 'tire'}
            onClick={() => selectTool('tire')}
          />
          <MenuItem
            icon="🥅"
            label="Mini-Net"
            sublabel="Small shooting target"
            active={currentTool === 'mini-net'}
            onClick={() => selectTool('mini-net')}
          />
          <MenuItem
            icon="🚧"
            label="Divider Barrier"
            sublabel="Cross-ice drill bumper"
            active={currentTool === 'barrier'}
            onClick={() => selectTool('barrier')}
          />
        </FlyoutMenu>

        {/* Tactical Draw & Actions Flyout */}
        <FlyoutMenu
          label="Draw"
          icon="🎯"
          active={isDrawing}
          isOpen={openMenu === 'draw'}
          onToggle={() => toggleMenu('draw')}
          onClose={closeMenu}
        >
          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-400/70">
            Tactical Lanes & Actions
          </div>
          <MenuItem
            icon="⛸️"
            label="Skate Route"
            sublabel={selectedPlayer ? `Draw #${selectedPlayer.number}'s skating lane` : 'Select a player first'}
            active={state.pendingAction.kind === 'draw-route'}
            onClick={() => {
              closeMenu();
              if (selectedPlayer) {
                commands.setTool('move');
                commands.setPendingAction({ kind: 'draw-route', playerId: selectedPlayer.id });
              }
            }}
          />
          <MenuItem
            icon="⚡"
            label="Pass Puck"
            sublabel={carrier ? `Pass from #${carrier.number}` : 'Select puck carrier first'}
            active={state.pendingAction.kind === 'pass'}
            onClick={() => {
              closeMenu();
              if (carrier) {
                commands.setTool('move');
                commands.setPendingAction({ kind: 'pass', playerId: carrier.id });
              }
            }}
          />
          <MenuItem
            icon="🏒"
            label="Shoot on Net"
            sublabel={carrier ? `Fire shot from #${carrier.number}` : 'Select carrier first'}
            onClick={() => {
              closeMenu();
              if (carrier) {
                commands.setTool('move');
                void commands.requestShot(carrier.id, attackingNetFor(carrier.team));
              }
            }}
          />
          <MenuItem
            icon="📦"
            label="Dump In"
            sublabel="Send puck into corner"
            onClick={() => {
              closeMenu();
              if (carrier) {
                commands.setTool('move');
                void commands.requestDump(carrier.id, { x: 880, y: 70 });
              }
            }}
          />
        </FlyoutMenu>

        {/* Setups / Formations Flyout */}
        <FlyoutMenu
          label="Lineups"
          icon="⚡"
          isOpen={openMenu === 'lineups'}
          onToggle={() => toggleMenu('lineups')}
          onClose={closeMenu}
        >
          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-400/70">
            Instant Tactical Setups
          </div>
          <MenuItem
            icon="🏒"
            label="1-3-1 Power Play"
            sublabel="5v4 umbrella man-advantage"
            onClick={() => applyFormation('pp-131')}
          />
          <MenuItem
            icon="🛡️"
            label="Penalty Kill Box"
            sublabel="4-man defensive box"
            onClick={() => applyFormation('pk-box')}
          />
          <MenuItem
            icon="⚡"
            label="3-on-2 Rush"
            sublabel="Triangulation rush attack"
            onClick={() => applyFormation('rush-3v2')}
          />
          <MenuItem
            icon="🚀"
            label="5v5 Breakout"
            sublabel="Regroup & breakout system"
            onClick={() => applyFormation('breakout-5v5')}
          />
          <MenuItem
            icon="⭕"
            label="Centre Faceoff"
            sublabel="5v5 regulation center drop"
            onClick={() => applyFormation('faceoff-center')}
          />
          <MenuItem
            icon="🎯"
            label="O-Zone Faceoff"
            sublabel="Offensive faceoff play"
            onClick={() => applyFormation('faceoff-ozone')}
          />
        </FlyoutMenu>

        {/* Export / Share Flyout */}
        <FlyoutMenu
          label="Export"
          icon="📥"
          isOpen={openMenu === 'export'}
          onToggle={() => toggleMenu('export')}
          onClose={closeMenu}
        >
          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-app-cyan/70">
            Export & Print
          </div>
          <MenuItem
            icon="📷"
            label="Drill Diagram (PNG)"
            sublabel="High-resolution image"
            onClick={() => {
              closeMenu();
              exportDrillImageFile(state.drill);
            }}
          />
          <MenuItem
            icon="🖨️"
            label="Print Drill Card (PDF)"
            sublabel="Printable coaching sheet"
            onClick={() => {
              closeMenu();
              setTimeout(() => window.print(), 100);
            }}
          />
          <MenuItem
            icon="💾"
            label="Export Play Data (JSON)"
            sublabel="Backup and sharing file"
            onClick={() => {
              closeMenu();
              void commands.exportDrills();
            }}
          />
        </FlyoutMenu>
      </div>

      {/* RIGHT: BenchIQ-Style Direct Zone View Pills & Help */}
      <div className="flex items-center gap-1 shrink-0 ml-1">
        <button
          type="button"
          onClick={() => zoomToZone('full')}
          aria-label="Full sheet view"
          className="touch-target rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-white/80 hover:border-cyan-400/40 hover:bg-app-cyan/15 hover:text-app-cyan transition-all"
        >
          Full
        </button>

        <button
          type="button"
          onClick={() => zoomToZone('offensive')}
          aria-label="Offensive zone view"
          className="touch-target rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-white/80 hover:border-cyan-400/40 hover:bg-app-cyan/15 hover:text-app-cyan transition-all"
        >
          O-Zone
        </button>

        <button
          type="button"
          onClick={() => zoomToZone('defensive')}
          aria-label="Defensive zone view"
          className="touch-target rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-white/80 hover:border-cyan-400/40 hover:bg-app-cyan/15 hover:text-app-cyan transition-all"
        >
          D-Zone
        </button>

        <button
          type="button"
          onClick={toggle3D}
          aria-label={is3D ? 'Switch to 2D view' : 'Switch to 3D tabletop view'}
          className={`touch-target rounded-lg border px-2 py-1 text-[11px] font-black transition-all ${
            is3D
              ? 'border-app-cyan bg-app-cyan text-[#041019] shadow-sm'
              : 'border-white/10 bg-white/[0.04] text-app-cyan hover:bg-app-cyan/15'
          }`}
        >
          {is3D ? '2D' : '3D'}
        </button>

        <button
          type="button"
          onClick={fit}
          aria-label="Fit whole rink in view"
          title="Fit view"
          className="touch-target rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-white/80 hover:border-white/25 hover:text-white transition-all"
        >
          ⛶
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'help' })}
          aria-label="How to use the whiteboard"
          title="Coach Guide & Shortcuts"
          className="touch-target flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-400/35 bg-app-cyan/15 text-[12px] font-black text-app-cyan hover:bg-app-cyan/25 transition-all ml-0.5"
        >
          ?
        </button>
      </div>
    </div>
  );
}
