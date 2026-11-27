import { DEFAULT_DRILL_DURATION, SIMULATION } from '@/core/constants';
import type { Drill } from '@/core/types';
import { paceFactor } from './pace';
import type { MechanicsConfig } from './types';

export function getMechanicsConfig(drill: Drill): MechanicsConfig {
  // Slowing the drill by `speed` is the same as running its clock 1/speed
  // times longer: velocities scale by speed, accelerations by speed squared.
  const speed = paceFactor(drill.settings?.pace);
  const accel = speed * speed;
  return {
    ...SIMULATION,
    maxForwardSpeed: SIMULATION.maxForwardSpeed * speed,
    maxBackwardSpeed: SIMULATION.maxBackwardSpeed * speed,
    acceleration: SIMULATION.acceleration * accel,
    braking: SIMULATION.braking * accel,
    puckFriction: SIMULATION.puckFriction * accel,
    passSpeed: SIMULATION.passSpeed * speed,
    shotSpeed: SIMULATION.shotSpeed * speed,
    catchSpeed: SIMULATION.catchSpeed * speed,
    durationSeconds: Math.max(2, drill.settings?.timeLimitSeconds ?? DEFAULT_DRILL_DURATION) / speed,
    timeScale: 1 / speed,
    assistance: drill.settings?.assistance ?? 'standard',
    recovery: drill.settings?.recovery ?? 'nearest-teammate',
  };
}
