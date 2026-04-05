// ============================================================================
// TOP BAR - Header with menu, logo, drill name, and actions
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';

export function TopBar() {
  const { state, actions } = useAppState();

  const handleUndo = () => {
    if (state.undoStack.length === 0) {
      actions.showToast('Nothing to undo', 'info');
      return;
    }
    actions.undo();
    actions.showToast('Undone', 'success', 1200);
  };

  const handleClear = () => {
    if (!confirm('Clear all paths and events?')) return;
    actions.clearAllEvents();
    actions.showToast('Board cleared', 'success');
  };

  return (
    <header className="h-[50px] flex-shrink-0 flex items-center gap-2 px-2 bg-app-surface border-b border-app-border z-30">
      {/* Menu button */}
      <button
        onClick={actions.toggleMenu}
        className="w-9 h-9 flex flex-col justify-center items-center gap-[5px] p-0 bg-transparent border-none cursor-pointer"
      >
        <span className={`block w-[19px] h-[2px] bg-app-cyan rounded-sm transition-transform duration-200 ${
          state.ui.showMenu ? 'translate-y-[7px] rotate-45' : ''
        }`} />
        <span className={`block w-[19px] h-[2px] bg-app-cyan rounded-sm transition-opacity duration-200 ${
          state.ui.showMenu ? 'opacity-0' : ''
        }`} />
        <span className={`block w-[19px] h-[2px] bg-app-cyan rounded-sm transition-transform duration-200 ${
          state.ui.showMenu ? '-translate-y-[7px] -rotate-45' : ''
        }`} />
      </button>

      {/* Logo */}
      <div className="text-lg font-black tracking-wider text-white flex-shrink-0">
        PHICE<span className="text-app-cyan">CRAFT</span>
      </div>

      {/* Drill name */}
      <button
        onClick={actions.showRenameModal}
        className="flex-1 text-[11px] text-app-dim text-center overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer px-2 py-1 rounded hover:bg-app-cyan/5 active:bg-app-cyan/10"
      >
        {state.drill.name}
      </button>

      {/* Undo button */}
      <button
        onClick={handleUndo}
        className="w-[34px] h-[34px] bg-white/5 border border-app-border rounded-lg text-app-text text-[15px] cursor-pointer flex items-center justify-center flex-shrink-0 hover:bg-app-cyan/10 active:scale-95"
        title="Undo"
      >
        ↩
      </button>

      {/* Clear button */}
      <button
        onClick={handleClear}
        className="w-[34px] h-[34px] bg-white/5 border border-app-border rounded-lg text-app-text text-[15px] cursor-pointer flex items-center justify-center flex-shrink-0 hover:bg-app-cyan/10 active:scale-95"
        title="Clear paths"
      >
        ⊘
      </button>
    </header>
  );
}
