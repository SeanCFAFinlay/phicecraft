// ============================================================================
// RENAME MODAL - Drill name editing modal
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { useAppState } from '@/hooks/useAppState';

export function RenameModal() {
  const { state, actions } = useAppState();
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ui.showRenameModal) {
      setName(state.drill.name);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [state.ui.showRenameModal, state.drill.name]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed) {
      actions.renameDrill(trimmed);
      actions.hideRenameModal();
      actions.showToast(`✓ ${trimmed}`, 'success');
    }
  };

  const handleCancel = () => {
    actions.hideRenameModal();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  if (!state.ui.showRenameModal) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center">
      <div className="bg-app-surface border border-app-border rounded-xl p-5 w-[min(300px,90vw)] flex flex-col gap-3">
        <h3 className="text-sm font-bold text-app-text">✏️ Rename Drill</h3>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={40}
          placeholder="e.g. 2-on-1 Rush"
          className="w-full bg-white/5 border border-app-border rounded-lg py-2 px-3 text-app-text text-[13px] outline-none focus:border-app-cyan"
        />

        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="flex-1 py-2 rounded-lg border-none text-[13px] font-bold cursor-pointer bg-white/10 text-app-text hover:bg-white/15"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 rounded-lg border-none text-[13px] font-bold cursor-pointer bg-app-cyan text-white hover:bg-app-cyan/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
