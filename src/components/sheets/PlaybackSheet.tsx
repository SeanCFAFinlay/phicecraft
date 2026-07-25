// ============================================================================
// EXPANDED PLAYBACK SHEET
//
// The full timeline, speed, step controls, lifecycle and validation. All of it
// is here rather than in a permanent 72px bar, so a landscape phone keeps its
// rink height.
// ============================================================================

import { Sheet } from '../a11y/Sheet';
import { SheetItem, SheetSection } from './QuickSheets';
import { Timeline } from '../Timeline';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';
import { PLAYBACK_SPEEDS } from '@/core/constants';
import { useDrillValidation } from '@/editor/useDrillValidation';
import { isReviewComplete } from '@/commands';

export function PlaybackSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { playback } = useEditorRuntime();
  const snapshot = usePlaybackSnapshot(playback);
  const issues = useDrillValidation();

  const open = state.ui.openSheet === 'playback';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  const blocking = issues.filter(issue => issue.severity === 'error');
  const progress = snapshot.progressPercent / 100;

  return (
    <Sheet open={open} title="Playback" onClose={close}>
      <SheetSection title="Timeline">
        <div className="px-3 pb-2">
          <Timeline
            players={state.drill.players}
            activePlayerIds={[...new Set(state.drill.skatePaths.map(path => path.ownerId))]}
            events={state.drill.events}
            progress={progress}
            disabled={state.playback.isPlaying}
            onSeek={value => playback.seek(value)}
          />
          <div className="mt-2 text-[12px] tabular-nums text-white/60">
            {(progress * snapshot.durationSeconds).toFixed(2)}s of {snapshot.durationSeconds.toFixed(2)}s
          </div>
        </div>
      </SheetSection>

      <SheetSection title="Controls">
        <div className="flex gap-2 px-3 pb-2">
          <button
            type="button"
            onClick={commands.resetPlayback}
            className="touch-target flex-1 rounded-xl border border-app-border bg-white/5 px-3 py-2 text-[13px] font-bold"
          >
            ⏮ Reset
          </button>
          <button
            type="button"
            onClick={() =>
              state.playback.isPlaying ? commands.stopPlayback() : commands.requestPlaybackStart()
            }
            className="touch-target flex-1 rounded-xl border-2 border-cyan-500 bg-cyan-500 px-3 py-2 text-[13px] font-bold text-[#03121c]"
          >
            {state.playback.isPlaying ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button
            type="button"
            onClick={commands.stepPlayback}
            className="touch-target flex-1 rounded-xl border border-app-border bg-white/5 px-3 py-2 text-[13px] font-bold"
          >
            ⏭ Step
          </button>
        </div>
      </SheetSection>

      <SheetSection title="Speed">
        <div className="flex gap-2 px-3 pb-2" role="radiogroup" aria-label="Playback speed">
          {PLAYBACK_SPEEDS.map(speed => (
            <button
              key={speed}
              type="button"
              role="radio"
              aria-checked={state.playback.speed === speed}
              onClick={() => commands.setPlaybackSpeed(speed)}
              className={`touch-target flex-1 rounded-xl border px-3 py-2 text-[13px] font-bold ${
                state.playback.speed === speed
                  ? 'border-app-cyan bg-app-cyan/15 text-app-cyan'
                  : 'border-app-border bg-white/5 text-app-text'
              }`}
            >
              {speed}×
            </button>
          ))}
        </div>
      </SheetSection>

      <SheetSection title="Status">
        <div className="px-3 pb-2 text-[13px] text-white/70">
          <div>
            Lifecycle: <span className="font-bold text-cyan-200">{state.playback.lifecycle}</span>
          </div>
          <div className="mt-1">
            Review:{' '}
            <span className={isReviewComplete(state) ? 'font-bold text-emerald-300' : 'text-white/50'}>
              {isReviewComplete(state) ? 'complete for this version' : 'not complete for this version'}
            </span>
          </div>
        </div>
      </SheetSection>

      {issues.length > 0 && (
        <SheetSection title={blocking.length > 0 ? `${blocking.length} blocking issue(s)` : 'Notes'}>
          {issues.slice(0, 8).map((issue, index) => (
            <SheetItem
              key={`${issue.message}-${index}`}
              icon={issue.severity === 'error' ? '⛔' : '⚠️'}
              label={issue.message}
              tone={issue.severity === 'error' ? 'danger' : 'default'}
              onClick={() => {
                if (issue.playerId) commands.openPlayerInspector(issue.playerId);
                else if (issue.eventId) commands.openEventInspector(issue.eventId);
                close();
              }}
            />
          ))}
        </SheetSection>
      )}
    </Sheet>
  );
}
