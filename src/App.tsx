// ============================================================================
// APP - Main application component
// ============================================================================

import { useEffect } from 'react';
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
  EventInfoPanel,
  WorkflowBar,
  DiagnosticsOverlay,
  ValidationPanel,
  ToastContainer,
  ModeBanner,
  PlayBanner,
  RenameModal,
  PassOverlay,
} from '@/components';

function AppContent() {
  const { actions } = useAppState();

  useEffect(() => {
    // Welcome toast, once the first paint is out of the way
    const timer = window.setTimeout(() => {
      actions.showToast('Welcome to PhiceCraft! Tap a player to start.', 'info', 4000);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [actions]);

  return (
    <div className="flex flex-col w-screen h-screen h-dvh overflow-hidden bg-app-bg text-app-text font-sans select-none">
      {/* Fixed Header */}
      <TopBar />

      {/* Puck Chain Bar */}
      <PuckChainBar />
      <WorkflowBar />

      {/* Canvas Area - takes remaining space */}
      <div className="flex-1 relative overflow-hidden bg-[#0a1520] min-h-0">
        <CanvasSurface />

        {/* Floating overlays only */}
        <ToastContainer />
        <ModeBanner />
        <PlayBanner />
        <DiagnosticsOverlay />
        <ValidationPanel />
        <ContextMenu />
      </div>

      {/* Fixed Toolbar */}
      <Toolbar />

      {/* Fixed Playbar */}
      <Playbar />

      {/* Modals (fullscreen overlays) */}
      <SideMenu />
      <RenameModal />
      <PassOverlay />
      <PlayerInfoPanel />
      <EventInfoPanel />
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
