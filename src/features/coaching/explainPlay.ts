import type { Drill } from '@/core/types';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame } from '@/sim/sampleFrame';
import { validateDrillMechanics } from '@/engine/drillValidation';

export function explainPlay(drill: Drill) {
  const compiled = compileDrill(drill);
  const final = sampleFrame(compiled, compiled.durationSeconds);
  const label = (id: string) => {
    const player = compiled.players.get(id);
    return player ? `${player.name || drill.settings?.coaching?.teams[player.team] || player.team} #${player.number}` : 'Missing player';
  };
  const steps = compiled.events.map(event => {
    const source = event.source;
    const execution = final.eventExecutions.find(item => item.eventId === source.id);
    const planned = source.type === 'shot' ? source.result : source.type === 'pass' ? source.catchResult : undefined;
    const action = source.type === 'pass' ? `${label(source.fromPlayerId)} → ${label(source.toPlayerId)}`
      : `${label(source.fromPlayerId)} · ${source.type}`;
    const cue = source.type === 'pass' ? 'Receiver: show your stick and arrive at the target with the puck. Passer: check the lane before release.'
      : source.type === 'shot' ? 'Shooter: get balanced before release. Teammates: prepare for a rebound.'
      : source.type === 'dump' ? 'Send the puck into space, then identify who retrieves it and who supports.'
      : 'Recover possession before starting the next puck action.';
    return {
      id: source.id, action, seconds: event.departureSeconds,
      progress: Math.min(1, event.arrivalSeconds / compiled.durationSeconds),
      outcome: execution?.status === 'blocked' ? 'Blocked' : execution?.outcome ?? execution?.status ?? 'Not executed',
      reason: execution?.reason ?? (execution?.status === 'pending'
        ? 'This action has not executed by the end of the timeline.'
        : planned ? `The coach selected “${planned}” for this action; the simulation follows that scenario when executable.`
          : 'Computed from the authored timing, routes, possession and assistance settings.'),
      cue, planned,
    };
  });
  return { steps, duration: compiled.durationSeconds, issues: validateDrillMechanics(drill) };
}

export function coachingBrief(drill: Drill, report: ReturnType<typeof explainPlay>): string {
  const coaching = drill.settings?.coaching;
  return [drill.name, `${coaching?.teams.home || 'Home'} vs ${coaching?.teams.away || 'Away'}`,
    `Objective: ${coaching?.objective || 'Not set'}`, `Coaching cues: ${coaching?.cues || 'Not set'}`,
    'Simulation is a rehearsal of the authored scenario, not a prediction of match results.',
    ...report.steps.map((step, index) => `${index + 1}. ${step.seconds.toFixed(1)}s — ${step.action}\nOutcome: ${step.outcome}. ${step.reason}\nCue: ${step.cue}`),
    ...report.issues.map(issue => `${issue.severity}: ${issue.message}`),
    'Lineup:', ...drill.players.map(player => `${coaching?.teams[player.team] || player.team} #${player.number} ${player.name || ''} (${player.role})`),
  ].join('\n\n');
}
