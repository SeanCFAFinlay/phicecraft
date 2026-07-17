import type { Player, Point, SkatePath } from '@/core/types';
import { distance } from '@/utils/geometry';
import { buildMotionProfile } from './movementCurves';
import { validateRoute } from './routeValidation';
import type { CompiledRoute, MechanicsConfig } from './types';

export function compileRoute(
  player: Player,
  path: SkatePath | null,
  config: MechanicsConfig
): CompiledRoute {
  const pathPoints = path?.points?.length ? path.points : [{ x: player.x, y: player.y }];
  const points = pathPoints[0].x === player.x && pathPoints[0].y === player.y
    ? pathPoints.map(point => ({ ...point }))
    : [{ x: player.x, y: player.y }, ...pathPoints.map(point => ({ ...point }))];
  const segmentLengths: number[] = [];
  const cumulativeLengths = [0];
  let totalLength = 0;

  for (let index = 0; index < points.length - 1; index++) {
    const length = distance(points[index], points[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
    cumulativeLengths.push(totalLength);
  }

  const maxSpeed = path?.mode === 'backward' ? config.maxBackwardSpeed : config.maxForwardSpeed;
  const braking = path?.finish === 'coast' ? config.acceleration : config.braking;
  const motion = buildMotionProfile(totalLength, maxSpeed, config.acceleration, braking);

  return {
    ownerId: player.id,
    source: path,
    points,
    segmentLengths,
    cumulativeLengths,
    totalLength,
    durationSeconds: motion.duration,
    motion,
    warnings: validateRoute(points),
  };
}

export function pointAndTangentAtDistance(
  route: CompiledRoute,
  requestedDistance: number
): { position: Point; tangent: Point; progress: number } {
  if (route.totalLength <= 0 || route.points.length < 2) {
    return { position: { ...route.points[0] }, tangent: { x: 1, y: 0 }, progress: 0 };
  }

  const target = Math.max(0, Math.min(route.totalLength, requestedDistance));
  let segmentIndex = route.segmentLengths.length - 1;
  for (let index = 0; index < route.segmentLengths.length; index++) {
    if (target <= route.cumulativeLengths[index + 1] + 1e-6) {
      segmentIndex = index;
      break;
    }
  }

  const start = route.points[segmentIndex];
  const end = route.points[segmentIndex + 1];
  const length = Math.max(route.segmentLengths[segmentIndex], 0.0001);
  const local = Math.max(0, Math.min(1, (target - route.cumulativeLengths[segmentIndex]) / length));
  return {
    position: {
      x: start.x + (end.x - start.x) * local,
      y: start.y + (end.y - start.y) * local,
    },
    tangent: { x: (end.x - start.x) / length, y: (end.y - start.y) / length },
    progress: target / route.totalLength,
  };
}
