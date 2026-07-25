// ============================================================================
// TOP STRIP
//
// On a phone this holds only what has to be one tap away: menu, brand, the
// truncated play name, Undo, and More. Redo, the destructive clears, import,
// export, rename, settings and diagnostics all live in the More sheet.
//
// At 320px this is five targets of at least 44px plus a flexible name - it
// cannot clip, because the name is the only thing that shrinks.
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';
import { SaveStatus } from './SaveStatus';

export function TopStrip() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { isPhone, isCompactLandscape } = useResponsive();

  const canUndo = state.undoStack.length > 0;
  const canRedo = state.redoStack.length > 0;

  return (
    <header
      className="app-chrome safe-top safe-x z-30 flex flex-shrink-0 items-center gap-1.5 border-b border-app-border bg-app-surface px-2"
      style={{ minHeight: 'calc(var(--top-strip-height) + var(--safe-top))' }}
    >
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_MENU' })}
        aria-label="Open main menu"
        aria-expanded={state.ui.showMenu}
        className="touch-target flex flex-col items-center justify-center gap-[5px] rounded-lg hover:bg-app-cyan/10"
      >
        <span className="block h-[2px] w-[19px] rounded-sm bg-app-cyan" />
        <span className="block h-[2px] w-[19px] rounded-sm bg-app-cyan" />
        <span className="block h-[2px] w-[19px] rounded-sm bg-app-cyan" />
      </button>

      {/*
        A 36px badge, served from a 36px-class asset. The 2 MB, 1254x1254
        source used to be downloaded in full for this.
      */}
      <img
        src="/assets/ph-logo.webp"
        alt=""
        width={32}
        height={32}
        decoding="async"
        className="h-8 w-8 flex-shrink-0 rounded-lg object-contain"
        draggable={false}
      />

      {!isCompactLandscape && (
        <span className="hidden flex-shrink-0 text-base font-black tracking-wider text-white sm:block">
          PHICE<span className="text-app-cyan">CRAFT</span>
        </span>
      )}

      <button
        type="button"
        onClick={() => void commands.requestRename()}
        className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-center text-[14px] font-semibold text-app-text hover:bg-app-cyan/5"
        aria-label={`Play name: ${state.drill.name}. Activate to rename.`}
      >
        {state.drill.name}
      </button>

      <SaveStatus compact={isPhone} />

      <button
        type="button"
        onClick={commands.undo}
        disabled={!canUndo}
        aria-label="Undo"
        className="touch-target flex items-center justify-center rounded-xl border border-app-border bg-white/5 text-[16px] text-app-text hover:bg-app-cyan/10 disabled:opacity-30"
      >
        ↩
      </button>

      {!isPhone && (
        <button
          type="button"
          onClick={commands.redo}
          disabled={!canRedo}
          aria-label="Redo"
          className="touch-target flex items-center justify-center rounded-xl border border-app-border bg-white/5 text-[16px] text-app-text hover:bg-app-cyan/10 disabled:opacity-30"
        >
          ↪
        </button>
      )}

      <button
        type="button"
        onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'more' })}
        aria-label="More actions"
        aria-haspopup="dialog"
        className="touch-target flex items-center justify-center rounded-xl border border-app-border bg-white/5 text-[16px] text-app-text hover:bg-app-cyan/10"
      >
        ⋯
      </button>
    </header>
  );
}
