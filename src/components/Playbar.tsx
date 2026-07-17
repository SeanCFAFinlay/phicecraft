// ============================================================================
// PLAYBAR - Timeline and playback controls (fixed row)
// ============================================================================

import { useAppState } from '@/hooks/useAppState';
import { formatTime } from '@/engine/playback';
import { Timeline } from './Timeline';
import { validateDrillMechanics } from '@/engine/drillValidation';

export function Playbar() {
  const { state, actions } = useAppState();
  const { isPlaying, progress, speed, duration } = state.playback;

  const handlePlay = () => {
    if (isPlaying) {
      actions.stopPlayback();
      return;
    }

    if (state.drill.skatePaths.length === 0 && state.drill.events.length === 0) {
      actions.showToast('Add skate paths and passes first!', 'warning');
      return;
    }

    const blocking = validateDrillMechanics(state.drill).filter(issue => issue.severity === 'error');
    if (blocking.length > 0) {
      actions.showToast(blocking[0].message, 'error', 4200);
      return;
    }

    actions.startPlayback();
    actions.setPlayBanner(`▶  ${state.drill.name}  —  tap ■ to stop`);
  };

  const handleRewind = () => {
    actions.stopPlayback();
    actions.resetPlayback();
  };

  const handleStep = () => {
    if (isPlaying) {
      actions.stopPlayback();
      return;
    }
    actions.setPlaybackProgress(Math.min(progress + 0.1, 1));
  };

  const handleSpeedClick = () => {
    const nextSpeed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1;
    actions.setPlaybackSpeed(nextSpeed);
    actions.showToast(`Speed: ${nextSpeed}×`, 'info', 1400);
  };

  return (
    <div className="flex-shrink-0 h-[72px] flex items-center gap-3 px-3 bg-[#0c1825] border-t border-[#1a3045]">
      {/* Rewind */}
      <button
        onClick={handleRewind}
        aria-label="Reset playback"
        title="Reset playback"
        className="w-10 h-10 rounded-full border border-[#1a3045] bg-white/5 text-white text-base flex items-center justify-center cursor-pointer flex-shrink-0 transition-all active:scale-90 hover:bg-white/10"
      >
        ⏮
      </button>

      {/* Play/Stop */}
      <button
        onClick={handlePlay}
        aria-label={isPlaying ? 'Stop playback' : 'Start playback'}
        className={`w-12 h-12 rounded-full border-2 text-white text-xl flex items-center justify-center cursor-pointer flex-shrink-0 transition-all active:scale-90 ${
          isPlaying
            ? 'bg-red-500 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
            : 'bg-cyan-500 border-cyan-500 shadow-[0_0_20px_rgba(0,200,240,0.4)]'
        }`}
      >
        {isPlaying ? '■' : '▶'}
      </button>

      {/* Step */}
      <button
        onClick={handleStep}
        aria-label="Step playback forward"
        className="w-10 h-10 rounded-full border border-[#1a3045] bg-white/5 text-white text-base flex items-center justify-center cursor-pointer flex-shrink-0 transition-all active:scale-90 hover:bg-white/10"
      >
        ⏭
      </button>

      <Timeline
        players={state.drill.players}
        activePlayerIds={[...new Set(state.drill.skatePaths.map(path => path.ownerId))]}
        events={state.drill.events}
        progress={progress}
        disabled={isPlaying}
        onSeek={actions.setPlaybackProgress}
      />

      {/* Time display */}
      <div className="text-xs text-gray-400 min-w-[36px] text-right flex-shrink-0 tabular-nums">
        <div>{formatTime(progress, duration)}</div>
        <div className={`mt-0.5 text-[7px] font-black uppercase tracking-wide ${state.playback.lifecycle === 'success' ? 'text-green-300' : state.playback.lifecycle === 'failure' ? 'text-red-300' : 'text-cyan-300'}`}>
          {state.playback.lifecycle}
        </div>
      </div>

      {/* Speed button */}
      <button
        onClick={handleSpeedClick}
        aria-label="Change playback speed"
        className="px-3 py-1.5 bg-white/5 border border-[#1a3045] rounded-lg text-xs font-bold text-cyan-400 cursor-pointer flex-shrink-0 hover:bg-white/10 active:scale-95"
      >
        {speed}×
      </button>

      <button
        onClick={actions.toggleDiagnostics}
        aria-label="Toggle mechanics diagnostics"
        title="Mechanics diagnostics"
        className={`h-8 w-8 rounded-lg border text-[11px] font-black ${state.ui.showDiagnostics ? 'border-cyan-300/60 bg-cyan-300/15 text-cyan-200' : 'border-[#1a3045] bg-white/5 text-white/35'}`}
      >
        HUD
      </button>
    </div>
  );
}
