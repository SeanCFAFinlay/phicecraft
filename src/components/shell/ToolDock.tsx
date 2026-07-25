// ============================================================================
// TOOL DOCK
//
// Five primary controls, all at least 44x44: Select, Add, Action, Erase, Play.
//
// Add and Action open sheets rather than adding more buttons to a row that
// already needed a hidden horizontal scrollbar to reach Erase on a 320px
// phone. Nothing essential is reachable only by scrolling sideways.
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';

interface DockButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  accent?: string;
  onClick: () => void;
  ariaHasPopup?: boolean;
  ariaExpanded?: boolean;
}

function DockButton({ icon, label, active, accent, onClick, ariaHasPopup, ariaExpanded }: DockButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaHasPopup ? undefined : active}
      aria-haspopup={ariaHasPopup ? 'dialog' : undefined}
      aria-expanded={ariaHasPopup ? ariaExpanded : undefined}
      style={active && accent ? { borderColor: accent, color: accent, backgroundColor: `${accent}22` } : undefined}
      className={`touch-target flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-2 py-1.5 transition-colors ${
        active && !accent
          ? 'border-app-cyan bg-app-cyan/15 text-app-cyan'
          : active
            ? ''
            : 'border-transparent bg-white/5 text-white/60 hover:bg-white/10'
      }`}
    >
      <span className="text-[17px] leading-none" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[11px] font-bold tracking-tight">{label}</span>
    </button>
  );
}

export function ToolDock() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { isCompactLandscape } = useResponsive();

  const tool = state.ui.currentTool;
  const isPlacing = tool === 'home' || tool === 'away' || tool === 'goalie' || tool === 'coach';
  const isActionTool = tool === 'skate' || tool === 'pass' || tool === 'shoot';
  const isPlaying = state.playback.isPlaying;

  return (
    <nav
      aria-label="Editing tools"
      className="app-chrome safe-bottom safe-x flex flex-shrink-0 items-stretch gap-1.5 border-t border-app-border bg-[#0c1825] px-2 py-1.5"
      style={{ minHeight: 'calc(var(--tool-dock-height) + var(--safe-bottom))' }}
    >
      <DockButton
        icon="✋"
        label="Select"
        active={tool === 'select'}
        onClick={() => commands.setTool('select')}
      />

      <DockButton
        icon="➕"
        label="Add"
        active={isPlacing}
        accent="#34d399"
        ariaHasPopup
        ariaExpanded={state.ui.openSheet === 'add'}
        onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'add' })}
      />

      <DockButton
        icon="🏒"
        label="Action"
        active={isActionTool || state.pendingAction.kind !== 'none'}
        accent="#ffd60a"
        ariaHasPopup
        ariaExpanded={state.ui.openSheet === 'action'}
        onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'action' })}
      />

      <DockButton
        icon="🗑"
        label="Erase"
        active={tool === 'erase'}
        accent="#ef4444"
        onClick={() => commands.setTool('erase')}
      />

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
        <span className="text-[17px] leading-none" aria-hidden="true">
          {isPlaying ? '■' : '▶'}
        </span>
        {!isCompactLandscape && <span className="text-[11px] tracking-tight">{isPlaying ? 'Stop' : 'Play'}</span>}
      </button>
    </nav>
  );
}
