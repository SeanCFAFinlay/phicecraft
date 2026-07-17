import type { Point, ShotEvent } from '@/core/types';
import { hitsGoalPost } from './collision/goalGeometry';
import type { MechanicsConfig } from './types';

export function resolveShotResult(event: ShotEvent, config: MechanicsConfig): NonNullable<ShotEvent['result']> {
  if (event.result) return event.result;
  if (hitsGoalPost(event.toPoint, config.puckRadius, event.targetNet)) return 'post';
  return 'goal';
}

export function shotVelocity(from: Point, to: Point, speed: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: (dx / length) * speed, y: (dy / length) * speed };
}
