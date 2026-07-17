import type { Drill } from '@/core/types';
import { FT, RINK } from '@/core/constants';

export const fiveManLowHighDrill: Drill = {
  schemaVersion: 2,
  id: 'fixture-five-man-low-high',
  name: '5-Man Full-Ice Criss-Cross Point Shot',
  createdAt: 1,
  updatedAt: 1,
  settings: { assistance: 'high', recovery: 'authored', timeLimitSeconds: 18, reducedEffects: false },
  players: [
    { id: 'coach', x: 38 * FT, y: 8 * FT, team: 'home', number: 'C', role: 'F', hasPuck: true, visual: { handedness: 'right', visor: false } },
    { id: 'p17', x: 24 * FT, y: 18 * FT, team: 'home', number: '17', role: 'LW', hasPuck: false, visual: { handedness: 'left', visor: true } },
    { id: 'p19', x: 26 * FT, y: 42.5 * FT, team: 'home', number: '19', role: 'C', hasPuck: false, visual: { handedness: 'right', visor: true } },
    { id: 'p21', x: 24 * FT, y: 67 * FT, team: 'home', number: '21', role: 'RW', hasPuck: false, visual: { handedness: 'right', visor: true } },
    { id: 'p4', x: 32 * FT, y: 30 * FT, team: 'home', number: '4', role: 'D', hasPuck: false, visual: { handedness: 'left', visor: true } },
    { id: 'p6', x: 32 * FT, y: 55 * FT, team: 'home', number: '6', role: 'D', hasPuck: false, visual: { handedness: 'right', visor: true } },
    { id: 'g1', x: RINK.goalLineRightX - 3 * FT, y: RINK.centerY, team: 'away', number: '1', role: 'G', hasPuck: false, visual: { handedness: 'left', visor: false } },
  ],
  skatePaths: [
    { id: 'route-17', ownerId: 'p17', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 24 * FT, y: 18 * FT }, { x: 68 * FT, y: 60 * FT }, { x: 112 * FT, y: 25 * FT }, { x: 146 * FT, y: 59 * FT }, { x: 175 * FT, y: 34 * FT }] },
    { id: 'route-19', ownerId: 'p19', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 26 * FT, y: 42.5 * FT }, { x: 70 * FT, y: 20 * FT }, { x: 112 * FT, y: 64 * FT }, { x: 138 * FT, y: 27 * FT }, { x: 163 * FT, y: 43 * FT }] },
    { id: 'route-21', ownerId: 'p21', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 24 * FT, y: 67 * FT }, { x: 70 * FT, y: 38 * FT }, { x: 112 * FT, y: 68 * FT }, { x: 148 * FT, y: 38 * FT }, { x: 181 * FT, y: 66 * FT }] },
    { id: 'route-4', ownerId: 'p4', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 32 * FT, y: 30 * FT }, { x: 70 * FT, y: 55 * FT }, { x: 110 * FT, y: 28 * FT }, { x: 138 * FT, y: 27 * FT }] },
    { id: 'route-6', ownerId: 'p6', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 32 * FT, y: 55 * FT }, { x: 70 * FT, y: 30 * FT }, { x: 110 * FT, y: 58 * FT }, { x: 140 * FT, y: 57 * FT }] },
  ],
  events: [
    { id: 'coach-lower-dump', type: 'dump', fromPlayerId: 'coach', fromPoint: { x: 38 * FT, y: 8 * FT }, toPoint: { x: 182 * FT, y: 70 * FT }, targetNet: 'dump', team: 'home', at: 0.42, arrivalAt: 0.5 },
    { id: 'pickup-21', type: 'pickup', fromPlayerId: 'p21', fromPoint: { x: 182 * FT, y: 70 * FT }, toPoint: { x: 181 * FT, y: 66 * FT }, team: 'home', at: 0.65, arrivalAt: 0.67 },
    { id: 'pass-21-6', type: 'pass', fromPlayerId: 'p21', toPlayerId: 'p6', fromPoint: { x: 181 * FT, y: 66 * FT }, toPoint: { x: 140 * FT, y: 57 * FT }, team: 'home', at: 0.7, arrivalAt: 0.74, catchResult: 'caught', catchQuality: 'good' },
    { id: 'pass-6-19', type: 'pass', fromPlayerId: 'p6', toPlayerId: 'p19', fromPoint: { x: 140 * FT, y: 57 * FT }, toPoint: { x: 163 * FT, y: 43 * FT }, team: 'home', at: 0.78, arrivalAt: 0.82, catchResult: 'caught', catchQuality: 'good' },
    { id: 'shot-19', type: 'shot', fromPlayerId: 'p19', fromPoint: { x: 163 * FT, y: 43 * FT }, toPoint: { x: RINK.netRightX, y: RINK.netRightY }, targetNet: 'R', team: 'home', at: 0.88, arrivalAt: 0.93, result: 'goal' },
  ],
};
