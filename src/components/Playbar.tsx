// ============================================================================
// PLAYBAR - Timeline and playback controls (fixed row)
// ============================================================================

import React from 'react';
import { useAppState } from '@/hooks/useAppState';
import { formatTime, getTimelineMarkers } from '@/engine/playback';

export function Playbar() {
  const { state, actions } = useAppState();
  const { isPlaying, progress, speed, duration } = state.playback;
  const markers = getTimelineMarkers(state.drill.events);

  const handlePlay = () => {
    if (isPlaying) {
      actions.stopPlayback();
    } else {
      if (state.drill.skatePaths.length === 0 && state.drill.events.length === 0) {
        actions.showToast('Add skate paths and passes first!', 'warning');
        return;
      }
      actions.startPlayback();
      actions.setPlayBanner(`▶  ${state.drill.name}  —  tap ■ to stop`);
    }
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
    const newProgress = Math.min(progress + 0.1, 1);
    actions.setPlaybackProgress(newProgress);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPlaying) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickProgress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    actions.setPlaybackProgress(clickProgress);
  };

  const handleSpeedClick = () => {
    const nextSpeed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1;
    actions.setPlaybackSpeed(nextSpeed);
    actions.showToast(`Speed: ${nextSpeed}×`, 'info', 1400);
  };

  return (
    <div className="flex-shrink-0 h-[60px] flex items-center gap-3 px-3 bg-[#0c1825] border-t border-[#1a3045]">
      {/* Rewind */}
      <button
        onClick={handleRewind}
        className="w-10 h-10 rounded-full border border-[#1a3045] bg-white/5 text-white text-base flex items-center justify-center cursor-pointer flex-shrink-0 transition-all active:scale-90 hover:bg-white/10"
      >
        ⏮
      </button>

      {/* Play/Stop */}
      <button
        onClick={handlePlay}
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
        className="w-10 h-10 rounded-full border border-[#1a3045] bg-white/5 text-white text-base flex items-center justify-center cursor-pointer flex-shrink-0 transition-all active:scale-90 hover:bg-white/10"
      >
        ⏭
      </button>

      {/* Timeline */}
      <div
        onClick={handleTimelineClick}
        className="flex-1 py-3 cursor-pointer min-w-0"
      >
        <div className="h-2 bg-white/10 rounded-full relative">
          {/* Fill */}
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 rounded-full transition-all"
            style={{ width: `${progress * 100}%` }}
          />

          {/* Markers */}
          {markers.map((marker, i) => (
            <div
              key={i}
              className={`absolute top-1/2 w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none border border-black/50 ${
                marker.type === 'shot' || marker.type === 'dump'
                  ? 'bg-orange-500'
                  : 'bg-yellow-400'
              }`}
              style={{ left: `${marker.position * 100}%` }}
            />
          ))}

          {/* Playhead */}
          <div
            className="absolute top-1/2 w-4 h-4 rounded-full bg-white border-2 border-cyan-400 -translate-x-1/2 -translate-y-1/2 shadow-lg"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Time display */}
      <div className="text-xs text-gray-400 min-w-[36px] text-right flex-shrink-0 tabular-nums">
        {formatTime(progress, duration)}
      </div>

      {/* Speed button */}
      <button
        onClick={handleSpeedClick}
        className="px-3 py-1.5 bg-white/5 border border-[#1a3045] rounded-lg text-xs font-bold text-cyan-400 cursor-pointer flex-shrink-0 hover:bg-white/10 active:scale-95"
      >
        {speed}×
      </button>
    </div>
  );
}
