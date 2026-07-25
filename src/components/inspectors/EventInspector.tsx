// ============================================================================
// EVENT INSPECTOR
//
// The details of one puck action. Its engine outcome comes from the
// revision-keyed cache, so opening it does not re-simulate the drill and
// leaving it open costs nothing during playback.
//
// The receiver pickers only offer TEAMMATES: an ordinary pass to an opponent
// is rejected by the domain rule, so offering it would be a dead end.
// ============================================================================

import { Sheet } from '../a11y/Sheet';
import { SheetSection } from '../sheets/QuickSheets';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEventOutcomes } from '@/editor/useDrillValidation';
import { getEventArrivalTime, getEventDepartureTime } from '@/engine/playback';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';

const SHOT_RESULTS = ['goal', 'save', 'rebound', 'wide', 'post'] as const;

export function EventInspector() {
  const { state } = useAppState();
  const commands = useCommands();
  const outcomes = useEventOutcomes();
  const { playback } = useEditorRuntime();
  const snapshot = usePlaybackSnapshot(playback);

  const inspector = state.ui.inspector;
  if (inspector.kind !== 'event') return null;

  const index = state.drill.events.findIndex(item => item.id === inspector.eventId);
  const event = state.drill.events[index];
  if (!event) return null;

  const passer = state.drill.players.find(player => player.id === event.fromPlayerId);
  const receiver =
    event.type === 'pass' ? state.drill.players.find(player => player.id === event.toPlayerId) : null;

  const title =
    event.type === 'pass'
      ? `Pass to #${receiver?.number ?? '?'}`
      : event.type === 'shot'
        ? 'Shot on net'
        : event.type === 'pickup'
          ? `Recovery by #${passer?.number ?? '?'}`
          : 'Dump / area pass';

  const duration = snapshot.durationSeconds || 1;
  const departure = getEventDepartureTime(event, index, state.drill.events.length);
  const arrival = getEventArrivalTime(event, index, state.drill.events.length);
  const engineOutcome = outcomes.get(event.id);

  // Only teammates, because a cross-team pass is not a legal ordinary pass.
  const teammates = state.drill.players.filter(
    player => player.id !== event.fromPlayerId && player.team === event.team
  );

  return (
    <Sheet
      open
      title={`Puck action ${index + 1} — ${title}`}
      description={`Released at ${(departure * duration).toFixed(1)}s, arrives at ${(
        arrival * duration
      ).toFixed(1)}s. The drawn line is the exact puck trajectory.`}
      onClose={commands.closeInspector}
    >
      {event.type === 'pass' && (
        <>
          <SheetSection title="Outcome">
            <div className="px-3 pb-2">
              <div className="rounded-xl border border-app-border bg-white/5 px-3 py-2.5 text-[13px]">
                {event.catchResult ? 'Coach override' : 'Engine result'}:{' '}
                <span className="font-bold text-app-text">
                  {event.catchResult ?? engineOutcome ?? 'pending'}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Pass outcome">
                {(
                  [
                    { label: 'Auto', value: undefined },
                    { label: 'Caught', value: 'caught' as const },
                    { label: 'Missed', value: 'missed' as const },
                  ] as const
                ).map(option => (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={event.catchResult === option.value}
                    onClick={() => commands.updatePassResult(event.id, option.value)}
                    className={`touch-target rounded-xl border px-2 py-2 text-[12px] font-bold ${
                      event.catchResult === option.value
                        ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200'
                        : 'border-app-border bg-white/5 text-white/55'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </SheetSection>

          <SheetSection title="Receiver">
            <div className="grid grid-cols-4 gap-1.5 px-3 pb-2">
              {teammates.map(player => (
                <button
                  key={player.id}
                  type="button"
                  aria-pressed={player.id === event.toPlayerId}
                  onClick={() => commands.retargetPass(event.id, player.id)}
                  className={`touch-target rounded-xl border px-1 py-2 text-[12px] font-black ${
                    player.id === event.toPlayerId
                      ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200'
                      : 'border-app-border bg-white/5 text-white/55'
                  }`}
                >
                  #{player.number}
                </button>
              ))}
            </div>
          </SheetSection>
        </>
      )}

      {event.type === 'shot' && (
        <SheetSection title="Result">
          <div className="px-3 pb-2">
            <div className="rounded-xl border border-app-orange/40 bg-app-orange/10 px-3 py-2.5 text-[13px] font-bold text-app-orange">
              {event.result ? 'Coach override' : 'Engine result'}: {event.result ?? engineOutcome ?? 'pending'}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Shot result">
              {([undefined, ...SHOT_RESULTS] as const).map(result => (
                <button
                  key={result ?? 'auto'}
                  type="button"
                  role="radio"
                  aria-checked={event.result === result}
                  onClick={() => commands.updateShotResult(event.id, result)}
                  className={`touch-target rounded-xl border px-2 py-2 text-[12px] font-bold capitalize ${
                    event.result === result
                      ? 'border-app-orange/60 bg-app-orange/15 text-app-orange'
                      : 'border-app-border bg-white/5 text-white/55'
                  }`}
                >
                  {result ?? 'auto'}
                </button>
              ))}
            </div>
          </div>
        </SheetSection>
      )}

      {event.type === 'dump' && (
        <SheetSection title="Assign a receiver">
          <p className="px-3 pb-1 text-[13px] leading-snug text-white/60">
            This action currently ends on open ice. Choose the teammate who should collect it.
          </p>
          <div className="grid grid-cols-4 gap-1.5 px-3 pb-2">
            {teammates.map(player => (
              <button
                key={player.id}
                type="button"
                onClick={() => commands.convertDumpToPass(event.id, player.id)}
                className="touch-target rounded-xl border border-app-gold/40 bg-app-gold/10 px-1 py-2 text-[12px] font-black text-app-gold"
              >
                #{player.number}
              </button>
            ))}
          </div>
        </SheetSection>
      )}

      <div className="px-3 py-3">
        <button
          type="button"
          onClick={() => commands.removeEvent(event.id)}
          className="touch-target w-full rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-3 text-[13px] font-bold text-red-200"
        >
          Remove this puck action
        </button>
      </div>
    </Sheet>
  );
}
