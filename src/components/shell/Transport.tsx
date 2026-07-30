// ============================================================================
// TRANSPORT
//
// The collapsed playback bar: possession, reset, play/pause, time, expand.
// Everything else - the full timeline, speed, step controls, lifecycle,
// diagnostics - lives in the expanded playback sheet, so the rink keeps its
// height on a phone.
//
// Possession (who has the puck, and how many passes so far) sits at the left
// end because it is playback-adjacent information, not an editing control -
// it used to be its own chip floating over the rink, collapsed with the
// workflow chip into `ContextChips`. The lifecycle badge that chip also
// carried on non-phone layouts lives here too, as plain status text. Both are
// dropped from the `inline` variant: that is the compact-landscape row folded
// into the tool dock, which has no width to spare for anything beyond the
// controls that were already there.
//
// It subscribes to the playback store's COARSE snapshot, so it re-renders
// about once per percent of progress rather than 60 times a second.
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';
import { usePuckActions } from '@/hooks/usePuckActions';
import { useResponsive } from '@/ui/useResponsive';
import { ExpandIcon, PauseIcon, PlayIcon, StepBackIcon } from '@/ui/icons';

function formatClock(progress: number, duration: number): string {
  const seconds = progress * duration;
  return `${seconds.toFixed(1)}s / ${duration.toFixed(1)}s`;
}

/**
 * `inline` folds the transport into the tool dock. On a landscape phone a
 * separate 44px row is the difference between a usable rink and a strip, and
 * Play is already in the dock - so the two rows become one.
 *
 * `showExpand` hides the button that opens the full Playback sheet. Preview
 * already surfaces speed and validation inline, so it renders the transport
 * without a second door into the same controls.
 */
export function Transport({
  inline = false,
  showExpand = true,
}: {
  inline?: boolean;
  showExpand?: boolean;
}) {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { playback } = useEditorRuntime();
  const snapshot = usePlaybackSnapshot(playback);
  const { isCompactLandscape, isPhone } = useResponsive();
  const { carrier, passesUsed } = usePuckActions();

  const isPlaying = state.playback.isPlaying;
  const progress = snapshot.progressPercent / 100;

  return (
    <div
      className={
        inline
          ? 'flex min-w-0 flex-[2] items-center gap-1.5'
          : 'app-chrome safe-x flex flex-shrink-0 items-center gap-2 border-t border-app-border bg-[#0c1825] px-2 py-1.5'
      }
      style={inline ? undefined : { minHeight: 'var(--transport-height)' }}
    >
      {/* Compact landscape has no room to spare here: this used to be its
          own chip, and `ContextChips` hid it outright in that layout for the
          same reason - it would eat the progress bar's width. */}
      {!inline && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'possession' })}
          aria-haspopup="dialog"
          className="touch-target flex shrink-0 items-center gap-1 rounded-xl border border-app-border bg-white/5 px-2.5 text-[12px] font-bold hover:bg-white/10"
        >
          <span className="text-white/45">Puck</span>
          <span className={carrier ? 'text-app-gold' : 'text-white/40'}>
            {carrier ? `#${carrier.number}` : 'loose'}
          </span>
          {passesUsed > 0 && (
            <span className="text-white/35">· {passesUsed} pass{passesUsed === 1 ? '' : 'es'}</span>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={commands.resetPlayback}
        aria-label="Reset playback to the start"
        className="touch-target flex items-center justify-center rounded-xl border border-app-border bg-white/5 text-[15px] text-app-text hover:bg-white/10"
      >
        <StepBackIcon size={16} />
      </button>

      {!inline && (
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
          {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
      )}

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

      {/* The lifecycle status used to ride along on the (now-gone) workflow
          chip, shown only where there is room to spare for it. */}
      {!inline && !isPhone && state.playback.lifecycle !== 'ready' && (
        <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-cyan-200">
          {state.playback.lifecycle}
        </span>
      )}

      {showExpand && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'playback' })}
          aria-label="Expand playback controls"
          aria-haspopup="dialog"
          className="touch-target flex items-center justify-center rounded-xl border border-app-border bg-white/5 text-[14px] text-app-text hover:bg-white/10"
        >
          <ExpandIcon size={16} />
        </button>
      )}
    </div>
  );
}
