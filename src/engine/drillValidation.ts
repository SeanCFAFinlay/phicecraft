import type { Drill, ID } from '@/core/types';
import { compileDrill } from '@/sim/compileDrill';

export interface MechanicsIssue {
  severity: 'error' | 'warning';
  message: string;
  playerId?: ID;
  eventId?: ID;
}

export function validateDrillMechanics(drill: Drill): MechanicsIssue[] {
  const issues: MechanicsIssue[] = [];
  const carriers = drill.players.filter(player => player.hasPuck);
  if (carriers.length !== 1) {
    issues.push({ severity: 'error', message: 'Choose exactly one initial puck carrier.' });
  }
  const compiled = compileDrill(drill);
  for (const [playerId, route] of compiled.routes) {
    for (const warning of route.warnings) issues.push({ severity: 'warning', message: warning, playerId });
    if (route.durationSeconds > compiled.durationSeconds + 0.01) {
      const player = drill.players.find(item => item.id === playerId);
      issues.push({
        severity: 'warning',
        message: `#${player?.number ?? '?'} needs ${route.durationSeconds.toFixed(1)}s to finish this route; the drill limit is ${compiled.durationSeconds.toFixed(1)}s.`,
        playerId,
      });
    }
  }
  for (let index = 1; index < compiled.events.length; index++) {
    if (compiled.events[index].departureSeconds < compiled.events[index - 1].arrivalSeconds) {
      issues.push({
        severity: 'error',
        eventId: compiled.events[index].source.id,
        message: `Puck event ${index + 1} starts before event ${index} has finished.`,
      });
    }
  }
  if (drill.events.length === 0) {
    issues.push({ severity: 'warning', message: 'Add a pass, dump, pickup, or shot to complete the drill.' });
  }
  return issues;
}
