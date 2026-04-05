// ============================================================================
// PLAYBAR - Timeline and playback controls
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
    <>
      {/* Speed button */}
      <button
        onClick={handleSpeedClick}
        className="absolute right-2 bottom-[76px] bg-app-surface border border-app-border rounded-lg px-2.5 py-1 text-[10px] font-extrabold text-app-cyan cursor-pointer z-[16] hover:bg-app-cyan/10"
      >
        {speed}×
      </button>

      {/* Playbar */}
      <div className="h-[62px] flex-shrink-0 flex items-center gap-2 px-2.5 bg-app-surface border-t border-app-border">
        {/* Rewind */}
        <button
          onClick={handleRewind}
          className="w-9 h-9 rounded-full border border-app-border bg-white/5 text-app-text text-[15px] flex items-center justify-center cursor-pointer flex-shrink-0 transition-transform active:scale-[0.88] hover:bg-white/10"
        >
          ⏮
        </button>

        {/* Play/Stop */}
        <button
          onClick={handlePlay}
          className={`w-12 h-12 rounded-full border text-white text-[19px] flex items-center justify-center cursor-pointer flex-shrink-0 transition-transform active:scale-[0.88] ${
            isPlaying
              ? 'bg-app-red border-app-red shadow-[0_0_16px_rgba(230,57,70,0.3)]'
              : 'bg-app-cyan border-app-cyan shadow-[0_0_16px_rgba(0,200,240,0.3)]'
          }`}
        >
          {isPlaying ? '■' : '▶'}
        </button>

        {/* Step */}
        <button
          onClick={handleStep}
          className="w-9 h-9 rounded-full border border-app-border bg-white/5 text-app-text text-[15px] flex items-center justify-center cursor-pointer flex-shrink-0 transition-transform active:scale-[0.88] hover:bg-white/10"
        >
          ⏭
        </button>

        {/* Timeline */}
        <div
          onClick={handleTimelineClick}
          className="flex-1 py-2 cursor-pointer"
        >
          <div className="h-1 bg-white/10 rounded-sm relative">
            {/* Fill */}
            <div
              className="h-full bg-gradient-to-r from-app-cyan to-app-cyan-dark rounded-sm"
              style={{ width: `${progress * 100}%` }}
            />

            {/* Markers */}
            {markers.map((marker, i) => (
              <div
                key={i}
                className={`absolute top-1/2 w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none border border-black/40 ${
                  marker.type === 'shot' || marker.type === 'dump'
                    ? 'bg-app-orange'
                    : 'bg-app-gold'
                }`}
                style={{ left: `${marker.position * 100}%` }}
              />
            ))}

            {/* Dot */}
            <div
              className="absolute top-1/2 w-[15px] h-[15px] rounded-full bg-white border-[2.5px] border-app-cyan -translate-x-1/2 -translate-y-1/2 shadow-md"
              style={{ left: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Time */}
        <div className="text-xs text-app-dim min-w-[32px] text-right flex-shrink-0 tabular-nums">
          {formatTime(progress, duration)}
        </div>
      </div>
    </>
  );
}
