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

export function ReplayHud() {
  const { state, dispatch } = useAppState();
  const { playback } = useEditorRuntime();
  const { isPhone } = useResponsive();
  const snapshot = usePlaybackSnapshot(playback);
  const frame = playback.getFrame();

  // On phones default to compact so the ice isn't crowded; on desktop default to expanded
  const [isExpanded, setIsExpanded] = useState(!isPhone);

  const carrierId =
    frame.puck?.carrierId ??
    (frame.progress === 0
      ? state.drill.players.find(player => player.hasPuck)?.id
      : undefined);
  const carrier = state.drill.players.find(player => player.id === carrierId);
  const narration = replayNarration(state.drill, frame);

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

  if (!isExpanded) {
    return (
      <div
        className="pointer-events-none absolute left-2 top-2 z-20 flex max-w-[calc(100vw-110px)] items-center gap-1.5"
        aria-label="Drill information summary"
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/20 bg-slate-950/90 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-md">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="max-w-[140px] sm:max-w-[200px] truncate font-bold text-cyan-100">
            {state.drill.name || 'Tactical Drill'}
          </span>
          <span className="text-[10px] font-mono text-cyan-300/80">{currentTime}s</span>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="touch-target ml-1 flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 text-[10px] text-cyan-200 transition hover:bg-white/20"
            aria-label="Expand drill details"
          >
            ▼
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute left-2 sm:left-3 top-2 sm:top-3 z-20 w-80 max-w-[calc(100vw-110px)] sm:max-w-md overflow-hidden rounded-xl border border-white/20 bg-slate-950/92 text-white shadow-2xl backdrop-blur-md"
      aria-label="Drill information display"
    >
      {/* Top Banner */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black tracking-widest text-cyan-200">
        <div className="flex items-center gap-2 truncate">
          <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] text-cyan-300">
            {state.playback.isPlaying ? 'DRILL REPLAY' : 'TACTICAL HUD'}
          </span>
          <span className="font-bold text-white truncate max-w-[150px] sm:max-w-[220px]">
            {state.drill.name || 'Tactical Drill'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-cyan-200">{currentTime}s / {snapshot.durationSeconds.toFixed(1)}s</span>
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="pointer-events-auto touch-target flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[9px] text-cyan-200 transition hover:bg-white/20"
            aria-label="Collapse drill details"
          >
            ▲
          </button>
        </div>
      </div>

      {/* Teams & Puck Carrier */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-bold border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {(['home', 'away'] as const).map((team, index) => (
            <span key={team} className="contents">
              {index === 1 && <span className="text-[9px] text-slate-500">VS</span>}
              <span
                className="min-w-0 truncate border-l-4 pl-1.5 text-[11px]"
                style={{ borderColor: jerseyColor(team, state.drill.settings) }}
              >
                {state.drill.settings?.coaching?.teams[team] || (team === 'home' ? 'Home' : 'Away')}
              </span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 rounded bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 text-[10px] text-cyan-200">
          <span>🏒</span>
          <span className="truncate max-w-[120px]">{puckStatus}</span>
        </div>
      </div>

      {/* Tactical Objective */}
      <div className="px-3 py-1.5 border-b border-white/10 bg-slate-900/40">
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90 flex items-center gap-1">
          <span>🎯</span> Objective
        </div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-slate-200">{objective}</p>
      </div>

      {/* Coaching Cues */}
      {cues.length > 0 && (
        <div className="px-3 py-1.5 border-b border-white/10">
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/90 flex items-center gap-1">
            <span>💡</span> Key Cues
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {cues.map((cue, idx) => (
              <span
                key={idx}
                className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-slate-200"
              >
                {cue}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Play-by-Play Live Narration Ticker */}
      <div className="px-3 py-2 bg-cyan-950/20">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
          <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>Live Play-by-Play</span>
        </div>
        <p className="mt-0.5 text-xs font-bold text-cyan-100">{narration.title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">{narration.detail}</p>
      </div>

      {/* Quick Actions Footer */}
      <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'coach' })}
          className="pointer-events-auto touch-target flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/20 transition"
        >
          <span>📋</span> Teach Guide
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'practice' })}
          className="pointer-events-auto touch-target flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/20 transition"
        >
          <span>📅</span> Practice Plan
        </button>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="pointer-events-auto touch-target text-[10px] text-slate-400 hover:text-white transition px-1.5 py-0.5"
        >
          Fold ▲
        </button>
      </div>
    </div>
  );
}

export const DrillInformationHud = ReplayHud;
