import { DEFAULT_DRILL_DURATION, SIMULATION } from '@/core/constants';
import type { Drill } from '@/core/types';
import type { MechanicsConfig } from './types';

export function getMechanicsConfig(drill: Drill): MechanicsConfig {
  return {
    ...SIMULATION,
    durationSeconds: Math.max(2, drill.settings?.timeLimitSeconds ?? DEFAULT_DRILL_DURATION),
    assistance: drill.settings?.assistance ?? 'standard',
    recovery: drill.settings?.recovery ?? 'nearest-teammate',
  };
}
