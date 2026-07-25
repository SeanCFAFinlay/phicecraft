// ============================================================================
// TOP-LEVEL ERROR BOUNDARY
//
// If the editor crashes, the user's in-memory drill is still the only copy of
// whatever they were doing. This offers to export it BEFORE anything else, and
// never deletes durable data as part of recovery.
//
// It also guards against a crash/reload loop: after two crashes in a session
// it stops offering the plain reload and points at the reset instead.
// ============================================================================

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getSaveCoordinator } from '@/persistence';
import { downloadTextFile } from '@/ui/download';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  crashCount: number;
  exported: 'idle' | 'done' | 'failed';
}

/** Interface state only. Durable drills are never touched by a reset. */
const UI_STATE_KEYS = ['phicecraft_settings', 'phicecraft_ui'];

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, crashCount: 0, exported: 'idle' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Diagnostic logging, kept deliberately: this is the only trace of a crash
    // in a local-first app with no server to report to.
    console.error('PhiceCraft crashed:', error, info.componentStack);
    this.setState(state => ({ crashCount: state.crashCount + 1 }));
  }

  private exportInMemoryDrill = (): void => {
    const drill = getSaveCoordinator().pendingDocument;
    if (!drill) {
      this.setState({ exported: 'failed' });
      return;
    }

    const ok = downloadTextFile(
      `phicecraft-recovered-${drill.name || 'drill'}.json`,
      JSON.stringify(
        {
          format: 'phicecraft-drills',
          version: 1,
          exportedAt: Date.now(),
          containsUnsavedRevision: true,
          drills: [drill],
        },
        null,
        2
      )
    );
    this.setState({ exported: ok ? 'done' : 'failed' });
  };

  private reload = (): void => {
    window.location.reload();
  };

  private resetInterfaceState = (): void => {
    // Clears interface preferences only. The IndexedDB drill store is left
    // completely alone - a crash must never cost the user their library.
    try {
      for (const key of UI_STATE_KEYS) localStorage.removeItem(key);
    } catch {
      // A blocked localStorage just means there was nothing to clear.
    }
    window.location.reload();
  };

  render(): ReactNode {
    const { error, crashCount, exported } = this.state;
    if (!error) return this.props.children;

    const looping = crashCount >= 2;

    return (
      <div className="flex h-full w-full items-center justify-center bg-app-bg p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="crash-title"
          aria-describedby="crash-body"
          className="selectable w-full max-w-md rounded-2xl border border-red-400/40 bg-app-surface p-5 shadow-2xl"
        >
          <h1 id="crash-title" className="text-lg font-black text-red-200">
            PhiceCraft hit an error
          </h1>
          <p id="crash-body" className="mt-2 text-[13px] leading-relaxed text-white/70">
            Your saved plays are untouched. Export the drill you were working on first — that copy
            only exists in this tab.
          </p>

          <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-white/50">
            {error.message}
          </pre>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={this.exportInMemoryDrill}
              className="touch-target rounded-xl bg-app-cyan px-4 py-3 text-sm font-bold text-[#03121c]"
            >
              Export the drill I was working on
            </button>

            {exported === 'done' && (
              <p role="status" className="text-[12px] text-emerald-300">
                Exported. Keep that file safe before reloading.
              </p>
            )}
            {exported === 'failed' && (
              <p role="alert" className="text-[12px] text-red-300">
                Nothing could be exported — there was no drill in memory, or the browser blocked the
                download.
              </p>
            )}

            {!looping && (
              <button
                type="button"
                onClick={this.reload}
                className="touch-target rounded-xl border border-app-border bg-white/5 px-4 py-3 text-sm font-bold text-app-text"
              >
                Reload the application
              </button>
            )}

            <button
              type="button"
              onClick={this.resetInterfaceState}
              className="touch-target rounded-xl border border-app-border bg-white/5 px-4 py-3 text-sm font-bold text-app-text"
            >
              Reset interface state and reload
            </button>

            {looping && (
              <p className="text-[12px] leading-snug text-amber-200">
                This has now happened {crashCount} times. Resetting interface state is the safer
                option; it does not delete your saved plays.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
}
