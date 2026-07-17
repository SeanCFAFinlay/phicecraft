import type { Point } from '@/core/types';
import { distance } from '@/utils/geometry';

export function validateRoute(points: Point[]): string[] {
  const warnings: string[] = [];
  if (points.length < 2) return warnings;

  for (let i = 1; i < points.length; i++) {
    if (distance(points[i - 1], points[i]) < 1) {
      warnings.push('Route contains overlapping points');
      break;
    }
  }

  for (let i = 1; i < points.length - 1; i++) {
    const a = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
    const b = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x);
    const turn = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    if (turn > Math.PI * 0.72) {
      warnings.push('Route contains a turn too sharp for a skater at speed');
      break;
    }
  }

  return warnings;
}
