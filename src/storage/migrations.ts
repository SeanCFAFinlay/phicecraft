import type { Drill } from '@/core/types';

export const CURRENT_DRILL_SCHEMA = 2 as const;

export function migrateDrill(input: Drill): Drill {
  const drill = structuredClone(input);
  return {
    ...drill,
    schemaVersion: CURRENT_DRILL_SCHEMA,
    players: (drill.players ?? []).map(player => ({
      ...player,
      visual: player.visual ?? {
        handedness: player.team === 'home' ? 'right' : 'left',
        visor: player.role !== 'G',
      },
    })),
    skatePaths: (drill.skatePaths ?? []).map(path => ({
      ...path,
      mode: path.mode ?? 'skate',
      finish: path.finish ?? 'stop',
    })),
    settings: {
      assistance: drill.settings?.assistance ?? 'standard',
      recovery: drill.settings?.recovery ?? 'nearest-teammate',
      timeLimitSeconds: Math.max(2, drill.settings?.timeLimitSeconds ?? 8),
      reducedEffects: drill.settings?.reducedEffects ?? false,
    },
  };
}
