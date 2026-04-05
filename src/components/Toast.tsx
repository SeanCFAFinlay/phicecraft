// ============================================================================
// TOAST - Notification messages
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';

export function ToastContainer() {
  const { state } = useAppState();
  const toast = state.ui.toasts[0]; // Show only the most recent toast

  if (!toast) return null;

  const typeStyles = {
    info: 'bg-app-cyan/15 border-app-cyan text-app-cyan',
    success: 'bg-app-green/15 border-app-green text-app-green',
    warning: 'bg-app-gold/15 border-app-gold text-app-gold',
    error: 'bg-app-red/15 border-app-red text-app-red',
  };

  return (
    <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div
        className={`rounded-[20px] px-4 py-1.5 text-xs font-bold whitespace-nowrap max-w-[94vw] text-center border ${typeStyles[toast.type]}`}
      >
        {toast.message}
      </div>
    </div>
  );
}
