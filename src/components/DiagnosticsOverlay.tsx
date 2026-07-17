import { useAppState } from '@/hooks/useAppState';

export function DiagnosticsOverlay() {
  const { state } = useAppState();
  if (!state.ui.showDiagnostics) return null;

  const frames = Object.values(state.playbackPlayerFrames);
  const moving = frames.filter(frame => frame.speed > 0.1);
  const puckSpeed = state.animatedPuck?.velocity
    ? Math.hypot(state.animatedPuck.velocity.x, state.animatedPuck.velocity.y) / 5
    : 0;
  const puckCarrier = state.animatedPuck?.carrierId
    ? state.drill.players.find(player => player.id === state.animatedPuck?.carrierId)
    : null;

  return (
    <aside className="pointer-events-none absolute left-3 top-3 z-30 w-52 rounded-xl border border-cyan-300/25 bg-[#04111c]/90 p-3 font-mono text-[9px] text-cyan-100 shadow-xl backdrop-blur-md">
      <div className="font-black tracking-[0.14em] text-cyan-300">MECHANICS TELEMETRY</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-white/55">
        <span>state</span><span className="text-right text-white">{state.playback.lifecycle}</span>
        <span>time</span><span className="text-right text-white">{(state.playback.progress * state.playback.duration).toFixed(2)}s</span>
        <span>moving</span><span className="text-right text-white">{moving.length}/{state.drill.players.length}</span>
        <span>puck</span><span className="text-right text-white">{state.animatedPuck?.state ?? 'none'}</span>
        <span>owner</span><span className="text-right text-white">{puckCarrier ? `#${puckCarrier.number}` : 'none'}</span>
        <span>result</span><span className="text-right text-white">{state.animatedPuck?.result ?? 'live'}</span>
        <span>puck speed</span><span className="text-right text-white">{puckSpeed.toFixed(1)} ft/s</span>
      </div>
      {moving.slice(0, 4).map(frame => {
        const player = state.drill.players.find(item => item.id === frame.id);
        return (
          <div key={frame.id} className="mt-2 border-t border-white/10 pt-1 text-white/45">
            #{player?.number ?? '?'} {frame.action} · {(frame.speed / 5).toFixed(1)} ft/s · {(frame.routeProgress * 100).toFixed(0)}%
          </div>
        );
      })}
    </aside>
  );
}
