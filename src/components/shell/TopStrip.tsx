// ============================================================================
// TOP STRIP
//
// Clean, pro-grade coaching workspace navigation header.
// Organizes the app into three clear zones:
// - Left: Menu, PHormation brand, play title & save status
// - Center: Direct Workspace Switcher (Rink, Practice Plans, Playbook, Teach)
// - Right: Undo/Redo, Mode Switch & More
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';
import { ModeSwitch, ModeSwitchTrigger } from './ModeSwitch';
import { SaveStatus } from './SaveStatus';

export function TopStrip() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { isPhone, isCompactLandscape, width } = useResponsive();
  // A landscape phone has the width for words on the workspace tabs but not
  // the height for a second row, so the rest of the strip gives way instead:
  // the save state becomes a dot, Redo moves to the keyboard/menu and the
  // mode switch folds into one button. Icons alone said nothing to a coach.
  const isTightLandscape = isCompactLandscape && !isPhone;
  const showTabLabels = isTightLandscape && width >= 740;
  const tabLabel = showTabLabels ? 'inline' : 'hidden xl:inline';

  const canUndo = state.undoStack.length > 0;
  const canRedo = state.redoStack.length > 0;
  const activeSheet = state.ui.openSheet;
  const isPractice = activeSheet === 'practice';
  const isLibrary = activeSheet === 'library';
  const isCoach = activeSheet === 'coach';
  const isRink = !isPractice && !isLibrary && !isCoach;

  return (
    <header
      className="app-chrome safe-top safe-x z-[130] flex flex-shrink-0 items-center justify-between border-b border-cyan-500/20 bg-[#06121d]/95 backdrop-blur-md px-2.5 shadow-sm select-none"
      style={{ minHeight: 'calc(var(--top-strip-height) + var(--safe-top))' }}
    >
      {/* LEFT: Menu button, Brand Logo & Play Name */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_MENU' })}
          aria-label="Open main menu"
          aria-expanded={state.ui.showMenu}
          className="touch-target flex h-8 w-8 shrink-0 flex-col items-center justify-center gap-[3.5px] rounded-lg hover:bg-app-cyan/15 transition-colors"
        >
          <span className="block h-[2px] w-[16px] rounded-sm bg-app-cyan shadow-[0_0_6px_rgba(0,229,255,0.4)]" />
          <span className="block h-[2px] w-[16px] rounded-sm bg-app-cyan shadow-[0_0_6px_rgba(0,229,255,0.4)]" />
          <span className="block h-[2px] w-[16px] rounded-sm bg-app-cyan shadow-[0_0_6px_rgba(0,229,255,0.4)]" />
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <img
            src="/assets/ph-logo.webp"
            alt=""
            width={26}
            height={26}
            decoding="async"
            className="h-6 w-6 rounded-md object-contain ring-1 ring-app-cyan/30"
            draggable={false}
          />
          {!isCompactLandscape && (
            <span className="hidden text-[13px] font-black tracking-wider text-white lg:inline">
              PH<span className="text-app-cyan">ORMATION</span>
            </span>
          )}
        </div>

        <div className="h-3.5 w-[1px] bg-white/10 hidden sm:block shrink-0" />

        <button
          type="button"
          onClick={() => void commands.requestRename()}
          className={`touch-target truncate max-w-[120px] sm:max-w-[160px] ${isTightLandscape ? '' : 'md:max-w-[200px]'} rounded-lg px-2 py-0.5 text-left text-[12.5px] font-bold text-white/90 hover:bg-white/10 hover:text-white transition-all`}
          aria-label={`Play name: ${state.drill.name}. Activate to rename.`}
        >
          {state.drill.name}
        </button>

        <SaveStatus compact={isPhone || isTightLandscape} />
      </div>

      {/* CENTER: Workspace Selector Segmented Pills.
          Not on phones: four 44px tabs left no room for the menu, the play
          name or the save state - they were drawn underneath the tabs, and
          at 320px the More button fell off the screen. Every one of these
          destinations is in the main menu. */}
      <nav aria-label="Workspaces" className="mx-2 hidden shrink-0 items-center gap-1 rounded-xl bg-black/40 p-0.5 border border-white/10 sm:flex">
        <button
          type="button"
          onClick={() => dispatch({ type: 'CLOSE_SHEET' })}
          aria-label="Rink board"
          aria-current={isRink ? 'page' : undefined}
          title="Rink"
          className={`touch-target flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold transition-all ${
            isRink
              ? 'bg-app-cyan text-[#041019] shadow-sm font-black'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <span aria-hidden="true">🏒</span>
          <span className={tabLabel}>Rink</span>
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'practice' })}
          aria-label="Practice session planner"
          title="Practice Plans"
          className={`touch-target flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold transition-all ${
            isPractice
              ? 'bg-app-cyan text-[#041019] shadow-sm font-black'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <span aria-hidden="true">📅</span>
          <span className={tabLabel}>{showTabLabels ? 'Practice' : 'Practice Plans'}</span>
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'library' })}
          aria-label="Drill playbook library"
          title="Playbook"
          className={`touch-target flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold transition-all ${
            isLibrary
              ? 'bg-app-cyan text-[#041019] shadow-sm font-black'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <span aria-hidden="true">📚</span>
          <span className={tabLabel}>Playbook</span>
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'coach' })}
          aria-label="Coach workspace"
          title="Teach"
          className={`touch-target flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold transition-all ${
            isCoach
              ? 'bg-app-cyan text-[#041019] shadow-sm font-black'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <span aria-hidden="true">📋</span>
          <span className={tabLabel}>Teach</span>
        </button>
      </nav>

      {/* RIGHT: Undo/Redo, Mode Switch, More */}
      <div className="flex items-center gap-1 shrink-0">
        {state.ui.mode === 'build' && (
          <button
            type="button"
            onClick={commands.undo}
            disabled={!canUndo}
            aria-label="Undo"
            className="touch-target flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[14px] text-white hover:border-cyan-500/30 hover:bg-app-cyan/15 hover:text-app-cyan transition-all disabled:opacity-20 disabled:pointer-events-none"
          >
            ↩
          </button>
        )}

        {isPhone || isTightLandscape ? (
          <ModeSwitchTrigger />
        ) : (
          <>
            {state.ui.mode === 'build' && (
              <button
                type="button"
                onClick={commands.redo}
                disabled={!canRedo}
                aria-label="Redo"
                className="touch-target flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[14px] text-white hover:border-cyan-500/30 hover:bg-app-cyan/15 hover:text-app-cyan transition-all disabled:opacity-20 disabled:pointer-events-none"
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
          className="touch-target flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[14px] text-white hover:border-cyan-500/30 hover:bg-app-cyan/15 hover:text-app-cyan transition-all"
        >
          ⋯
        </button>
      </div>
    </header>
  );
}
