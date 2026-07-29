// ============================================================================
// APP SHELL
//
// Mobile-first shell:
//
//   top strip   (menu · brand · name · save status · undo · more)
//   rink        (flex-1, everything else floats over it as a chip)
//   transport   (compact playback)
//   tool dock   (Select · Add · Action · Erase · Play)
//
// Everything else is a sheet, opened on demand. Secondary surfaces are
// lazy-loaded so none of them are on the path to first interaction.
// ============================================================================

import { Suspense, lazy, useSyncExternalStore } from 'react';
import { useAppServices, useAppState } from '@/hooks/useAppState';
import { CanvasSurface } from '@/components/canvas/CanvasSurface';
import { TopStrip } from '@/components/shell/TopStrip';
import { ToolDock } from '@/components/shell/ToolDock';
import { Transport } from '@/components/shell/Transport';
import { PreviewBar } from '@/components/shell/PreviewBar';
import { PresentOverlay } from '@/components/shell/PresentOverlay';
import { ActionChip, ContextChips, SelectionChip } from '@/components/shell/RinkChips';
import { useKeyboardShortcuts } from '@/components/shell/useKeyboardShortcuts';
import { ToastHost } from '@/components/Toast';
import { DialogHost } from '@/components/DialogHost';
import { LiveRegion } from '@/components/a11y/LiveRegion';
import { ViewControls } from '@/components/ViewControls';
import { ValidationPanel } from '@/components/ValidationPanel';
import { AddSheet, PossessionSheet, WorkflowSheet } from '@/components/sheets/QuickSheets';
import { UpdateBanner } from '@/pwa/UpdateBanner';
import { useResponsive } from '@/ui/useResponsive';

// Secondary surfaces: none of these are needed to draw the rink, select a
// player, or recover from an error, so they are not in the initial bundle.
// The library carries the whole drill catalogue with it. A coach who never
// opens it should not pay for 24 drill documents on the way to first paint.
const LibraryPage = lazy(() =>
  import('@/features/library/LibraryPage').then(module => ({ default: module.LibraryPage }))
);
const MenuSheet = lazy(() =>
  import('@/components/sheets/MenuSheet').then(module => ({ default: module.MenuSheet }))
);
const MoreSheet = lazy(() =>
  import('@/components/sheets/MoreSheet').then(module => ({ default: module.MoreSheet }))
);
const PlaybackSheet = lazy(() =>
  import('@/components/sheets/PlaybackSheet').then(module => ({ default: module.PlaybackSheet }))
);
const HelpSheet = lazy(() =>
  import('@/components/sheets/HelpSheet').then(module => ({ default: module.HelpSheet }))
);
const ImportPreviewSheet = lazy(() =>
  import('@/components/sheets/ImportPreviewSheet').then(module => ({
    default: module.ImportPreviewSheet,
  }))
);
const PlayerInspector = lazy(() =>
  import('@/components/inspectors/PlayerInspector').then(module => ({
    default: module.PlayerInspector,
  }))
);
const EventInspector = lazy(() =>
  import('@/components/inspectors/EventInspector').then(module => ({
    default: module.EventInspector,
  }))
);
const DiagnosticsOverlay = lazy(() =>
  import('@/components/DiagnosticsOverlay').then(module => ({ default: module.DiagnosticsOverlay }))
);

export function AppShell() {
  const { state, dispatch } = useAppState();
  const { importPreviews } = useAppServices();
  const { isDesktop, isCompactLandscape } = useResponsive();

  // The command layer parses the file and publishes the preview here; this
  // component only renders it.
  const importPreview = useSyncExternalStore(
    importPreviews.subscribe,
    importPreviews.getSnapshot,
    importPreviews.getSnapshot
  );

  useKeyboardShortcuts();

  const mode = state.ui.mode;

  return (
    <div className="app-chrome flex h-full w-full flex-col overflow-hidden bg-app-bg text-app-text">
      {mode !== 'present' && <TopStrip />}

      <main className="relative min-h-0 flex-1 overflow-hidden bg-[#0a1520]">
        <CanvasSurface />

        {mode !== 'present' && (
          <>
            <ContextChips />
            <ActionChip />
            <SelectionChip />
          </>
        )}
        <UpdateBanner />
        <ToastHost />
        {mode !== 'present' && <ViewControls />}
        {mode !== 'present' && isDesktop && <ValidationPanel />}

        <Suspense fallback={null}>{state.ui.showDiagnostics && <DiagnosticsOverlay />}</Suspense>

        {mode === 'present' && <PresentOverlay />}
      </main>

      {/* On a landscape phone the transport lives inside the dock instead of
          taking a second row of its own. Outside Build, the dock and its
          transport are not rendered at all - Preview gets its own read-only
          surface below; Present gets one in a later task. */}
      {mode === 'build' && !isCompactLandscape && <Transport />}
      {mode === 'build' && <ToolDock />}
      {mode === 'preview' && <PreviewBar />}

      {/* Sheets and inspectors. Conditionally mounted, so nothing focusable
          sits off-screen when they are closed. */}
      <AddSheet />
      <PossessionSheet />
      <WorkflowSheet />

      <Suspense fallback={null}>
        {state.ui.openSheet === 'library' && <LibraryPage />}
        {state.ui.showMenu && <MenuSheet />}
        {state.ui.openSheet === 'more' && <MoreSheet />}
        {state.ui.openSheet === 'playback' && <PlaybackSheet />}
        {state.ui.openSheet === 'help' && <HelpSheet />}
        {state.ui.openSheet === 'import-preview' && (
          <ImportPreviewSheet
            preview={importPreview}
            onClose={() => {
              importPreviews.clear();
              dispatch({ type: 'CLOSE_SHEET' });
            }}
          />
        )}
        {state.ui.inspector.kind === 'player' && <PlayerInspector />}
        {state.ui.inspector.kind === 'event' && <EventInspector />}
      </Suspense>

      <DialogHost />
      <LiveRegion />
    </div>
  );
}
