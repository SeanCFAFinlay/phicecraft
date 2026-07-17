import type { Drill } from '@/core/types';
import { FT, RINK } from '@/core/constants';

export const giveAndGoRegressionDrill: Drill = {
  schemaVersion: 2,
  id: 'fixture-give-and-go',
  name: '#11 to #13 Give and Go',
  createdAt: 1,
  updatedAt: 1,
  settings: {
    assistance: 'standard',
    recovery: 'nearest-teammate',
    timeLimitSeconds: 8,
    reducedEffects: false,
  },
  players: [
    {
      id: 'p11', x: 48 * FT, y: 42.5 * FT, team: 'home', number: '11', role: 'C', hasPuck: true,
      visual: { handedness: 'right', visor: true },
    },
    {
      id: 'p13', x: 66 * FT, y: 23 * FT, team: 'home', number: '13', role: 'LW', hasPuck: false,
      visual: { handedness: 'left', visor: true },
    },
    {
      id: 'g1', x: RINK.goalLineRightX - 3 * FT, y: RINK.centerY, team: 'away', number: '1', role: 'G', hasPuck: false,
      visual: { handedness: 'left', visor: false },
    },
  ],
  skatePaths: [
    {
      id: 'r11', ownerId: 'p11', team: 'home', mode: 'skate', finish: 'stop',
      points: [{ x: 48 * FT, y: 42.5 * FT }, { x: 78 * FT, y: 42.5 * FT }],
    },
    {
      id: 'r13', ownerId: 'p13', team: 'home', mode: 'skate', finish: 'stop',
      points: [{ x: 66 * FT, y: 23 * FT }, { x: 103 * FT, y: 29 * FT }, { x: 144 * FT, y: 37 * FT }],
    },
  ],
  events: [
    {
      id: 'pass-11-13', type: 'pass', fromPlayerId: 'p11', toPlayerId: 'p13',
      fromPoint: { x: 72 * FT, y: 42.5 * FT }, toPoint: { x: 101 * FT, y: 29 * FT },
      team: 'home', at: 0.28, arrivalAt: 0.4,
    },
    {
      id: 'shot-13', type: 'shot', fromPlayerId: 'p13',
      fromPoint: { x: 142 * FT, y: 37 * FT }, toPoint: { x: RINK.netRightX, y: RINK.netRightY - 2.2 * FT },
      targetNet: 'R', team: 'home', at: 0.72, arrivalAt: 0.82,
    },
  ],
};
