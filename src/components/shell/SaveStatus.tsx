// ============================================================================
// SAVE STATUS
//
// A compact, always-visible statement of whether the user's work is safe.
//
// A failure is NOT a toast that disappears. It stays in the top strip until it
// is resolved, with Retry and Export next to it, because "Play saved" flashing
// past while the write actually failed is how work gets lost.
// ============================================================================

import { useSyncExternalStore } from 'react';
import { useAppServices, useCommands } from '@/hooks/useAppState';
import { describePersistenceError } from '@/persistence';

export function SaveStatus({ compact = false }: { compact?: boolean }) {
  const { coordinator } = useAppServices();
  const commands = useCommands();
  const status = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot
  );

  if (status.state === 'error' && status.error) {
    return (
      <div
        role="alert"
        className="flex min-w-0 items-center gap-2 rounded-xl border border-red-400/70 bg-red-500/15 px-2.5 py-1.5"
      >
        <span className="truncate text-[12px] font-black text-red-200">Save failed</span>
        <span className="sr-only">{describePersistenceError(status.error)}</span>
        <button
          type="button"
          onClick={() => void commands.retrySave()}
          className="touch-target rounded-lg border border-red-300/50 px-2 text-[11px] font-bold text-red-100 hover:bg-red-400/20"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={() => void commands.exportUnsavedData()}
          className="touch-target rounded-lg border border-red-300/50 px-2 text-[11px] font-bold text-red-100 hover:bg-red-400/20"
        >
          Export
        </button>
      </div>
    );
  }

  const label =
    status.state === 'saving'
      ? 'Saving…'
      : status.state === 'dirty'
        ? 'Unsaved changes'
        : 'Saved';

  const tone =
    status.state === 'saving'
      ? 'border-cyan-400/50 text-cyan-200'
      : status.state === 'dirty'
        ? 'border-amber-400/50 text-amber-200'
        : 'border-emerald-400/40 text-emerald-200';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Save status: ${label}`}
      className={`flex items-center gap-1.5 rounded-lg border bg-white/[0.04] px-2 py-1 ${tone}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          status.state === 'saving'
            ? 'bg-cyan-300'
            : status.state === 'dirty'
              ? 'bg-amber-300'
              : 'bg-emerald-300'
        }`}
      />
      <span className={compact ? 'sr-only' : 'text-[12px] font-bold'}>{label}</span>
      {compact && <span className="sr-only">{label}</span>}
    </div>
  );
}
