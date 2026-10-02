// ============================================================================
// TOP STRIP
//
// On a phone this holds only what has to be one tap away: menu, the truncated
// play name, Undo, Mode and More. Redo, the destructive clears, import,
// export, rename, settings and diagnostics all live in the More sheet; the
// brand wordmark hides here too, and the badge follows at the narrowest
// width, since neither is one of those essentials.
//
// At 320px this is five 44px targets (menu, play name, undo, mode, more) plus
// a flexible name - it cannot clip, because the name is the only thing that
// shrinks. Five 44px buttons, not six: Build/Preview/Present would be three
// MORE targets on their own, which is why a phone gets `ModeSwitchTrigger`
// (one button, opens `ModeSheet`) instead of the desktop `ModeSwitch`
// radiogroup inline - three-wide, it does not fit this row at any of the
// required portrait widths (320-390) alongside everything else that has to
// stay visible.
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';
import { ModeSwitch, ModeSwitchTrigger } from './ModeSwitch';
import { SaveStatus } from './SaveStatus';

export function TopStrip() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { isPhone, isCompactLandscape } = useResponsive();

  const canUndo = state.undoStack.length > 0;
  const canRedo = state.redoStack.length > 0;

  return (
    <header
      className="app-chrome safe-top safe-x z-30 flex flex-shrink-0 items-center gap-1.5 border-b border-cyan-500/20 bg-gradient-to-r from-[#07131e]/95 via-[#0b1b2a]/95 to-[#07131e]/95 backdrop-blur-md px-2 shadow-sm"
      style={{ minHeight: 'calc(var(--top-strip-height) + var(--safe-top))' }}
    >
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_MENU' })}
        aria-label="Open main menu"
        aria-expanded={state.ui.showMenu}
        className="touch-target flex flex-col items-center justify-center gap-[5px] rounded-xl hover:bg-app-cyan/15 transition-colors"
      >
        <span className="block h-[2px] w-[19px] rounded-sm bg-app-cyan shadow-[0_0_6px_rgba(0,229,255,0.4)]" />
        <span className="block h-[2px] w-[19px] rounded-sm bg-app-cyan shadow-[0_0_6px_rgba(0,229,255,0.4)]" />
        <span className="block h-[2px] w-[19px] rounded-sm bg-app-cyan shadow-[0_0_6px_rgba(0,229,255,0.4)]" />
      </button>

      {/*
        A 36px badge, served from a 36px-class asset. The 2 MB, 1254x1254
        source used to be downloaded in full for this. Dropped on a phone: the
        five 44px buttons this row needs already claim most of 320px, and
        branding is the one thing here a coach does not need mid-drill.
      */}
      {!isPhone && (
        <div className="flex items-center gap-2">
          <img
            src="/assets/ph-logo.webp"
            alt=""
            width={32}
            height={32}
            decoding="async"
            className="h-8 w-8 flex-shrink-0 rounded-lg object-contain shadow-sm ring-1 ring-app-cyan/30"
            draggable={false}
          />
          {!isCompactLandscape && (
            <div className="hidden flex-col text-left leading-none sm:flex">
              <span className="text-[14px] font-black tracking-wider text-white">
                PHICE<span className="text-app-cyan">CRAFT</span>
              </span>
              <span className="mt-0.5 text-[7.5px] font-black uppercase tracking-widest text-app-cyan/80">
                Hockey Practice
              </span>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void commands.requestRename()}
        className="touch-target min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1 text-center text-[14px] font-bold text-white transition-all hover:border-cyan-500/30 hover:bg-app-cyan/10 hover:shadow-[0_0_12px_rgba(0,229,255,0.15)]"
        aria-label={`Play name: ${state.drill.name}. Activate to rename.`}
      >
        {state.drill.name}
      </button>

      <SaveStatus compact={isPhone} />

      {!isPhone && !isCompactLandscape && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'practice' })}
          className="touch-target hidden items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-app-cyan/10 px-2.5 py-1 text-[13px] font-bold text-app-cyan transition-all hover:border-cyan-400 hover:bg-app-cyan/20 hover:shadow-[0_0_12px_rgba(0,229,255,0.25)] md:flex"
          aria-label="Practice Session Planner"
        >
          <span className="text-[14px]">📋</span>
          <span>Practice Plan</span>
        </button>
      )}

      {state.ui.mode === 'build' && (
        <button
          type="button"
          onClick={commands.undo}
          disabled={!canUndo}
          aria-label="Undo"
          className="touch-target flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[16px] text-white hover:border-cyan-500/30 hover:bg-app-cyan/15 hover:text-app-cyan transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          ↩
        </button>
      )}

      {isPhone ? (
        <ModeSwitchTrigger />
      ) : (
        <>
          {/* Preview and Present are read-only: Undo/Redo have nothing to do
              there, and disabled-but-visible would just invite a tap that
              silently does nothing (the reducer no-ops POP_UNDO/REDO outside
              build regardless, but the button should not be there to press). */}
          {state.ui.mode === 'build' && (
            <button
              type="button"
              onClick={commands.redo}
              disabled={!canRedo}
              aria-label="Redo"
              className="touch-target flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[16px] text-white hover:border-cyan-500/30 hover:bg-app-cyan/15 hover:text-app-cyan transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              ↪
            </button>
          )}

          <ModeSwitch />
        </>
      )}

      <button
        type="button"
        onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'more' })}
        aria-label="More actions"
        aria-haspopup="dialog"
        className="touch-target flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[16px] text-white hover:border-cyan-500/30 hover:bg-app-cyan/15 hover:text-app-cyan transition-all"
      >
        ⋯
      </button>
    </header>
  );
}
