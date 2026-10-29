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
import { printSingleDrillCard } from '@/ui/exportDrillCard';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
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

  const [openMenu, setOpenMenu] = useState<'players' | 'objects' | 'draw' | 'lineups' | 'defense' | 'export' | null>(null);

  const currentTool = state.ui.currentTool;
  const isMove = currentTool === 'move';
  const isPlacingObject = currentTool === 'cone' || currentTool === 'tire' || currentTool === 'mini-net' || currentTool === 'barrier';
  const isDrawing = state.pendingAction.kind !== 'none';
  const selectedPlayer = state.selection.selectedPlayerId
    ? state.drill.players.find(p => p.id === state.selection.selectedPlayerId)
    : null;

  if (state.ui.mode !== 'build' || isCompactLandscape) return null;

  const closeMenu = () => setOpenMenu(null);
  const toggleMenu = (menu: 'players' | 'objects' | 'draw' | 'lineups' | 'defense' | 'export') => {
    setOpenMenu(prev => (prev === menu ? null : menu));
  };

  const selectTool = (tool: Tool) => {
    commands.setTool(tool);
    closeMenu();
  };

  const addHomeSkater = () => {
    const homeCount = state.drill.players.filter(p => p.team === 'home' && p.role !== 'G').length;
    const x = Math.min(840, 480 + (homeCount % 4) * 60);
    const y = 120 + ((homeCount * 70) % 200);
    commands.addPlayer({ x, y }, 'home');
    selectTool('home');
  };

  const addAwaySkater = () => {
    const awayCount = state.drill.players.filter(p => p.team === 'away' && p.role !== 'G').length;
    const x = Math.min(840, 560 + (awayCount % 4) * 60);
    const y = 140 + ((awayCount * 70) % 200);
    commands.addPlayer({ x, y }, 'away');
    selectTool('away');
  };

  const addGoalie = () => {
    const hasHomeGoalie = state.drill.players.some(p => p.team === 'home' && p.role === 'G');
    const x = hasHomeGoalie ? 920 : 80;
    const y = 212.5;
    commands.addPlayer({ x, y }, 'goalie');
    selectTool('goalie');
  };

  const addCoach = () => {
    const coachCount = (state.drill.coaches ?? []).length;
    const x = Math.min(840, 460 + coachCount * 55);
    const y = 65;
    const res = commands.addCoach({ x, y });
    if (res && 'value' in res && res.value) {
      commands.selectCoach(res.value);
    }
    selectTool('coach');
  };

  const placeEquipment = (kind: 'cone' | 'tire' | 'mini-net' | 'barrier') => {
    const count = (state.drill.equipment ?? []).length;
    const x = Math.min(840, 480 + (count % 4) * 50);
    const y = 180 + ((count * 40) % 120);
    commands.addEquipment(kind, { x, y });
    selectTool(kind);
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
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-0.5">
        {/* Pointer / Move tool */}
        <button
          type="button"
          onClick={() => {
            commands.cancelPendingAction();
            selectTool('move');
          }}
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

        {/* Direct Add Player Buttons */}
        <button
          type="button"
          onClick={addHomeSkater}
          aria-label="Home skater"
          title="Add Home skater (tap ice to place)"
          className={`touch-target flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold transition-all ${
            currentTool === 'home'
              ? 'border border-blue-400 bg-blue-500/25 text-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.4)]'
              : 'border border-white/10 bg-white/[0.04] text-white/80 hover:border-blue-400/40 hover:bg-blue-500/10 hover:text-blue-200'
          }`}
        >
          <span>🔵</span>
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={addAwaySkater}
          aria-label="Away skater"
          title="Add Away skater (tap ice to place)"
          className={`touch-target flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold transition-all ${
            currentTool === 'away'
              ? 'border border-red-400 bg-red-500/25 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
              : 'border border-white/10 bg-white/[0.04] text-white/80 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200'
          }`}
        >
          <span>🔴</span>
          <span>Away</span>
        </button>

        <button
          type="button"
          onClick={addGoalie}
          aria-label="Goalie"
          title="Add Goalie (tap crease to place)"
          className={`touch-target flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold transition-all ${
            currentTool === 'goalie'
              ? 'border border-amber-400 bg-amber-500/25 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
              : 'border border-white/10 bg-white/[0.04] text-white/80 hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-200'
          }`}
        >
          <span>🥅</span>
          <span>Goalie</span>
        </button>

        <button
          type="button"
          onClick={addCoach}
          aria-label="Coach marker"
          title="Add Coach marker (tap ice to place)"
          className={`touch-target flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold transition-all ${
            currentTool === 'coach'
              ? 'border border-emerald-400 bg-emerald-500/25 text-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
              : 'border border-white/10 bg-white/[0.04] text-white/80 hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200'
          }`}
        >
          <span>📋</span>
          <span>Coach</span>
        </button>

        {/* Direct Action: Skate Route / Path */}
        <button
          type="button"
          onClick={() => {
            const targetPlayer =
              selectedPlayer ??
              carrier ??
              state.drill.players.find(p => p.role !== 'G') ??
              state.drill.players[0];
            if (targetPlayer) {
              commands.selectPlayer(targetPlayer.id);
              commands.setTool('move');
              commands.setPendingAction({ kind: 'draw-route', playerId: targetPlayer.id });
            }
          }}
          aria-label="Draw skate path"
          title={selectedPlayer ? `Draw #${selectedPlayer.number}'s skate path` : 'Draw skate path (drag or tap player)'}
          className={`touch-target flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold transition-all ${
            state.pendingAction.kind === 'draw-route'
              ? 'border border-cyan-400 bg-cyan-500/25 text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
              : 'border border-white/10 bg-white/[0.04] text-white/80 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200'
          }`}
        >
          <span>⛸️</span>
          <span>Path</span>
        </button>

        {/* Direct Action: Pass */}
        <button
          type="button"
          onClick={() => {
            const targetCarrier =
              carrier ??
              state.drill.players.find(p => p.hasPuck) ??
              selectedPlayer ??
              state.drill.players.find(p => p.role !== 'G') ??
              state.drill.players[0];
            if (targetCarrier) {
              if (!targetCarrier.hasPuck) void commands.setPuckCarrier(targetCarrier.id);
              commands.setTool('move');
              commands.setPendingAction({ kind: 'pass', playerId: targetCarrier.id });
            }
          }}
          aria-label="Pass puck"
          title={carrier ? `Pass puck from #${carrier.number}` : 'Pass puck'}
          className={`touch-target flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold transition-all ${
            state.pendingAction.kind === 'pass'
              ? 'border border-amber-400 bg-amber-500/25 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
              : 'border border-white/10 bg-white/[0.04] text-white/80 hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-200'
          }`}
        >
          <span>⚡</span>
          <span>Pass</span>
        </button>

        {/* Direct Action: Shoot */}
        <button
          type="button"
          onClick={() => {
            const targetCarrier =
              carrier ??
              state.drill.players.find(p => p.hasPuck) ??
              selectedPlayer ??
              state.drill.players.find(p => p.role !== 'G') ??
              state.drill.players[0];
            if (targetCarrier) {
              if (!targetCarrier.hasPuck) void commands.setPuckCarrier(targetCarrier.id);
              commands.setTool('move');
              void commands.requestShot(targetCarrier.id, attackingNetFor(targetCarrier.team));
            }
          }}
          aria-label="Shoot on net"
          title="Shoot on net"
          className="touch-target flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11.5px] font-bold text-white/80 hover:border-orange-400/40 hover:bg-orange-500/10 hover:text-orange-200 transition-all"
        >
          <span>🏒</span>
          <span>Shoot</span>
        </button>

        {/* Objects / Equipment Flyout */}
        <FlyoutMenu
          label="Gear"
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
            onClick={() => placeEquipment('cone')}
          />
          <MenuItem
            icon="⚫"
            label="Tire"
            sublabel="Obstacle / screen dummy"
            active={currentTool === 'tire'}
            onClick={() => placeEquipment('tire')}
          />
          <MenuItem
            icon="🥅"
            label="Mini-Net"
            sublabel="Small shooting target"
            active={currentTool === 'mini-net'}
            onClick={() => placeEquipment('mini-net')}
          />
          <MenuItem
            icon="🚧"
            label="Divider Barrier"
            sublabel="Cross-ice drill bumper"
            active={currentTool === 'barrier'}
            onClick={() => placeEquipment('barrier')}
          />
        </FlyoutMenu>

        {/* Defending / Opposing Team Movement Flyout */}
        <FlyoutMenu
          label="Defend"
          icon="🛡️"
          isOpen={openMenu === 'defense'}
          onToggle={() => toggleMenu('defense')}
          onClose={closeMenu}
        >
          <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-rose-400/80">
            Opposing Team Movement
          </div>
          <MenuItem
            icon="🛡️"
            label="Defensive Gap Control"
            sublabel="D-pair backward retreat to slot"
            onClick={() => {
              closeMenu();
              commands.generateOpposingDefense('gap');
            }}
          />
          <MenuItem
            icon="🦅"
            label="Forecheck Pressure"
            sublabel="F1/F2 angling pursuit on puck"
            onClick={() => {
              closeMenu();
              commands.generateOpposingDefense('forecheck');
            }}
          />
          <MenuItem
            icon="📦"
            label="PK Box Shift"
            sublabel="Box slides toward puck quadrant"
            onClick={() => {
              closeMenu();
              commands.generateOpposingDefense('box-shift');
            }}
          />
          <MenuItem
            icon="⚡"
            label="Backcheck Through Middle"
            sublabel="Forwards sprint back to slot"
            onClick={() => {
              closeMenu();
              commands.generateOpposingDefense('backcheck');
            }}
          />
          <MenuItem
            icon="✏️"
            label="Draw Opponent Route"
            sublabel="Sketch path for nearest away player"
            onClick={() => {
              closeMenu();
              const awaySkater = state.drill.players.find(p => p.team === 'away' && p.role !== 'G') || state.drill.players.find(p => p.team === 'away');
              if (awaySkater) {
                commands.selectPlayer(awaySkater.id);
                commands.setTool('move');
                commands.setPendingAction({ kind: 'draw-route', playerId: awaySkater.id });
              }
            }}
          />
          <MenuItem
            icon="↺"
            label="Clear Opponent Routes"
            sublabel="Remove defending movement"
            tone="danger"
            onClick={() => {
              closeMenu();
              commands.clearOpposingRoutes();
            }}
          />
        </FlyoutMenu>

        {/* Formations Quick Find Button */}
        <button
          type="button"
          onClick={() => {
            closeMenu();
            dispatch({ type: 'OPEN_SHEET', sheet: 'formations' });
          }}
          aria-label="Formations quick find"
          title="Formations & Systems (F) — Quick Find"
          className="touch-target flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11.5px] font-extrabold text-emerald-200 hover:border-emerald-400 hover:bg-emerald-500/25 hover:text-white transition-all shadow-sm"
        >
          <span>📋</span>
          <span>Formations</span>
          <kbd className="hidden sm:inline-block rounded bg-black/40 px-1 py-0.2 text-[9px] font-mono text-emerald-300/90 border border-emerald-500/30">F</kbd>
        </button>

        {/* Setups / Formations Flyout */}
        <FlyoutMenu
          label="Systems"
          icon="⚡"
          isOpen={openMenu === 'lineups'}
          onToggle={() => toggleMenu('lineups')}
          onClose={closeMenu}
        >
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400/80">
              Tactical Formations
            </span>
          </div>
          <MenuItem
            icon="📋"
            label="All Formations & Placements..."
            sublabel="Browse full tactical library"
            onClick={() => {
              closeMenu();
              dispatch({ type: 'OPEN_SHEET', sheet: 'formations' });
            }}
          />
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
            icon="⚡"
            label="2-on-1 Rush"
            sublabel="Odd-man rush with trailer"
            onClick={() => applyFormation('rush-2v1')}
          />
          <MenuItem
            icon="🚀"
            label="5v5 Breakout"
            sublabel="Regroup & breakout system"
            onClick={() => applyFormation('breakout-5v5')}
          />
          <MenuItem
            icon="🦅"
            label="2-1-2 Forecheck"
            sublabel="Heavy aggressive puck pursuit"
            onClick={() => applyFormation('forecheck-212')}
          />
          <MenuItem
            icon="🧱"
            label="1-2-2 Neutral Trap"
            sublabel="Neutral zone wall defense"
            onClick={() => applyFormation('trap-122')}
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
          <MenuItem
            icon="🛡️"
            label="D-Zone Faceoff"
            sublabel="Defensive zone coverage"
            onClick={() => applyFormation('faceoff-dzone')}
          />
        </FlyoutMenu>        {/* Direct In-App Print Preview Button */}
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'print-preview' })}
          aria-label="Open print preview modal"
          title="Print Preview (Bench Card / Practice Sheet)"
          className="touch-target flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11.5px] font-bold text-white/80 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 transition-all"
        >
          <span>🖨️</span>
          <span>Preview</span>
        </button>

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
            icon="🖨️"
            label="Print Preview (Card / Sheet)"
            sublabel="Interactive print & cut preview"
            onClick={() => {
              closeMenu();
              dispatch({ type: 'OPEN_SHEET', sheet: 'print-preview' });
            }}
          />
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
            icon="✂️"
            label="Print Cut-Out Card (PDF)"
            sublabel="Printable bench pocket card"
            onClick={() => {
              closeMenu();
              printSingleDrillCard(migrateV2ToV3(state.drill));
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

        {/* Reset Lineup Button */}
        <button
          type="button"
          onClick={() => void commands.resetBoard()}
          aria-label="Reset lineup to default"
          title="Reset board lineup"
          className="touch-target flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11.5px] font-bold text-white/70 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 transition-all"
        >
          <span>↺</span>
          <span className="hidden md:inline">Reset</span>
        </button>
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
