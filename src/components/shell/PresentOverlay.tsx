// ============================================================================
// PRESENT OVERLAY - RINKSIDE MODE
//
// Present is what a coach holds up to the bench on a tablet, gloves on. So:
//
//   - A big step caption ("STEP 2 OF 4 - #17 passes to #4") that follows the
//     playback, readable from a few metres away. It can be hidden.
//   - Previous / next step, and swiping left or right anywhere on the ice.
//   - Loop this step: replays one moment over and over while you talk.
//   - Slow motion down to a quarter speed.
//   - Glove-sized buttons (56 px), and a control bar that fades away after a
//     few seconds so the ice is all anyone sees; any touch brings it back.
//
// Keys: Space play/pause, Left/Right step, L loop, C captions, Escape exits
// (Escape lives in useKeyboardShortcuts).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';
import { useDrillSteps } from '@/features/coaching/useDrillSteps';
import { PauseIcon, PlayIcon } from '@/ui/icons';
import { actionBounds, actionFrame } from '@/camera/actionZone';

const HIDE_DELAY_MS = 4000;
const SWIPE_PX = 60;
const PRESENT_SPEEDS = [0.25, 0.5, 1];
/** Screen height kept clear at the top for the step caption. */
const CAPTION_ROOM_PX = 150;

const button =
  'flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl border border-app-border bg-white/5 px-3 text-[15px] font-bold text-app-text hover:bg-white/10 disabled:opacity-40';
const toggled = 'border-app-cyan bg-app-cyan/20 text-app-cyan';

export function PresentOverlay() {
  const { state } = useAppState();
  const commands = useCommands();
  const { camera, playback } = useEditorRuntime();
  const snapshot = usePlaybackSnapshot(playback);
  const { story, current, timeSeconds, goToStep } = useDrillSteps();

  const isPlaying = state.playback.isPlaying;
  const progress = snapshot.progressPercent / 100;
  const steps = story.steps;

  const [visible, setVisible] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [loopStep, setLoopStep] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  }, []);

  const wake = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // Frame the play on the way in - on an upright tablet or phone, looking up
  // the ice toward the net being attacked so the play fills the screen - and
  // give the coach's own view back on the way out.
  useEffect(() => {
    const saved = camera.camera;
    const { viewport } = camera.getSnapshot();
    const flat = (saved.tilt ?? 0) === 0;
    if (flat && viewport.height > viewport.width * 1.15) {
      const rotation = actionFrame(state.drill).attackedNet === 'right' ? -Math.PI / 2 : Math.PI / 2;
      camera.setCamera({ ...saved, rotation });
    }
    camera.frameRegion(actionBounds(state.drill));
    // Leave the top of the screen for the step caption: shrink about the
    // bottom edge so the play slides down out from under it.
    const after = camera.getSnapshot().viewport;
    camera.zoomAt(Math.max(0.7, (after.height - CAPTION_ROOM_PX) / after.height), { x: after.width / 2, y: after.height });
    return () => camera.setCamera(saved);
    // Once per visit to Present: re-framing mid-presentation would fight the coach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [scheduleHide]);

  const togglePlay = useCallback(() => {
    if (isPlaying) commands.stopPlayback();
    else {
      // Replaying a looped step from the end of the drill starts at that step.
      const looped = steps.find(step => step.number === loopStep);
      if (looped && progress >= 0.99) goToStep(looped);
      commands.requestPlaybackStart();
    }
  }, [commands, goToStep, isPlaying, loopStep, progress, steps]);

  const stepBy = useCallback(
    (delta: number) => {
      if (steps.length === 0) return;
      const index = current ? steps.indexOf(current) : -1;
      const next = steps[Math.max(0, Math.min(steps.length - 1, index + delta))];
      if (!next) return;
      goToStep(next);
      if (loopStep !== null) setLoopStep(next.number);
    },
    [current, goToStep, loopStep, steps]
  );

  const toggleLoop = useCallback(() => {
    setLoopStep(value => (value === null ? current?.number ?? null : null));
  }, [current]);

  // Loop: when the looped step runs out, jump back to its start.
  const looped = steps.find(step => step.number === loopStep) ?? null;
  useEffect(() => {
    if (!looped || !isPlaying) return;
    const isLast = looped === steps.at(-1);
    const end = isLast ? story.durationSeconds * 0.97 : looped.endSeconds - 0.05;
    if (timeSeconds >= end || timeSeconds < looped.startSeconds - 0.3) goToStep(looped);
  }, [goToStep, isPlaying, looped, steps, story.durationSeconds, timeSeconds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'ArrowRight') stepBy(1);
      else if (event.key === 'ArrowLeft') stepBy(-1);
      else if (event.key.toLowerCase() === 'l') toggleLoop();
      else if (event.key.toLowerCase() === 'c') setCaptions(value => !value);
      else if (event.key === ' ' && target?.tagName !== 'BUTTON') togglePlay();
      else return;
      event.preventDefault();
      wake();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepBy, toggleLoop, togglePlay, wake]);

  return (
    <div
      className="absolute inset-0 z-30"
      onPointerMove={wake}
      onPointerDown={event => {
        wake();
        swipeStart.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={event => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) stepBy(dx < 0 ? 1 : -1);
      }}
      onFocus={wake}
    >
      {captions && current && (
        <div
          className="safe-x pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3"
          aria-live="polite"
        >
          <div className="max-w-3xl rounded-2xl border border-white/15 bg-slate-950/85 px-5 py-3 text-center text-white shadow-2xl backdrop-blur">
            <p className="text-[13px] font-black uppercase tracking-[0.2em] text-cyan-300">
              Step {current.number} of {steps.length}
              {loopStep === current.number && ' · looping'}
            </p>
            <p className="mt-0.5 text-[22px] font-black leading-tight sm:text-[28px]">{current.title}</p>
            <p className="mt-1 text-[15px] leading-snug text-slate-200 sm:text-[18px]">{current.detail}</p>
          </div>
        </div>
      )}

      <div
        className={`app-chrome safe-bottom safe-x absolute inset-x-0 bottom-0 flex flex-col gap-2 border-t border-app-border bg-[#0c1825]/95 px-3 py-2 transition-opacity duration-300 ${
          visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onPointerMove={event => event.stopPropagation()}
        onPointerDown={event => {
          event.stopPropagation();
          wake();
        }}
        onPointerUp={event => event.stopPropagation()}
      >
        {steps.length > 1 && (
          <ol className="flex gap-1.5 overflow-x-auto" aria-label="Drill steps">
            {steps.map(step => (
              <li key={step.number} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    goToStep(step);
                    if (loopStep !== null) setLoopStep(step.number);
                  }}
                  aria-label={`Go to step ${step.number}: ${step.title}`}
                  aria-current={current?.number === step.number ? 'step' : undefined}
                  className={`flex h-11 min-w-[44px] items-center justify-center rounded-xl px-3 text-[15px] font-black ${
                    current?.number === step.number
                      ? 'bg-app-cyan text-[#03121c]'
                      : 'bg-white/10 text-app-text hover:bg-white/20'
                  }`}
                >
                  {step.number}
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => commands.setMode('build')} aria-label="Exit presentation" className={button}>
            Exit
          </button>

          <button
            type="button"
            onClick={() => stepBy(-1)}
            disabled={steps.length === 0}
            aria-label="Previous step"
            className={button}
          >
            ◀
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
            className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${
              isPlaying ? 'border-red-500 bg-red-500 text-white' : 'border-cyan-500 bg-cyan-500 text-[#03121c]'
            }`}
          >
            {isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
          </button>
          <button
            type="button"
            onClick={() => stepBy(1)}
            disabled={steps.length === 0}
            aria-label="Next step"
            className={button}
          >
            ▶
          </button>

          <button
            type="button"
            onClick={toggleLoop}
            disabled={steps.length === 0}
            aria-pressed={loopStep !== null}
            aria-label="Loop this step"
            className={`${button} ${loopStep !== null ? toggled : ''}`}
          >
            ⟲ Loop
          </button>

          <input
            type="range"
            aria-label="Playback position"
            min="0"
            max="1000"
            value={Math.round(progress * 1000)}
            onChange={event => commands.setPlaybackProgress(Number(event.currentTarget.value) / 1000)}
            className="h-3 min-w-[120px] flex-1 cursor-pointer accent-cyan-500"
          />

          <div className="flex gap-1" role="radiogroup" aria-label="Playback speed">
            {PRESENT_SPEEDS.map(speed => (
              <button
                key={speed}
                type="button"
                role="radio"
                aria-checked={state.playback.speed === speed}
                onClick={() => commands.setPlaybackSpeed(speed)}
                className={`${button} ${state.playback.speed === speed ? toggled : ''}`}
              >
                {speed === 0.25 ? '¼' : speed === 0.5 ? '½' : '1'}×
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setCaptions(value => !value)}
            aria-pressed={captions}
            aria-label="Step captions"
            className={`${button} ${captions ? toggled : ''}`}
          >
            CC
          </button>

          <div className="flex gap-1">
            <button type="button" onClick={() => camera.fit()} aria-label="Full ice" className={button}>
              Full
            </button>
            <button type="button" onClick={() => camera.zoomToZone('defensive')} aria-label="Defensive zone" className={button}>
              D Zone
            </button>
            <button type="button" onClick={() => camera.zoomToZone('offensive')} aria-label="Offensive zone" className={button}>
              O Zone
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
