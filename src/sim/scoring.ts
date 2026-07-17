import type { ShotEvent } from '@/core/types';

export function isSuccessfulShot(event: ShotEvent): boolean {
  return (event.result ?? 'goal') === 'goal';
}

export function drillOutcome(events: { source: ShotEvent | { type: string } }[]): 'success' | 'failure' | null {
  const final = events[events.length - 1]?.source;
  if (!final || final.type !== 'shot') return null;
  return isSuccessfulShot(final as ShotEvent) ? 'success' : 'failure';
}
