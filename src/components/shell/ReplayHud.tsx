// ============================================================================
// DRILL INFORMATION HUD (REPLAY & COACH HUD)
//
// On-ice informational tactical display for coaches in both 2D and 3D.
// Displays drill metadata, tactical objective, coaching cues, puck carrier,
// and step-by-step synchronized play-by-play narration.
// Features a collapsible compact mode for unobstructed drawing.
// ============================================================================

import { useState } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';
import { useResponsive } from '@/ui/useResponsive';
import { jerseyColor } from '@/core/types';
import { replayNarration } from '@/features/coaching/replayNarration';
import { useDrillSteps } from '@/features/coaching/useDrillSteps';

export function ReplayHud() {
  const { state, dispatch } = useAppState();
  const { playback } = useEditorRuntime();
  const { isPhone, isCompactLandscape } = useResponsive();
  // The play's name is already in the top strip; on a phone the folded HUD
  // keeps only the clock and the step, so it covers less of the rink.
  const isCompact = isPhone || isCompactLandscape;
  const snapshot = usePlaybackSnapshot(playback);
  const frame = playback.getFrame();

  // Starts folded on every screen. Open, the panel covers a quarter of the
  // rink - including the players standing under it - before the coach has
  // asked for anything. One tap opens it.
  const [isExpanded, setIsExpanded] = useState(false);

  const carrierId =
    frame.puck?.carrierId ??
    (frame.progress === 0
      ? state.drill.players.find(player => player.hasPuck)?.id
      : undefined);
  const carrier = state.drill.players.find(player => player.id === carrierId);
  const narration = replayNarration(state.drill, frame);
  const { story, current: step, goToStep } = useDrillSteps();
  const stepLabel = step ? `Step ${step.number}/${story.steps.length} · ${step.title}` : narration.title;

  const puckStatus = carrier
    ? `Puck · #${carrier.number} ${carrier.name || carrier.role}`
    : frame.puck?.state === 'in_flight' || frame.puck?.state === 'shot'
      ? 'Puck in flight'
      : frame.puck?.state === 'dead'
        ? 'Play stopped'
        : 'Puck loose / play developing';

  const objective =
    state.drill.settings?.coaching?.objective ||
    'Execute tactical route timing and support the puck carrier.';
  const cues = state.drill.settings?.coaching?.cues
    ? state.drill.settings.coaching.cues
        .split(/[·,\n]/)
        .map(c => c.trim())
        .filter(Boolean)
    : [];

  const currentTime = (
    (snapshot.durationSeconds * snapshot.progressPercent) /
    100
  ).toFixed(1);

  const chevron = (up: boolean) => (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d={up ? 'M2 6.5 5 3.5 8 6.5' : 'M2 3.5 5 6.5 8 3.5'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  if (!isExpanded) {
    // Folded: just what is happening now. The play's name is in the top
    // strip and the clock is on the timeline, so neither is repeated here.
    return (
      <div
        className="pointer-events-none absolute left-2 top-2 z-20 flex max-w-[calc(100vw-110px)] items-center"
        aria-label="Drill replay display"
      >
        <div className={`pointer-events-auto flex items-center rounded-lg border border-white/10 bg-[#08121b]/90 text-white backdrop-blur ${isCompact ? 'gap-1 py-0.5 pl-2 pr-0.5' : 'gap-2 py-0.5 pl-3 pr-0.5'}`}>
          <span
            className={`truncate text-[12px] font-medium text-white/80 ${isCompact ? 'max-w-[150px]' : 'max-w-[280px]'}`}
            aria-live="polite"
          >
            {stepLabel}
          </span>
          <span className="sr-only">{narration.title}. {narration.detail}{step ? ` ${step.detail}` : ''}</span>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="touch-target flex h-7 w-7 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Expand drill details"
            title="Show the drill notes and steps"
          >
            {chevron(false)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute left-2 sm:left-3 top-2 sm:top-3 z-20 w-80 max-w-[calc(100vw-110px)] sm:max-w-md overflow-hidden rounded-lg border border-white/10 bg-[#08121b]/95 text-white shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur"
      aria-label="Drill replay display"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[11px] font-semibold text-white/50">
            {state.playback.isPlaying ? 'Playing' : 'Drill notes'}
          </span>
          <span className="truncate text-[12.5px] font-semibold text-white">
            {state.drill.name || 'Untitled drill'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] tabular-nums text-white/55">{currentTime}s / {snapshot.durationSeconds.toFixed(1)}s</span>
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="pointer-events-auto touch-target flex h-6 w-6 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Collapse drill details"
          >
            {chevron(true)}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-1.5 text-[11.5px]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {(['home', 'away'] as const).map((team, index) => (
            <span key={team} className="contents">
              {index === 1 && <span className="text-[10px] text-white/40">vs</span>}
              <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: jerseyColor(team, state.drill.settings) }} aria-hidden="true" />
                {state.drill.settings?.coaching?.logos?.[team] && (
                  <img
                    src={state.drill.settings.coaching.logos[team]}
                    alt=""
                    className="h-4 w-4 shrink-0 object-contain"
                  />
                )}
                <span className="truncate">
                  {state.drill.settings?.coaching?.teams[team] || (team === 'home' ? 'Home' : 'Away')}
                </span>
              </span>
            </span>
          ))}
        </div>
        <span className="max-w-[140px] shrink-0 truncate text-[11px] text-white/60">{puckStatus}</span>
      </div>

      <div className="border-b border-white/[0.08] px-3 py-1.5">
        <div className="text-[11px] font-semibold text-white/50">Objective</div>
        <p className="mt-0.5 text-[12px] leading-snug text-white/85">{objective}</p>
      </div>

      {cues.length > 0 && (
        <div className="border-b border-white/[0.08] px-3 py-1.5">
          <div className="text-[11px] font-semibold text-white/50">Key cues</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {cues.map((cue, idx) => (
              <span key={idx} className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/80">
                {cue}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 py-2">
        <div className="text-[11px] font-semibold text-white/50">Play-by-play</div>
        {step ? (
          <>
            <p className="mt-0.5 text-[12.5px] font-semibold text-white" aria-live="polite">
              Step {step.number} of {story.steps.length} · {step.title}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/70">{step.detail}</p>
            <p className="mt-0.5 text-[11px] text-white/50">{narration.title}</p>
            <ol className="pointer-events-auto mt-1.5 flex flex-wrap gap-1" aria-label="Drill steps">
              {story.steps.map(item => (
                <li key={item.number}>
                  <button
                    type="button"
                    onClick={() => goToStep(item)}
                    aria-label={`Go to step ${item.number}: ${item.title}`}
                    aria-current={item.number === step.number ? 'step' : undefined}
                    title={item.title}
                    className={`touch-target flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold transition-colors ${
                      item.number === step.number
                        ? 'bg-app-cyan text-[#06131c]'
                        : item.number < step.number
                          ? 'bg-white/[0.12] text-white hover:bg-white/[0.18]'
                          : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.1]'
                    }`}
                  >
                    {item.number}
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <p className="mt-0.5 text-[12.5px] font-semibold text-white">{narration.title}</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/70">{narration.detail}</p>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-white/[0.08] px-2 py-1">
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'coach' })}
          className="pointer-events-auto touch-target rounded-md px-2 py-1 text-[12px] font-medium text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          Teach guide
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'practice' })}
          className="pointer-events-auto touch-target rounded-md px-2 py-1 text-[12px] font-medium text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          Practice plan
        </button>
      </div>
    </div>
  );
}

export const DrillInformationHud = ReplayHud;
