import { FT, RINK, RINK_MARKS } from '@/core/constants';
import type { PlaybackPlayerFrame, Point, ShotEvent } from '@/core/types';
import { hitsGoalPost } from './collision/goalGeometry';
import type { MechanicsConfig } from './types';

export interface ShotResolutionContext {
  from: Point;
  to: Point;
  goalie?: PlaybackPlayerFrame | null;
}

/**
 * Resolve an un-authored shot from goal geometry, flight time, and the
 * defending goalie's lateral coverage. Explicit event results remain useful
 * for coaching fixtures, but normal editor shots are earned here.
 */
export function resolveShotResult(
  event: ShotEvent,
  config: MechanicsConfig,
  context?: ShotResolutionContext
): NonNullable<ShotEvent['result']> {
  if (event.result) return event.result;
  if (hitsGoalPost(event.toPoint, config.puckRadius, event.targetNet)) return 'post';

  const target = context?.to ?? event.toPoint;
  const mouthHalfWidth = RINK_MARKS.goalHalfWidth - config.puckRadius;
  if (Math.abs(target.y - RINK.centerY) > mouthHalfWidth) return 'wide';

  const goalie = context?.goalie;
  if (!goalie) return 'goal';

  const from = context?.from ?? event.fromPoint;
  const flightSeconds = Math.hypot(target.x - from.x, target.y - from.y) / config.shotSpeed;
  const reactionSeconds = Math.max(0, flightSeconds - 0.18);
  const gloveAndPadReach = 1.15 * FT;
  const lateralCoverage = gloveAndPadReach + reactionSeconds * 2.2 * FT;
  const targetGap = Math.abs(target.y - goalie.position.y);

  if (targetGap <= lateralCoverage) {
    return targetGap > 0.7 * FT ? 'rebound' : 'save';
  }
  return 'goal';
}

export function shotVelocity(from: Point, to: Point, speed: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: (dx / length) * speed, y: (dy / length) * speed };
}
