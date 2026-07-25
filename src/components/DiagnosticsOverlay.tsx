// ============================================================================
// DIAGNOSTICS OVERLAY
//
// Reads the frame store directly rather than application state. It updates at
// the coarse display cadence (about once per percent of progress), so having
// it open does not put a React render on every animation frame.
// ============================================================================

import { useAppState } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';

export function DiagnosticsOverlay() {
  const { state } = useAppState();
  const { playback } = useEditorRuntime();
  const snapshot = usePlaybackSnapshot(playback);

  if (!state.ui.showDiagnostics) return null;

  const frame = playback.getFrame();
  const frames = Object.values(frame.playerFrames);
  const moving = frames.filter(item => item.speed > 0.1);
  const puck = frame.puck;
  const puckSpeed = puck?.velocity ? Math.hypot(puck.velocity.x, puck.velocity.y) / 5 : 0;
  const carrier = puck?.carrierId
    ? state.drill.players.find(player => player.id === puck.carrierId)
    : null;

  return (
    <aside
      aria-label="Mechanics telemetry"
      className="pointer-events-none absolute bottom-3 right-3 z-30 w-52 rounded-xl border border-cyan-300/25 bg-[#04111c]/92 p-3 font-mono text-[10px] text-cyan-100 shadow-xl backdrop-blur-md"
    >
      <div className="font-black tracking-[0.14em] text-cyan-300">MECHANICS TELEMETRY</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-white/55">
        <span>state</span>
        <span className="text-right text-white">{snapshot.lifecycle}</span>
        <span>time</span>
        <span className="text-right text-white">
          {((snapshot.progressPercent / 100) * snapshot.durationSeconds).toFixed(2)}s
        </span>
        <span>moving</span>
        <span className="text-right text-white">
          {moving.length}/{state.drill.players.length}
        </span>
        <span>puck</span>
        <span className="text-right text-white">{puck?.state ?? 'none'}</span>
        <span>owner</span>
        <span className="text-right text-white">{carrier ? `#${carrier.number}` : 'none'}</span>
        <span>result</span>
        <span className="text-right text-white">{puck?.result ?? 'live'}</span>
        <span>puck speed</span>
        <span className="text-right text-white">{puckSpeed.toFixed(1)} ft/s</span>
      </div>

      {moving.slice(0, 4).map(item => {
        const player = state.drill.players.find(candidate => candidate.id === item.id);
        return (
          <div key={item.id} className="mt-2 border-t border-white/10 pt-1 text-white/45">
            #{player?.number ?? '?'} {item.action} · {(item.speed / 5).toFixed(1)} ft/s ·{' '}
            {(item.routeProgress * 100).toFixed(0)}%
          </div>
        );
      })}
    </aside>
  );
}
