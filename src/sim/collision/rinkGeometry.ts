import { RINK } from '@/core/constants';
import type { Point } from '@/core/types';

export interface RinkConstraint {
  position: Point;
  normal: Point;
  collided: boolean;
}

/** Keep a disc centre inside the regulation rounded-rectangle rink. */
export function constrainToRink(point: Point, margin: number): RinkConstraint {
  const minX = RINK.x + margin;
  const maxX = RINK.x + RINK.width - margin;
  const minY = RINK.y + margin;
  const maxY = RINK.y + RINK.height - margin;
  let x = Math.max(minX, Math.min(maxX, point.x));
  let y = Math.max(minY, Math.min(maxY, point.y));
  let normal = { x: 0, y: 0 };
  let collided = x !== point.x || y !== point.y;

  if (point.x < minX) normal = { x: -1, y: 0 };
  else if (point.x > maxX) normal = { x: 1, y: 0 };
  if (point.y < minY) normal = { x: 0, y: -1 };
  else if (point.y > maxY) normal = { x: 0, y: 1 };

  const corners = [
    { cx: RINK.x + RINK.cornerRadius, cy: RINK.y + RINK.cornerRadius, left: true, top: true },
    { cx: RINK.x + RINK.width - RINK.cornerRadius, cy: RINK.y + RINK.cornerRadius, left: false, top: true },
    { cx: RINK.x + RINK.cornerRadius, cy: RINK.y + RINK.height - RINK.cornerRadius, left: true, top: false },
    { cx: RINK.x + RINK.width - RINK.cornerRadius, cy: RINK.y + RINK.height - RINK.cornerRadius, left: false, top: false },
  ];
  const innerRadius = Math.max(1, RINK.cornerRadius - margin);

  for (const corner of corners) {
    const inCornerX = corner.left ? x < corner.cx : x > corner.cx;
    const inCornerY = corner.top ? y < corner.cy : y > corner.cy;
    if (!inCornerX || !inCornerY) continue;
    const dx = x - corner.cx;
    const dy = y - corner.cy;
    const length = Math.hypot(dx, dy) || 1;
    if (length > innerRadius) {
      normal = { x: dx / length, y: dy / length };
      x = corner.cx + normal.x * innerRadius;
      y = corner.cy + normal.y * innerRadius;
      collided = true;
    }
  }

  return { position: { x, y }, normal, collided };
}

export function isInsideRink(point: Point, margin = 0): boolean {
  return !constrainToRink(point, margin).collided;
}
