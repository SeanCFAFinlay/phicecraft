import type { PlaybackPlayerFrame, Point } from '@/core/types';
import { distance } from '@/utils/geometry';

export function canCollectPuck(player: PlaybackPlayerFrame, puck: Point, pickupRadius: number): boolean {
  return distance(player.bladePosition, puck) <= pickupRadius;
}
