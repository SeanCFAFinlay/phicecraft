// ============================================================================
// PRESENT OVERLAY
//
// Present mode's only chrome: a single control bar floating over the
// full-bleed rink. It auto-hides after a few seconds of no pointer activity -
// a coach walking a bench through a play wants ice, not buttons - and any
// pointer movement (or a tap on the bar itself) brings it straight back. The
// timer is a plain ref; visibility is local component state, not application
// state, so nothing here touches the undo stack or gets persisted.
//
// Present has no menu of its own: the only way out is this bar's Exit button
// or Escape (see useKeyboardShortcuts), because ModeSwitch lives in TopStrip,
// which Present hides along with the rest of the editing chrome.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';
import { SpeedControl } from './SpeedControl';
import { PauseIcon, PlayIcon } from '@/ui/icons';

const HIDE_DELAY_MS = 3000;

const button =
  'touch-target flex items-center justify-center rounded-xl border border-app-border bg-white/5 px-3 text-[13px] font-bold text-app-text hover:bg-white/10';

export function PresentOverlay() {
  const { state } = useAppState();
  const commands = useCommands();
  const { camera, playback } = useEditorRuntime();
  const snapshot = usePlaybackSnapshot(playback);

  const isPlaying = state.playback.isPlaying;
  const progress = snapshot.progressPercent / 100;

  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  }, []);

  const wake = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [scheduleHide]);

  return (
    <div
      className="absolute inset-0 z-30"
      onPointerMove={wake}
      onPointerDown={wake}
      onFocus={wake}
    >
      <div
        className={`app-chrome safe-bottom safe-x pointer-events-auto absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 border-t border-app-border bg-[#0c1825]/95 px-2 py-1.5 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onPointerMove={event => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => commands.setMode('build')}
          aria-label="Exit presentation"
          className={button}
        >
          Exit
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
          {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>

        <input
          type="range"
          aria-label="Playback position"
          min="0"
          max="1000"
          value={Math.round(progress * 1000)}
          onChange={event =>
            commands.setPlaybackProgress(Number(event.currentTarget.value) / 1000)
          }
          className="h-2 min-w-[80px] flex-1 cursor-pointer accent-cyan-500"
        />

        <div className="w-40 flex-shrink-0">
          <SpeedControl />
        </div>

        <div className="flex flex-shrink-0 gap-1">
          <button type="button" onClick={() => camera.fit()} aria-label="Full ice" className={button}>
            Full
          </button>
          <button
            type="button"
            onClick={() => camera.zoomToZone('defensive')}
            aria-label="Defensive zone"
            className={button}
          >
            D Zone
          </button>
          <button
            type="button"
            onClick={() => camera.zoomToZone('offensive')}
            aria-label="Offensive zone"
            className={button}
          >
            O Zone
          </button>
        </div>
      </div>
    </div>
  );
}
