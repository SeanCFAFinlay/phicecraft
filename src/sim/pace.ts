// ============================================================================
// PLAYBACK PACE BY AGE GROUP
//
// A U9 drill does not move like a U18 one. Younger players skate, pass and
// shoot slower, so the same drill takes them longer.
//
// The pace slows the WHOLE drill evenly: skating, passes, shots and the puck
// sliding to a stop all scale by the same factor. That keeps every authored
// interaction intact. A pass still meets its receiver, because both are slowed
// alike, while the clock shows how long the drill really takes at that age.
//
// Factors are top skating speed relative to the standard pace (22 ft/s, about
// U15). They are rounded estimates for the typical player in the age group,
// not measurements of a particular team.
// ============================================================================

import type { PlaybackPace } from '@/core/types';

export const PACE_FACTOR: Record<PlaybackPace, number> = {
  u7: 0.5,
  u9: 0.62,
  u11: 0.75,
  u13: 0.88,
  u15: 1,
  u18: 1.1,
  adult: 1.2,
};

export const PACE_LABEL: Record<PlaybackPace, string> = {
  u7: 'U7',
  u9: 'U9',
  u11: 'U11',
  u13: 'U13',
  u15: 'U15',
  u18: 'U18',
  adult: 'Adult',
};

export const PACES: PlaybackPace[] = ['u7', 'u9', 'u11', 'u13', 'u15', 'u18', 'adult'];

/** Speed relative to the standard pace. 1 when no age group is set. */
export function paceFactor(pace: PlaybackPace | undefined | null): number {
  return pace ? PACE_FACTOR[pace] ?? 1 : 1;
}

export function isPlaybackPace(value: unknown): value is PlaybackPace {
  return typeof value === 'string' && value in PACE_FACTOR;
}
