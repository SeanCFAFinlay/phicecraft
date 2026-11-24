// ============================================================================
// TACTICAL BAR
//
// The one row of drawing tools above the rink, on tablets and desktops.
//
//   Add       skater, opponent, goalie, coach, cone, tire, net, divider
//   Setups    formations, coach-fed starts and opponent movement
//   Flip      mirror the drill
//   Clear     remove routes, passes, gear, opponents, or start again
//   Export    share, print, picture, backup file
//   View      which part of the ice fills the screen
//
// Moving, skating and passing are in the dock below the rink, and what can be
// done with a selected player is in the tray that appears when one is
// selected. Each action lives in exactly one place.
//
// Phones get the same tools from the dock's Add sheet and the menu, so this
// row is not shown there.
// ============================================================================

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useViewActions } from './useViewActions';
import { useResponsive } from '@/ui/useResponsive';
import type { PlayFormationPreset } from '@/engine/formations';
import { DEFAULT_JERSEYS } from '@/core/types';
import {
  BarrierIcon,
  CoachIcon,
  ConeIcon,
  DeleteIcon,
  ExportIcon,
  FitIcon,
  FormationIcon,
  GoalieIcon,
  HelpIcon,
  MiniNetIcon,
  SwapIcon,
  TireIcon,
} from '@/ui/icons';

type MenuName = 'setups' | 'flip' | 'clear' | 'export';

const BUTTON =
  'flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-cyan';

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-white/10" aria-hidden="true" />;
}

interface FlyoutProps {
  label: string;
  icon?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
}

function FlyoutMenu({ label, icon, isOpen, onToggle, onClose, children, align = 'left' }: FlyoutProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 264;
      const wanted = align === 'right' ? rect.right - menuWidth : rect.left;
      const left = Math.max(8, Math.min(wanted, window.innerWidth - menuWidth - 8));
      setCoords({ top: rect.bottom + 6, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, align]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && buttonRef.current && !buttonRef.current.contains(target)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        buttonRef.current?.focus();
      }
    }
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className="relative inline-block shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`${BUTTON} ${isOpen ? 'bg-white/[0.09] text-white' : ''}`}
      >
        {icon}
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="text-white/40">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && coords && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`, zIndex: 9999 }}
          className="w-[264px] max-h-[75vh] overflow-y-auto rounded-lg border border-white/10 bg-[#0c1722] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold text-white/45">{children}</div>;
}

function MenuSeparator() {
  return <div className="my-1 h-px bg-white/[0.08]" role="separator" />;
}

function MenuItem({
  label,
  detail,
  onClick,
  tone = 'default',
}: {
  label: string;
  detail?: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none ${
        tone === 'danger' ? 'text-red-300' : 'text-white/90'
      }`}
    >
      <span className="text-[13px] font-medium">{label}</span>
      {detail && <span className="text-[11px] text-white/45">{detail}</span>}
    </button>
  );
}

function TeamDot({ color }: { color: string }) {
  return <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/25" style={{ background: color }} aria-hidden="true" />;
}

export function TacticalBar() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { isCompactLandscape, isPhone } = useResponsive();
  const { fit, zoomToZone } = useViewActions();
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);

  if (state.ui.mode !== 'build' || isCompactLandscape || isPhone) return null;

  const jerseys = state.drill.settings?.jerseys ?? DEFAULT_JERSEYS;
  const closeMenu = () => setOpenMenu(null);
  const toggleMenu = (menu: MenuName) => setOpenMenu(prev => (prev === menu ? null : menu));
  const run = (action: () => unknown) => () => {
    closeMenu();
    void action();
  };

  const addSkater = (team: 'home' | 'away') => {
    const count = state.drill.players.filter(p => p.team === team && p.role !== 'G').length;
    const x = Math.min(840, (team === 'home' ? 480 : 560) + (count % 4) * 60);
    const y = (team === 'home' ? 120 : 140) + ((count * 70) % 200);
    const res = commands.addPlayer({ x, y }, team);
    if (res.status === 'done') commands.selectPlayer(res.value);
    commands.setTool('move');
  };

  const addGoalie = () => {
    const hasHomeGoalie = state.drill.players.some(p => p.team === 'home' && p.role === 'G');
    const res = commands.addPlayer({ x: hasHomeGoalie ? 920 : 80, y: 212.5 }, 'goalie');
    if (res.status === 'done') commands.selectPlayer(res.value);
    commands.setTool('move');
  };

  const addCoach = () => {
    const coachCount = (state.drill.coaches ?? []).length;
    const res = commands.addCoach({ x: Math.min(840, 460 + coachCount * 55), y: 65 });
    if (res && 'value' in res && res.value) commands.selectCoach(res.value);
    commands.setTool('move');
  };

  const addGear = (kind: 'cone' | 'tire' | 'mini-net' | 'barrier') => {
    const count = (state.drill.equipment ?? []).length;
    const res = commands.addEquipment(kind, { x: Math.min(840, 480 + (count % 4) * 55), y: 180 + ((count * 40) % 120) });
    if (res && 'value' in res && res.value) commands.selectEquipment(res.value);
    commands.setTool('move');
  };

  const formation = (preset: PlayFormationPreset) => run(() => commands.loadFormation(preset, true));

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="app-chrome safe-x z-20 flex h-11 flex-shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] bg-[#08121b] px-2 select-none"
    >
      <div className="flex min-w-0 items-center overflow-x-auto scrollbar-hide">
        <div className="flex items-center" role="group" aria-label="Add players">
          <button type="button" onClick={() => addSkater('home')} aria-label="Add a skater" title="Add a skater to your team" className={BUTTON}>
            <TeamDot color={jerseys.home} />
            <span className="hidden lg:inline">Skater</span>
          </button>
          <button type="button" onClick={() => addSkater('away')} aria-label="Add an opponent" title="Add an opposing skater" className={BUTTON}>
            <TeamDot color={jerseys.away} />
            <span className="hidden lg:inline">Opponent</span>
          </button>
          <button type="button" onClick={addGoalie} aria-label="Add a goalie" title="Add a goalie" className={BUTTON}>
            <GoalieIcon size={16} />
            <span className="hidden lg:inline">Goalie</span>
          </button>
          <button type="button" onClick={addCoach} aria-label="Add a coach" title="Add a coach" className={BUTTON}>
            <CoachIcon size={16} />
            <span className="hidden lg:inline">Coach</span>
          </button>
        </div>

        <Divider />

        <div className="flex items-center" role="group" aria-label="Add equipment">
          <button type="button" onClick={() => addGear('cone')} aria-label="Add a cone" title="Add a cone" className={BUTTON}>
            <ConeIcon size={16} />
            <span className="hidden xl:inline">Cone</span>
          </button>
          <button type="button" onClick={() => addGear('tire')} aria-label="Add a tire" title="Add a tire" className={BUTTON}>
            <TireIcon size={16} />
            <span className="hidden xl:inline">Tire</span>
          </button>
          <button type="button" onClick={() => addGear('mini-net')} aria-label="Add a mini net" title="Add a mini net" className={BUTTON}>
            <MiniNetIcon size={16} />
            <span className="hidden xl:inline">Net</span>
          </button>
          <button type="button" onClick={() => addGear('barrier')} aria-label="Add a divider" title="Add a cross-ice divider" className={BUTTON}>
            <BarrierIcon size={16} />
            <span className="hidden xl:inline">Divider</span>
          </button>
        </div>

        <Divider />

        <FlyoutMenu label="Setups" icon={<FormationIcon size={16} />} isOpen={openMenu === 'setups'} onToggle={() => toggleMenu('setups')} onClose={closeMenu}>
          <MenuHeading>Formations</MenuHeading>
          <MenuItem label="Centre faceoff" detail="5 on 5 with both goalies" onClick={formation('faceoff-center')} />
          <MenuItem label="Breakout" detail="5 on 5 from your own zone" onClick={formation('breakout-5v5')} />
          <MenuItem label="3 on 2 rush" onClick={formation('rush-3v2')} />
          <MenuItem label="2 on 1 rush" onClick={formation('rush-2v1')} />
          <MenuItem label="Power play, 1-3-1" onClick={formation('pp-131')} />
          <MenuItem label="Penalty kill box" onClick={formation('pk-box')} />
          <MenuItem label="2-1-2 forecheck" onClick={formation('forecheck-212')} />
          <MenuItem label="1-2-2 neutral zone trap" onClick={formation('trap-122')} />
          <MenuItem label="All formations…" onClick={run(() => dispatch({ type: 'OPEN_SHEET', sheet: 'formations' }))} />
          <MenuSeparator />
          <MenuHeading>Coach starts the play</MenuHeading>
          <MenuItem label="Dump in and chase" detail="Puck goes deep, two forwards go after it" onClick={run(commands.generateDumpAndChase)} />
          <MenuItem label="Rim it around the boards" onClick={run(commands.generateCoachRim)} />
          <MenuItem label="Feed the slot for a shot" onClick={run(commands.generateCoachFeed)} />
          <MenuSeparator />
          <MenuHeading>Give the opponents something to do</MenuHeading>
          <MenuItem label="Defence back off and close the gap" onClick={run(() => commands.generateOpposingDefense('gap'))} />
          <MenuItem label="Forecheck the puck" onClick={run(() => commands.generateOpposingDefense('forecheck'))} />
          <MenuItem label="Penalty kill box shifts" onClick={run(() => commands.generateOpposingDefense('box-shift'))} />
          <MenuItem label="Backcheck through the middle" onClick={run(() => commands.generateOpposingDefense('backcheck'))} />
          <MenuSeparator />
          <MenuItem label="Browse the drill library…" onClick={run(() => dispatch({ type: 'OPEN_SHEET', sheet: 'library' }))} />
        </FlyoutMenu>

        <FlyoutMenu label="Flip" icon={<SwapIcon size={16} />} isOpen={openMenu === 'flip'} onToggle={() => toggleMenu('flip')} onClose={closeMenu}>
          <MenuItem label="Flip top to bottom" detail="Run it down the other wing" onClick={run(() => commands.mirrorDrill('horizontal'))} />
          <MenuItem label="Flip end to end" detail="Run it at the other net" onClick={run(() => commands.mirrorDrill('vertical'))} />
        </FlyoutMenu>

        <FlyoutMenu label="Clear" icon={<DeleteIcon size={16} />} isOpen={openMenu === 'clear'} onToggle={() => toggleMenu('clear')} onClose={closeMenu}>
          <MenuItem label="Skating routes" detail="Players stay where they are" onClick={run(commands.clearMovementRoutes)} />
          <MenuItem label="Passes and shots" onClick={run(commands.clearPuckActions)} />
          <MenuItem label="Equipment" detail="Cones, tires, nets and dividers" onClick={run(commands.clearEquipment)} />
          <MenuItem label="Opponents' routes" onClick={run(commands.clearOpposingRoutes)} />
          <MenuItem label="Opponents" detail="Removes the other team" onClick={run(commands.clearOpponents)} />
          <MenuSeparator />
          <MenuItem label="Start again from a blank lineup" tone="danger" onClick={run(commands.resetBoard)} />
        </FlyoutMenu>

        <FlyoutMenu label="Export" icon={<ExportIcon size={16} />} isOpen={openMenu === 'export'} onToggle={() => toggleMenu('export')} onClose={closeMenu}>
          <MenuItem label="Share a link or video" onClick={run(() => dispatch({ type: 'OPEN_SHEET', sheet: 'share' }))} />
          <MenuItem label="Print…" detail="Bench card or practice sheet" onClick={run(() => dispatch({ type: 'OPEN_SHEET', sheet: 'print-preview' }))} />
          <MenuItem
            label="Save as a picture"
            detail="PNG of the rink diagram"
            onClick={run(async () => {
              const { exportDrillImageFile } = await import('@/ui/exportImage');
              exportDrillImageFile(state.drill);
            })}
          />
          <MenuItem label="Save a backup file" detail="Opens again in PHormation" onClick={run(commands.exportDrills)} />
        </FlyoutMenu>
      </div>

      <div className="hidden shrink-0 items-center md:flex" role="group" aria-label="Rink view">
        <div className="flex items-center rounded-md bg-white/[0.04] p-0.5">
          {([
            ['full', 'Full', 'Full sheet view'],
            ['defensive', 'Def', 'Defensive zone view'],
            ['neutral', 'Neutral', 'Neutral zone view'],
            ['offensive', 'Off', 'Offensive zone view'],
          ] as const).map(([zone, label, aria]) => (
            <button
              key={zone}
              type="button"
              onClick={() => zoomToZone(zone)}
              aria-label={aria}
              className="h-7 rounded px-2 text-[12px] font-medium text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={fit} aria-label="Fit whole rink in view" title="Fit the whole rink" className={BUTTON}>
          <FitIcon size={16} />
        </button>
        <button type="button" onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'help' })} aria-label="How to use the whiteboard" title="Help and shortcuts" className={BUTTON}>
          <HelpIcon size={16} />
        </button>
      </div>
    </div>
  );
}
