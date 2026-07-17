import type { ID, PlaybackPlayerFrame, Point } from '@/core/types';
import { distance } from '@/utils/geometry';

export function chooseNearestPursuer(
  frames: Record<ID, PlaybackPlayerFrame>,
  teammateIds: ID[],
  puck: Point
): ID | null {
  return teammateIds
    .map(id => ({ id, gap: frames[id] ? distance(frames[id].bladePosition, puck) : Infinity }))
    .sort((a, b) => a.gap - b.gap || a.id.localeCompare(b.id))[0]?.id ?? null;
}
