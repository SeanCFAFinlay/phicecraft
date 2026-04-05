// ============================================================================
// APP - Main application component
// ============================================================================

import React, { useEffect } from 'react';
import { AppProvider, useAppState } from '@/hooks/useAppState';
import {
  CanvasSurface,
  TopBar,
  PuckChainBar,
  Toolbar,
  Playbar,
  SideMenu,
  ContextMenu,
  PlayerInfoPanel,
  ToastContainer,
  ModeBanner,
  PlayBanner,
  RenameModal,
  PassOverlay,
} from '@/components';

function AppContent() {
  const { actions } = useAppState();

  useEffect(() => {
    // Welcome toast
    setTimeout(() => {
      actions.showToast('Welcome to PhiceCraft! Tap a player to start building your drill.', 'info', 5500);
    }, 100);
  }, []);

  return (
    <div className="flex flex-col w-screen h-screen h-dvh overflow-hidden bg-app-bg text-app-text font-sans select-none">
      <TopBar />
      <PuckChainBar />

      <div className="flex-1 relative overflow-hidden bg-[#050e18]">
        <CanvasSurface />

        {/* Overlays */}
        <ToastContainer />
        <ModeBanner />
        <PlayBanner />
        <PassOverlay />
        <PlayerInfoPanel />
        <ContextMenu />
        <Toolbar />
      </div>

      <Playbar />

      {/* Modals */}
      <SideMenu />
      <RenameModal />
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
