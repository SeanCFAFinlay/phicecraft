import type { Drill } from '@/core/types';
import type { PlaybackFrame } from '@/playback/playbackFrame';

export function replayNarration(drill: Drill, frame: PlaybackFrame): { title: string; detail: string } {
  const label = (id: string) => {
    const player = drill.players.find(item => item.id === id);
    return player ? `#${player.number}${player.name ? ` ${player.name}` : ''}` : 'Player';
  };
  const execution = frame.eventExecutions?.filter(item => item.status !== 'pending').at(-1);
  const event = execution ? drill.events.find(item => item.id === execution.eventId) : undefined;
  if (!event || !execution) return {
    title: drill.initialPuck && drill.events[0]?.type === 'pickup' ? 'Set for the puck' : 'Ready to rehearse',
    detail: drill.settings?.coaching?.objective || 'Watch the spacing and support around the puck.',
  };
  if (execution.status === 'blocked') return { title: 'Action blocked', detail: execution.reason || 'Review possession and timing in Build.' };
  if (event.type === 'pickup') return {
    title: execution.status === 'completed'
      ? (execution.outcome === 'recovered' ? 'Possession secured' : 'Loose puck to recover')
      : 'Compete for possession',
    detail: `${label(event.fromPlayerId)} · support players create the next passing option.`,
  };
  if (event.type === 'pass') return {
    title: execution.status === 'active' ? 'Pass in flight' : execution.outcome === 'caught' ? 'Receive and support' : 'Loose puck after the pass',
    detail: `${label(event.fromPlayerId)} → ${label(event.toPlayerId)} · ${execution.status === 'active' ? 'Show a target and receive in stride.' : 'Move into space for the return pass.'}`,
  };
  if (event.type === 'shot') return {
    title: execution.status === 'active' ? 'Shot on net' : `Shot outcome: ${execution.outcome || 'review'}`,
    detail: event.result ? `Planned ${event.result} scenario · watch the release and goalie response.` : 'Outcome follows the authored shot and simulation.',
  };
  return { title: 'Dump and retrieve', detail: 'Chase the puck with a teammate supporting the recovery.' };
}
