// ============================================================================
// TOASTS
//
// Renders the ONE active toast from the queue in the reducer. Two things were
// wrong before: `toasts[0]` was rendered while being described as "the most
// recent" (it was the oldest), and every message was a single non-wrapping
// line with no role, so a long failure was both truncated and silent.
// ============================================================================

import { useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';

const TYPE_STYLES: Record<string, string> = {
  info: 'border-app-cyan/70 bg-[#062232]/95 text-cyan-100',
  success: 'border-emerald-400/70 bg-[#052318]/95 text-emerald-100',
  warning: 'border-amber-400/70 bg-[#2a1f04]/95 text-amber-100',
  error: 'border-red-400/80 bg-[#2a0b0e]/97 text-red-100',
};

export function ToastHost() {
  const { state, dispatch } = useAppState();
  const toast = state.ui.activeToast;

  // A toast with duration 0 stays until dismissed. That is how a failure keeps
  // its instructions on screen instead of flashing past.
  useEffect(() => {
    if (!toast || toast.duration <= 0) return;
    const timer = window.setTimeout(
      () => dispatch({ type: 'DISMISS_TOAST', id: toast.id }),
      toast.duration
    );
    return () => window.clearTimeout(timer);
  }, [toast, dispatch]);

  if (!toast) return null;

  const persistent = toast.duration <= 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-3 pt-2">
      <div
        role={toast.role}
        aria-live={toast.role === 'alert' ? 'assertive' : 'polite'}
        className={`pointer-events-auto flex max-w-[min(560px,94vw)] items-start gap-3 rounded-2xl border px-4 py-2.5 text-[13px] font-semibold leading-snug shadow-xl backdrop-blur-md ${
          TYPE_STYLES[toast.type] ?? TYPE_STYLES.info
        }`}
      >
        {/* Wraps rather than truncating: the whole instruction has to be readable. */}
        <span className="selectable min-w-0 flex-1 whitespace-pre-line break-words">{toast.message}</span>

        {persistent && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'DISMISS_TOAST', id: toast.id })}
            className="touch-target -my-1 -mr-2 flex shrink-0 items-center justify-center rounded-lg px-2 text-xs font-black opacity-80 hover:opacity-100"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        )}

        {state.ui.toastQueue.length > 0 && (
          <span className="sr-only">{state.ui.toastQueue.length} more messages queued</span>
        )}
      </div>
    </div>
  );
}
