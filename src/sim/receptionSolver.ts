import type { PassEvent, PlaybackPlayerFrame, Point } from '@/core/types';
import { distance } from '@/utils/geometry';
import type { MechanicsConfig, ReceptionEvaluation } from './types';

export function evaluateReception(
  event: PassEvent,
  puckPosition: Point,
  puckVelocity: Point,
  receiver: PlaybackPlayerFrame,
  config: MechanicsConfig
): ReceptionEvaluation {
  const gap = distance(puckPosition, receiver.bladePosition);
  const relativeSpeed = Math.hypot(
    puckVelocity.x - receiver.velocity.x,
    puckVelocity.y - receiver.velocity.y
  );
  const assistMultiplier = config.assistance === 'high' ? 1.8 : config.assistance === 'standard' ? 1.35 : 1;
  const caught = event.catchResult !== 'missed' &&
    gap <= config.catchRadius * assistMultiplier &&
    relativeSpeed <= config.catchSpeed * assistMultiplier;
  return {
    caught,
    quality: !caught ? 'unreachable' : gap > config.catchRadius ? 'assisted' : 'good',
    gap,
    relativeSpeed,
  };
}
