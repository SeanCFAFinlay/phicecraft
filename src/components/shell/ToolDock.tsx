// ============================================================================
// TOOL DOCK
//
// Three verbs, and nothing else: MOVE, PASS, SKATE. Plus Add, to put players on
// the ice, and Play.
//
// Only Move is a persistent mode. Pass and Skate arm one action and then
// finish, which is why neither is a `Tool` - a sticky Pass mode is exactly how
// the old Route/Pass/Shoot tools became invisible states you could get stuck
// in with no way of telling.
//
// Gone from here: Shoot, because the shot at the end of a play is derived from
// whoever ends up with the puck rather than authored; and Erase, because
// deleting is done from the selection chip and from Details, where you can see
// what you are about to remove before you remove it.
//
// On a compact-landscape phone WITH a selection, `compactSelection` swaps Add
// and Play for Details and Delete: stacking the tray's usual selection row
// above this dock, on top of the row it already costs, measured short of the
// 667x375 and 844x390 rink-height floors in the real browser (see
// ContextTray). Replacing two dock buttons in place keeps the row's total
// height fixed instead of adding a second one.
// ============================================================================

import type { ReactNode } from 'react';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';
import { usePuckActions } from '@/hooks/usePuckActions';
import { AddIcon, DeleteIcon, DetailsIcon, MoveIcon, PassIcon, PlayIcon, SkateIcon, StopIcon } from '@/ui/icons';
import { Transport } from './Transport';

export interface CompactSelectionActions {
  onDetails: () => void;
  onDelete: () => void;
}

interface DockButtonProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  accent?: string;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  ariaHasPopup?: boolean;
  ariaExpanded?: boolean;
}

function DockButton({
  icon,
  label,
  active,
  accent,
  disabled,
  title,
  onClick,
  ariaHasPopup,
  ariaExpanded,
}: DockButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={ariaHasPopup ? undefined : active}
      aria-haspopup={ariaHasPopup ? 'dialog' : undefined}
      aria-expanded={ariaHasPopup ? ariaExpanded : undefined}
      style={active && accent ? { borderColor: accent, color: accent, backgroundColor: `${accent}22` } : undefined}
      className={`touch-target flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-2 py-1.5 transition-colors disabled:opacity-35 ${
        active && !accent
          ? 'border-app-cyan bg-app-cyan/15 text-app-cyan'
          : active
            ? ''
            : 'border-transparent bg-white/5 text-white/60 hover:bg-white/10 disabled:hover:bg-white/5'
      }`}
    >
      <span className="flex h-5 items-center justify-center leading-none">{icon}</span>
      <span className="text-[12px] font-bold tracking-tight">{label}</span>
    </button>
  );
}

export function ToolDock({
  compactSelection,
}: {
  /** Set only in the compact-landscape tray, only while something is selected. */
  compactSelection?: CompactSelectionActions | null;
} = {}) {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { isCompactLandscape } = useResponsive();
  const { carrier, canPass, passBlockedReason } = usePuckActions();

  const tool = state.ui.currentTool;
  const pending = state.pendingAction;
  const isPlacing = tool === 'home' || tool === 'away' || tool === 'goalie' || tool === 'coach';
  const isPlaying = state.playback.isPlaying;

  // Skate applies to the selected player. Anyone can be given a route,
  // including the carrier - who could not be, because dragging a carrier is
  // always read as a pass.
  const selectedId = state.selection.selectedPlayerId;
  const selected = selectedId
    ? state.drill.players.find(player => player.id === selectedId) ?? null
    : null;

  return (
    <nav
      aria-label="Editing tools"
      className="app-chrome safe-bottom safe-x flex flex-shrink-0 items-stretch gap-1.5 border-t border-app-border bg-[#0c1825] px-2 py-1.5"
      style={{ minHeight: 'calc(var(--tool-dock-height) + var(--safe-bottom))' }}
    >
      <DockButton
        icon={<MoveIcon />}
        label="Move"
        active={tool === 'move' && pending.kind === 'none'}
        onClick={() => {
          commands.cancelPendingAction();
          commands.setTool('move');
        }}
      />

      <DockButton
        icon={<PassIcon />}
        label="Pass"
        active={pending.kind === 'pass'}
        accent="#ffd60a"
        disabled={!canPass}
        title={passBlockedReason ?? `Pass from #${carrier?.number}`}
        onClick={() => {
          if (!carrier) return;
          commands.setTool('move');
          commands.setPendingAction({ kind: 'pass', playerId: carrier.id });
        }}
      />

      <DockButton
        icon={<SkateIcon />}
        label="Skate"
        active={pending.kind === 'draw-route'}
        accent="#22d3ee"
        disabled={!selected}
        title={selected ? `Draw #${selected.number}'s route` : 'Select a player first'}
        onClick={() => {
          if (!selected) return;
          commands.setTool('move');
          commands.setPendingAction({ kind: 'draw-route', playerId: selected.id });
        }}
      />

      {compactSelection ? (
        <DockButton icon={<DetailsIcon />} label="Details" onClick={compactSelection.onDetails} />
      ) : (
        <DockButton
          icon={<AddIcon />}
          label="Add"
          active={isPlacing}
          accent="#34d399"
          ariaHasPopup
          ariaExpanded={state.ui.openSheet === 'add'}
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'add' })}
        />
      )}

      {/* Landscape phone: the transport folds in here rather than costing a
          second 44px row, which is the difference between a usable rink and
          a strip. Play (or, with a selection, Delete) is immediately to its
          right either way. */}
      {isCompactLandscape && <Transport inline />}

      {compactSelection ? (
        // Only ever rendered while isCompactLandscape is true (see
        // ContextTray), so - like the inline Transport above - there is no
        // room to spare for a text label here, just the icon.
        <button
          type="button"
          onClick={compactSelection.onDelete}
          aria-label="Delete"
          className="touch-target flex flex-1 items-center justify-center rounded-xl border-2 border-red-400/40 bg-red-500/10 px-2 py-1.5 text-red-200 transition-colors"
        >
          <DeleteIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => (isPlaying ? commands.stopPlayback() : commands.requestPlaybackStart())}
          aria-label={isPlaying ? 'Stop playback' : 'Play drill'}
          className={`touch-target flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-2 py-1.5 font-bold transition-colors ${
            isPlaying
              ? 'border-red-500 bg-red-500 text-white'
              : 'border-cyan-500 bg-cyan-500 text-[#03121c]'
          }`}
        >
          <span className="flex h-5 items-center justify-center leading-none">
            {isPlaying ? <StopIcon /> : <PlayIcon />}
          </span>
          {!isCompactLandscape && (
            <span className="text-[12px] tracking-tight">{isPlaying ? 'Stop' : 'Play'}</span>
          )}
        </button>
      )}
    </nav>
  );
}
