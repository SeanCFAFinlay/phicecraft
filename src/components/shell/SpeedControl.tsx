// ============================================================================
// SPEED CONTROL
//
// The playback-speed radiogroup, shared by the expanded Playback sheet (Build)
// and the Preview bar. One radio logic, so the two surfaces cannot drift into
// disagreeing about what "1x" means.
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { PLAYBACK_SPEEDS } from '@/core/constants';

export function SpeedControl() {
  const { state } = useAppState();
  const commands = useCommands();

  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Playback speed">
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
  );
}
