// ============================================================================
// BANNERS - Mode and playback banners
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';

export function ModeBanner() {
  const { state } = useAppState();

  if (!state.ui.modeBanner) return null;

  return (
    <div className="absolute top-10 left-1/2 -translate-x-1/2 rounded-[20px] px-4 py-1.5 text-xs font-bold pointer-events-none z-20 whitespace-nowrap max-w-[94vw] text-center bg-app-gold/10 border border-app-gold text-app-gold">
      {state.ui.modeBanner}
    </div>
  );
}

export function PlayBanner() {
  const { state } = useAppState();

  if (!state.ui.playBanner) return null;

  return (
    <div className="absolute top-1.5 left-1/2 -translate-x-1/2 rounded-[20px] px-4 py-1.5 text-xs font-bold pointer-events-none z-20 whitespace-nowrap max-w-[94vw] text-center bg-app-green/10 border border-app-green text-app-green">
      {state.ui.playBanner}
    </div>
  );
}
