import { useAppState } from '@/hooks/useAppState';
import { getEventArrivalTime, getEventDepartureTime } from '@/engine/playback';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame } from '@/sim/sampleFrame';

export function EventInfoPanel() {
  const { state, actions } = useAppState();
  const eventId = state.selection.selectedEventId;
  if (!eventId) return null;

  const index = state.drill.events.findIndex(event => event.id === eventId);
  const event = state.drill.events[index];
  if (!event) return null;

  const passer = state.drill.players.find(player => player.id === event.fromPlayerId);
  const receiver = event.type === 'pass'
    ? state.drill.players.find(player => player.id === event.toPlayerId)
    : null;
  const label = event.type === 'pass'
    ? `Pass to #${receiver?.number ?? '?'}`
    : event.type === 'shot' ? 'Shot on net'
      : event.type === 'pickup' ? `Puck recovery by #${passer?.number ?? '?'}`
        : 'Dump / area pass';
  const departure = getEventDepartureTime(event, index, state.drill.events.length);
  const arrival = getEventArrivalTime(event, index, state.drill.events.length);
  const compiled = compileDrill(state.drill);
  const execution = sampleFrame(compiled, compiled.durationSeconds).eventExecutions[index];
  const passOutcome = event.type === 'pass'
    ? event.catchResult ?? (execution?.outcome === 'missed' ? 'missed' : execution?.outcome === 'caught' ? 'caught' : undefined)
    : undefined;
  const shotOutcomes = ['goal', 'save', 'rebound', 'wide', 'post'] as const;
  const computedShotOutcome = event.type === 'shot' && shotOutcomes.some(result => result === execution?.outcome)
    ? execution.outcome as typeof shotOutcomes[number]
    : undefined;

  return (
    <aside className="fixed top-24 right-3 z-50 w-[230px] rounded-2xl border border-app-gold/25 bg-[#081522]/95 p-4 shadow-2xl backdrop-blur-md">
      <button
        onClick={() => actions.selectEvent(null)}
        aria-label="Close puck event details"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs text-white/50"
      >
        ✕
      </button>
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-app-dim">Puck event {index + 1}</div>
      <div className="mt-1 text-base font-black text-white">{label}</div>
      <div className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-white/60">
        Source: #{passer?.number ?? '?'}<br />
        Release: {(departure * state.playback.duration).toFixed(1)}s<br />
        Arrival: {(arrival * state.playback.duration).toFixed(1)}s<br />
        The displayed line is the exact puck trajectory.
      </div>
      {event.type === 'pass' && (
        <>
          <div className={`mt-2 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${
            passOutcome === 'missed'
              ? 'border-red-400/30 bg-red-500/10 text-red-300'
              : 'border-green-400/30 bg-green-400/10 text-green-300'
          }`}>
            {event.catchResult ? 'Coach override' : 'Engine outcome'}: {passOutcome ?? 'pending'}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {([
              { label: 'Auto', value: undefined },
              { label: 'Caught', value: 'caught' as const },
              { label: 'Miss', value: 'missed' as const },
            ]).map(option => (
              <button
                key={option.label}
                onClick={() => actions.updatePassResult(event.id, option.value)}
                className={`rounded-lg border px-2 py-2 text-[9px] font-bold ${event.catchResult === option.value ? 'border-green-400/50 bg-green-400/15 text-green-300' : 'border-white/10 text-white/40'}`}
              >{option.label}</button>
            ))}
          </div>
          <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <div className="text-[8px] font-black uppercase tracking-wide text-white/35">Receiver</div>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {state.drill.players
                .filter(player => player.id !== event.fromPlayerId && player.team === event.team)
                .map(player => (
                  <button
                    key={player.id}
                    onClick={() => actions.retargetPass(event.id, player.id)}
                    className={`rounded-md border px-1 py-1.5 text-[8px] font-black ${
                      player.id === event.toPlayerId
                        ? 'border-green-400/55 bg-green-400/15 text-green-300'
                        : 'border-white/10 text-white/40'
                    }`}
                  >
                    #{player.number}
                  </button>
                ))}
            </div>
          </div>
        </>
      )}
      {event.type === 'shot' && (
        <>
          <div className="mt-2 rounded-lg border border-app-orange/30 bg-app-orange/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-app-orange">
            {event.result ? 'Coach override' : 'Engine outcome'}: {event.result ?? computedShotOutcome ?? 'pending'}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {([undefined, ...shotOutcomes] as const).map(result => (
              <button
                key={result ?? 'auto'}
                onClick={() => actions.updateShotResult(event.id, result)}
                className={`rounded-lg border px-2 py-2 text-[9px] font-bold uppercase ${event.result === result ? 'border-app-orange/50 bg-app-orange/15 text-app-orange' : 'border-white/10 text-white/40'}`}
              >{result ?? 'auto'}</button>
            ))}
          </div>
        </>
      )}
      {event.type === 'dump' && (
        <div className="mt-2 rounded-xl border border-app-gold/25 bg-app-gold/5 p-2.5">
          <div className="text-[9px] font-black uppercase tracking-wide text-app-gold">
            Assign a receiver
          </div>
          <div className="mt-1 text-[10px] leading-relaxed text-white/50">
            This action currently ends on open ice. Choose the skater who should collect it.
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {state.drill.players
              .filter(player => player.id !== event.fromPlayerId && player.team === event.team)
              .map(player => (
                <button
                  key={player.id}
                  onClick={() => actions.convertDumpToPass(event.id, player.id)}
                  className={`rounded-lg border px-1 py-2 text-[9px] font-black ${
                    player.team === 'home'
                      ? 'border-home/35 bg-home/10 text-[#ff8b98]'
                      : 'border-away/35 bg-away/10 text-[#79bfff]'
                  }`}
                >
                  #{player.number}
                </button>
              ))}
          </div>
        </div>
      )}
      <button
        onClick={() => {
          actions.removeEvent(event.id);
          actions.selectEvent(null);
          actions.showToast(`Removed ${event.type} ${index + 1}`, 'success');
        }}
        className="mt-3 w-full rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-300"
      >
        Remove Event
      </button>
    </aside>
  );
}
