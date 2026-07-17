import type { Drill } from '@/core/types';
import { FT, RINK } from '@/core/constants';

export const fiveManCrossCornerDrill: Drill = {
  schemaVersion: 2,
  id: 'fixture-five-man-cross-corner',
  name: '5-Man Cross-Corner Attack',
  createdAt: 1,
  updatedAt: 1,
  settings: { assistance: 'high', recovery: 'authored', timeLimitSeconds: 10, reducedEffects: false },
  players: [
    { id: 'coach', x: 96 * FT, y: 78 * FT, team: 'home', number: 'C', role: 'F', hasPuck: true, visual: { handedness: 'right', visor: false } },
    { id: 'p17', x: 112 * FT, y: 15 * FT, team: 'home', number: '17', role: 'LW', hasPuck: false, visual: { handedness: 'left', visor: true } },
    { id: 'p19', x: 110 * FT, y: 42.5 * FT, team: 'home', number: '19', role: 'C', hasPuck: false, visual: { handedness: 'right', visor: true } },
    { id: 'p21', x: 112 * FT, y: 69 * FT, team: 'home', number: '21', role: 'RW', hasPuck: false, visual: { handedness: 'right', visor: true } },
    { id: 'p4', x: 102 * FT, y: 25 * FT, team: 'home', number: '4', role: 'D', hasPuck: false, visual: { handedness: 'left', visor: true } },
    { id: 'p6', x: 102 * FT, y: 58 * FT, team: 'home', number: '6', role: 'D', hasPuck: false, visual: { handedness: 'right', visor: true } },
    { id: 'g1', x: RINK.goalLineRightX - 3 * FT, y: RINK.centerY, team: 'away', number: '1', role: 'G', hasPuck: false, visual: { handedness: 'left', visor: false } },
  ],
  skatePaths: [
    { id: 'route-17', ownerId: 'p17', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 112 * FT, y: 15 * FT }, { x: 146 * FT, y: 16 * FT }, { x: 176 * FT, y: 17 * FT }, { x: 181 * FT, y: 20 * FT }] },
    { id: 'route-19', ownerId: 'p19', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 110 * FT, y: 42.5 * FT }, { x: 140 * FT, y: 42.5 * FT }, { x: 163 * FT, y: 42.5 * FT }] },
    { id: 'route-21', ownerId: 'p21', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 112 * FT, y: 69 * FT }, { x: 145 * FT, y: 66 * FT }, { x: 174 * FT, y: 59 * FT }] },
    { id: 'route-4', ownerId: 'p4', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 102 * FT, y: 25 * FT }, { x: 124 * FT, y: 25 * FT }, { x: 138 * FT, y: 28 * FT }] },
    { id: 'route-6', ownerId: 'p6', team: 'home', mode: 'skate', finish: 'stop', points: [{ x: 102 * FT, y: 58 * FT }, { x: 124 * FT, y: 58 * FT }, { x: 138 * FT, y: 56 * FT }] },
  ],
  events: [
    { id: 'coach-upper-dump', type: 'dump', fromPlayerId: 'coach', fromPoint: { x: 96 * FT, y: 78 * FT }, toPoint: { x: 182 * FT, y: 15 * FT }, targetNet: 'dump', team: 'home', at: 0.05, arrivalAt: 0.17 },
    { id: 'pickup-17', type: 'pickup', fromPlayerId: 'p17', fromPoint: { x: 182 * FT, y: 15 * FT }, toPoint: { x: 181 * FT, y: 20 * FT }, team: 'home', at: 0.45, arrivalAt: 0.48 },
    { id: 'pass-17-21', type: 'pass', fromPlayerId: 'p17', toPlayerId: 'p21', fromPoint: { x: 181 * FT, y: 20 * FT }, toPoint: { x: 174 * FT, y: 59 * FT }, team: 'home', at: 0.53, arrivalAt: 0.6, catchResult: 'caught', catchQuality: 'good' },
    { id: 'pass-21-19', type: 'pass', fromPlayerId: 'p21', toPlayerId: 'p19', fromPoint: { x: 174 * FT, y: 59 * FT }, toPoint: { x: 163 * FT, y: 42.5 * FT }, team: 'home', at: 0.64, arrivalAt: 0.71, catchResult: 'caught', catchQuality: 'good' },
    { id: 'shot-19', type: 'shot', fromPlayerId: 'p19', fromPoint: { x: 163 * FT, y: 42.5 * FT }, toPoint: { x: RINK.netRightX, y: RINK.netRightY }, targetNet: 'R', team: 'home', at: 0.77, arrivalAt: 0.84, result: 'goal' },
  ],
};
