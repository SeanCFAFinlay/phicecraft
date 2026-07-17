import { FT, RINK, RINK_MARKS } from '@/core/constants';
import type { NetSide, Point } from '@/core/types';
import { distance } from '@/utils/geometry';

export const GOAL_POST_RADIUS = (2 / 12) * FT;

export function getGoalPosts(side: NetSide): [Point, Point] {
  const x = side === 'L' ? RINK.goalLineLeftX : RINK.goalLineRightX;
  return [
    { x, y: RINK.centerY - RINK_MARKS.goalHalfWidth },
    { x, y: RINK.centerY + RINK_MARKS.goalHalfWidth },
  ];
}

export function hitsGoalPost(point: Point, puckRadius: number, side: NetSide): boolean {
  return getGoalPosts(side).some(post => distance(point, post) <= GOAL_POST_RADIUS + puckRadius);
}

export function crossesGoalMouth(previous: Point, current: Point, side: NetSide): boolean {
  const lineX = side === 'L' ? RINK.goalLineLeftX : RINK.goalLineRightX;
  const crosses = side === 'L'
    ? previous.x >= lineX && current.x < lineX
    : previous.x <= lineX && current.x > lineX;
  if (!crosses) return false;
  const dx = current.x - previous.x;
  const t = Math.abs(dx) < 0.0001 ? 0 : (lineX - previous.x) / dx;
  const y = previous.y + (current.y - previous.y) * t;
  return Math.abs(y - RINK.centerY) < RINK_MARKS.goalHalfWidth - GOAL_POST_RADIUS;
}
