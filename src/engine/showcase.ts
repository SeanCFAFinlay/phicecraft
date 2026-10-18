import type { Drill, DrillEvent, DrillSettings, Player, Point, SkatePath } from '@/core/types';
import { PLAYER_RADIUS, RINK } from '@/core/constants';
import { compileDrill } from '@/sim/compileDrill';
import { sampleSkater } from '@/sim/skaterMotor';
import { generateId } from '@/utils/id';
import { createPlayer, createSkatePath } from './drill';
import type { FormationPresetDefinition } from './formations';

const DURATION = 8;
const DOT = { x: 845, y: 322.5 };
const SETTINGS: DrillSettings = {
  assistance: 'off', recovery: 'authored', timeLimitSeconds: DURATION,
  reducedEffects: false, finishPolicy: 'stop-after-sequence',
};

/** A deliberately small teaching pattern, not a simulated competitive faceoff. */
export const SHOWCASE_PRESET: FormationPresetDefinition = {
  id: 'showcase-faceoff',
  title: 'Faceoff to finish · guided demo',
  subtitle: '3 attackers, a faceoff partner and goalie: authored win, two passes, planned save',
  category: 'Quick Drills',
  initialPuck: DOT,
  settings: SETTINGS,
  coaching: {
    objective: 'Show an authored faceoff win, support skating, two catches in stride and a planned goalie save.',
    cues: 'Watch the centre win the puck at the lower right dot. The left winger moves into support; the right winger arrives through the slot. Pass to the moving blade, then shoot. The save is authored for teaching, not a prediction.',
  },
  players: () => [
    // The blade begins on the real faceoff dot: the pickup has no teleport.
    createPlayer(DOT.x - PLAYER_RADIUS * 1.38, DOT.y - PLAYER_RADIUS * 0.5, 'home', '9', 'C'),
    createPlayer(730, 345, 'home', '12', 'LW'),
    createPlayer(710, 210, 'home', '17', 'RW'),
    createPlayer(880, 335, 'away', '4', 'C'),
    createPlayer(922, RINK.centerY, 'away', '30', 'G'),
  ],
  sequence: (players: Player[]) => {
    const [centre, support, shooter] = players;
    const route = (player: Player, points: Point[], startAtSeconds: number): SkatePath => ({
      ...createSkatePath(player.id, player.team, [{ x: player.x, y: player.y }, ...points]),
      shape: 'spline', finish: 'stop', startAtSeconds,
    });
    const skatePaths = [
      route(centre, [{ x: 850, y: centre.y }, { x: 875, y: centre.y }, { x: 875, y: 280 }], 1),
      route(support, [{ x: 810, y: 305 }, { x: 835, y: 250 }], 2),
      route(shooter, [{ x: 865, y: RINK.centerY }], 3.5),
    ];
    const base: Drill = {
      schemaVersion: 2, id: 'showcase-authoring', name: 'Showcase timing',
      createdAt: 0, updatedAt: 0, players, skatePaths, events: [],
      initialPuck: DOT, settings: SETTINGS,
    };
    const compiled = compileDrill(base);
    const blade = (player: Player, time: number): Point => sampleSkater(
      player, compiled.routes.get(player.id)!, time
    ).bladePosition;
    const pass = (from: Player, to: Player, departure: number, arrival: number): DrillEvent => ({
      id: generateId(), type: 'pass', team: 'home', fromPlayerId: from.id, toPlayerId: to.id,
      fromPoint: blade(from, departure), toPoint: blade(to, arrival),
      at: departure / DURATION, arrivalAt: arrival / DURATION,
    });
    const events: DrillEvent[] = [
      { id: generateId(), type: 'pickup', team: 'home', fromPlayerId: centre.id,
        fromPoint: DOT, toPoint: blade(centre, 0.75), at: 0, arrivalAt: 0.75 / DURATION },
      pass(centre, support, 2.4, 3.1),
      pass(support, shooter, 4.3, 5),
      { id: generateId(), type: 'shot', team: 'home', fromPlayerId: shooter.id,
        fromPoint: blade(shooter, 6.2), toPoint: { x: RINK.netRightX, y: RINK.centerY },
        targetNet: 'R', result: 'save', at: 6.2 / DURATION, arrivalAt: 6.65 / DURATION },
    ];
    return { skatePaths, events };
  },
};
