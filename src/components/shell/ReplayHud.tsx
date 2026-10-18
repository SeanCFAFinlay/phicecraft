import { useAppState } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';
import { jerseyColor } from '@/core/types';
import { replayNarration } from '@/features/coaching/replayNarration';

/** Broadcast-style information; deliberately displays rehearsal state, never invented scores. */
export function ReplayHud() {
  const { state } = useAppState();
  const { playback } = useEditorRuntime();
  const snapshot = usePlaybackSnapshot(playback);
  const frame = playback.getFrame();
  const carrierId = frame.puck?.carrierId ?? (frame.progress === 0 ? state.drill.players.find(player => player.hasPuck)?.id : undefined);
  const carrier = state.drill.players.find(player => player.id === carrierId);
  const narration = replayNarration(state.drill, frame);
  const puckStatus = carrier ? `Puck · #${carrier.number} ${carrier.name || carrier.role}`
    : frame.puck?.state === 'in_flight' || frame.puck?.state === 'shot' ? 'Puck in flight'
    : frame.puck?.state === 'dead' ? 'Play stopped' : 'Puck loose / play developing';
  return <div className="pointer-events-none absolute left-3 top-3 z-20 w-80 max-w-[calc(100%-88px)] overflow-hidden rounded-xl border border-white/20 bg-slate-950/90 text-white shadow-xl" aria-label="Drill replay display">
    <div className="flex items-center justify-between bg-white/5 px-3 py-1.5 text-[10px] font-black tracking-widest text-cyan-200">
      <span>{state.playback.isPlaying ? 'DRILL REPLAY' : 'COACH VIEW'}</span>
      <span>{(snapshot.durationSeconds * snapshot.progressPercent / 100).toFixed(1)}s</span>
    </div>
    <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold">
      {(['home', 'away'] as const).map((team, index) => <span key={team} className="contents">
        {index === 1 && <span className="text-[9px] text-slate-400">VS</span>}
        <span className="min-w-0 flex-1 truncate border-l-4 pl-2" style={{ borderColor: jerseyColor(team, state.drill.settings) }}>{state.drill.settings?.coaching?.teams[team] || (team === 'home' ? 'Home' : 'Away')}</span>
      </span>)}
    </div>
    <div className="truncate border-t border-white/10 px-3 py-1.5 text-[11px] text-slate-300">{puckStatus}</div>
    <div className="border-t border-white/10 px-3 py-2">
      <p className="text-xs font-bold text-cyan-100">{narration.title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{narration.detail}</p>
    </div>
  </div>;
}
