import type { PlaybackPlayerFrame, Point } from '@/core/types';
import { distance } from '@/utils/geometry';

/** Iterative lead-pass interception against a deterministic receiver sampler. */
export function solvePassInterception(
  from: Point,
  departureSeconds: number,
  puckSpeed: number,
  sampleReceiver: (timeSeconds: number) => PlaybackPlayerFrame,
  maxTimeSeconds: number
): { point: Point; arrivalSeconds: number } {
  let arrivalSeconds = Math.min(maxTimeSeconds, departureSeconds + 0.18);
  let receiver = sampleReceiver(arrivalSeconds);
  for (let iteration = 0; iteration < 10; iteration++) {
    receiver = sampleReceiver(arrivalSeconds);
    const flight = distance(from, receiver.bladePosition) / Math.max(puckSpeed, 1);
    arrivalSeconds = Math.min(maxTimeSeconds, departureSeconds + Math.max(0.08, flight));
  }
  receiver = sampleReceiver(arrivalSeconds);
  return { point: receiver.bladePosition, arrivalSeconds };
}
