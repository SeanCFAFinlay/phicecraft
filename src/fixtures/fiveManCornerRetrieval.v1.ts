import type { Drill } from '@/core/types';
import { FT, RINK } from '@/core/constants';

/**
 * Five-man offensive-zone entry:
 * coach dump -> corner retrieval -> low-to-middle pass -> middle-to-slot pass
 * -> shot. All five skaters enter together, with both defenders holding the
 * blue line as support.
 */
export const fiveManCornerRetrievalDrill: Drill = {
  schemaVersion: 2,
  id: 'fixture-five-man-corner-retrieval',
  name: '5-Man Corner Retrieval and Shot',
  createdAt: 1,
  updatedAt: 1,
  settings: {
    assistance: 'high',
    recovery: 'authored',
    timeLimitSeconds: 10,
    reducedEffects: false,
  },
  players: [
    {
      id: 'coach', x: 96 * FT, y: 78 * FT, team: 'home', number: 'C', role: 'F', hasPuck: true,
      visual: { handedness: 'right', visor: false },
    },
    {
      id: 'p17', x: 112 * FT, y: 12 * FT, team: 'home', number: '17', role: 'LW', hasPuck: false,
      visual: { handedness: 'left', visor: true },
    },
    {
      id: 'p19', x: 110 * FT, y: 31 * FT, team: 'home', number: '19', role: 'C', hasPuck: false,
      visual: { handedness: 'right', visor: true },
    },
    {
      id: 'p21', x: 112 * FT, y: 70 * FT, team: 'home', number: '21', role: 'RW', hasPuck: false,
      visual: { handedness: 'right', visor: true },
    },
    {
      id: 'p4', x: 102 * FT, y: 22 * FT, team: 'home', number: '4', role: 'D', hasPuck: false,
      visual: { handedness: 'left', visor: true },
    },
    {
      id: 'p6', x: 102 * FT, y: 60 * FT, team: 'home', number: '6', role: 'D', hasPuck: false,
      visual: { handedness: 'right', visor: true },
    },
    {
      id: 'g1', x: RINK.goalLineRightX - 3 * FT, y: RINK.centerY, team: 'away', number: '1', role: 'G', hasPuck: false,
      visual: { handedness: 'left', visor: false },
    },
  ],
  skatePaths: [
    {
      id: 'route-17', ownerId: 'p17', team: 'home', mode: 'skate', finish: 'stop',
      points: [
        { x: 112 * FT, y: 12 * FT },
        { x: 139 * FT, y: 17 * FT },
        { x: 158 * FT, y: 24 * FT },
        { x: 166 * FT, y: 31 * FT },
      ],
    },
    {
      id: 'route-19', ownerId: 'p19', team: 'home', mode: 'skate', finish: 'stop',
      points: [
        { x: 110 * FT, y: 31 * FT },
        { x: 137 * FT, y: 34 * FT },
        { x: 155 * FT, y: 42.5 * FT },
      ],
    },
    {
      id: 'route-21', ownerId: 'p21', team: 'home', mode: 'skate', finish: 'stop',
      points: [
        { x: 112 * FT, y: 70 * FT },
        { x: 145 * FT, y: 70 * FT },
        { x: 174 * FT, y: 70 * FT },
        { x: 181 * FT, y: 67 * FT },
      ],
    },
    {
      id: 'route-4', ownerId: 'p4', team: 'home', mode: 'skate', finish: 'stop',
      points: [
        { x: 102 * FT, y: 22 * FT },
        { x: 124 * FT, y: 22 * FT },
        { x: 138 * FT, y: 26 * FT },
      ],
    },
    {
      id: 'route-6', ownerId: 'p6', team: 'home', mode: 'skate', finish: 'stop',
      points: [
        { x: 102 * FT, y: 60 * FT },
        { x: 124 * FT, y: 60 * FT },
        { x: 138 * FT, y: 57 * FT },
      ],
    },
  ],
  events: [
    {
      id: 'coach-corner-dump', type: 'dump', fromPlayerId: 'coach',
      fromPoint: { x: 96 * FT, y: 78 * FT }, toPoint: { x: 182 * FT, y: 70 * FT },
      targetNet: 'dump', team: 'home', at: 0.05, arrivalAt: 0.17,
    },
    {
      id: 'pickup-21', type: 'pickup', fromPlayerId: 'p21',
      fromPoint: { x: 182 * FT, y: 70 * FT }, toPoint: { x: 181 * FT, y: 67 * FT },
      team: 'home', at: 0.45, arrivalAt: 0.48,
    },
    {
      id: 'pass-21-19', type: 'pass', fromPlayerId: 'p21', toPlayerId: 'p19',
      fromPoint: { x: 181 * FT, y: 67 * FT }, toPoint: { x: 155 * FT, y: 42.5 * FT },
      team: 'home', at: 0.53, arrivalAt: 0.6,
    },
    {
      id: 'pass-19-17', type: 'pass', fromPlayerId: 'p19', toPlayerId: 'p17',
      fromPoint: { x: 155 * FT, y: 42.5 * FT }, toPoint: { x: 166 * FT, y: 31 * FT },
      team: 'home', at: 0.64, arrivalAt: 0.71,
    },
    {
      id: 'shot-17', type: 'shot', fromPlayerId: 'p17',
      fromPoint: { x: 166 * FT, y: 31 * FT }, toPoint: { x: RINK.netRightX, y: RINK.netRightY - 2.2 * FT },
      targetNet: 'R', team: 'home', at: 0.77, arrivalAt: 0.84,
    },
  ],
};
