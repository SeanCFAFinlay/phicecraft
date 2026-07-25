// ============================================================================
// TRANSPORT
//
// The collapsed playback bar: reset, play/pause, time, expand. Everything else
// - the full timeline, speed, step controls, lifecycle, diagnostics - lives in
// the expanded playback sheet, so the rink keeps its height on a phone.
//
// It subscribes to the playback store's COARSE snapshot, so it re-renders
// about once per percent of progress rather than 60 times a second.
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';
import { useResponsive } from '@/ui/useResponsive';

function formatClock(progress: number, duration: number): string {
  const seconds = progress * duration;
  return `${seconds.toFixed(1)}s / ${duration.toFixed(1)}s`;
}

export function Transport() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { playback } = useEditorRuntime();
  const snapshot = usePlaybackSnapshot(playback);
  const { isCompactLandscape } = useResponsive();

  const isPlaying = state.playback.isPlaying;
  const progress = snapshot.progressPercent / 100;

  return (
    <div
      className="app-chrome safe-x flex flex-shrink-0 items-center gap-2 border-t border-app-border bg-[#0c1825] px-2 py-1.5"
      style={{ minHeight: 'var(--transport-height)' }}
    >
      <button
        type="button"
        onClick={commands.resetPlayback}
        aria-label="Reset playback to the start"
        className="touch-target flex items-center justify-center rounded-xl border border-app-border bg-white/5 text-[15px] text-app-text hover:bg-white/10"
      >
        ⏮
      </button>

      <button
        type="button"
        onClick={() => (isPlaying ? commands.stopPlayback() : commands.requestPlaybackStart())}
        aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
        className={`touch-target flex items-center justify-center rounded-full border-2 text-[17px] ${
          isPlaying
            ? 'border-red-500 bg-red-500 text-white'
            : 'border-cyan-500 bg-cyan-500 text-[#03121c]'
        }`}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>

      {/* Progress: a labelled bar, plus the clock in text for screen readers. */}
      <div
        className="min-w-0 flex-1"
        role="progressbar"
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={snapshot.progressPercent}
        aria-valuetext={formatClock(progress, snapshot.durationSeconds)}
      >
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-app-cyan"
            style={{ width: `${snapshot.progressPercent}%` }}
          />
        </div>
      </div>

      <span className="shrink-0 text-[12px] tabular-nums text-white/70">
        {isCompactLandscape
          ? `${(progress * snapshot.durationSeconds).toFixed(1)}s`
          : formatClock(progress, snapshot.durationSeconds)}
      </span>

      <button
        type="button"
        onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'playback' })}
        aria-label="Expand playback controls"
        aria-haspopup="dialog"
        className="touch-target flex items-center justify-center rounded-xl border border-app-border bg-white/5 text-[14px] text-app-text hover:bg-white/10"
      >
        ⤢
      </button>
    </div>
  );
}
