// ============================================================================
// APP
//
// Composition root: the error boundary, the application-state provider, and
// the editor runtime (camera store, frame store, playback clock) wrapped
// around the shell. The shell itself lives in AppShell.tsx so tests can mount
// it with injected services.
// ============================================================================

import { AppProvider } from '@/hooks/useAppState';
import { EditorRuntimeProvider } from '@/hooks/useEditorRuntime';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppShell } from './AppShell';

export function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <EditorRuntimeProvider>
          <AppShell />
        </EditorRuntimeProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
