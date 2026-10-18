import type { DrillEvent, Player, Point, SkatePath, Team } from '@/core/types';
import { RINK, RINK_MARKS } from '@/core/constants';
import { createPlayer, createSkatePath } from './drill';
import { generateId } from '@/utils/id';
import type { FormationPresetDefinition } from './formations';

export type QuickSpot = 'left-top' | 'left-bottom' | 'right-top' | 'right-bottom';
export type QuickFamily = 'faceoff' | 'corner' | 'battle-1v1' | 'battle-2v2' | 'dump-in';
export type QuickFormationPreset = 'faceoff-center' | `${QuickFamily}-${QuickSpot}`;
export interface FormationSequence { skatePaths: SkatePath[]; events: DrillEvent[] }

function faceoffPlayers(dot: Point, centre = false): Player[] {
  const players: Player[] = [];
  for (const team of ['home', 'away'] as const) {
    const sign = team === 'home' ? -1 : 1;
    const defending = !centre && (dot.x < RINK.centerX ? team === 'home' : team === 'away');
    const offsets = [[18, 0, 'C'], [55, -65, 'LW'], [55, 65, 'RW'], [130, -80, 'D'], [130, 80, 'D']] as const;
    for (const [x, y, role] of offsets) {
      // In end zones the defending point players stay in front of their net.
      const px = dot.x + sign * (defending && role === 'D' ? 55 : defending && role !== 'C' ? 40 : x);
      const py = defending && role === 'D' ? dot.y + (dot.y < RINK.centerY ? 1 : -1) * (y < 0 ? 80 : 140) : dot.y + y;
      players.push(createPlayer(px, Math.min(380, Math.max(45, py)), team, String(players.length + 10), role));
    }
    if (centre || (dot.x < RINK.centerX ? team === 'home' : team === 'away')) {
      players.push(createPlayer(team === 'home' ? 75 : 925, RINK.centerY, team, '30', 'G'));
    }
  }
  return players;
}

const spots: QuickSpot[] = ['left-top', 'left-bottom', 'right-top', 'right-bottom'];
const families: QuickFamily[] = ['faceoff', 'corner', 'battle-1v1', 'battle-2v2', 'dump-in'];

function atSpot(family: QuickFamily, spot: QuickSpot): FormationPresetDefinition {
  const left = spot.startsWith('left');
  const top = spot.endsWith('top');
  const attack: Team = left ? 'away' : 'home';
  const defend: Team = left ? 'home' : 'away';
  const point = (x: number, y: number): Point => ({ x: left ? RINK.width - x : x, y: top ? RINK.height - y : y });
  const dot = { x: left ? RINK.goalLineLeftX + RINK_MARKS.endZoneSpotFromGoalLine : RINK.goalLineRightX - RINK_MARKS.endZoneSpotFromGoalLine, y: RINK.centerY + (top ? -1 : 1) * RINK_MARKS.spotOffsetFromCenterY };
  const corner = point(900, 350);
  const player = (x: number, y: number, team: Team, number: string, role: Player['role'], puck = false) => {
    const p = point(x, y);
    return createPlayer(p.x, p.y, team, number, role, puck);
  };
  const names: Record<QuickFamily, string> = { faceoff: 'Zone faceoff', corner: 'Corner setup', 'battle-1v1': '1v1 corner battle', 'battle-2v2': '2v2 corner battle', 'dump-in': 'Dump-in & chase' };
  return {
    id: `${family}-${spot}`,
    title: `${names[family]} · ${left ? 'left' : 'right'} ${top ? 'upper' : 'lower'}`,
    subtitle: family === 'faceoff' ? 'Centres at the dot, wings and defence ready to draw routes' : family === 'dump-in' ? 'Puck into the corner with a chase and defensive retrieval route' : family === 'corner' ? 'Corner puck carrier, support and a defender ready to edit' : 'Editable skating routes converge on a loose corner puck; choose the recovery yourself',
    category: 'Quick Drills',
    initialPuck: family === 'faceoff' ? dot : family.startsWith('battle') ? corner : undefined,
    players: () => {
      if (family === 'faceoff') return faceoffPlayers(dot);
      if (family === 'corner') return [player(900, 350, attack, '11', 'C', true), player(805, 310, attack, '13', 'LW'), player(850, 365, defend, '4', 'D'), player(925, RINK.centerY, defend, '30', 'G')];
      if (family === 'dump-in') return [player(595, 285, attack, '11', 'C', true), player(565, 350, attack, '13', 'LW'), player(800, 290, defend, '4', 'D'), player(925, RINK.centerY, defend, '30', 'G')];
      const players = [player(780, 310, attack, '11', 'C'), player(805, 370, defend, '4', 'D')];
      if (family === 'battle-2v2') players.push(player(720, 275, attack, '13', 'LW'), player(845, 265, defend, '6', 'D'));
      return players;
    },
    sequence: family === 'dump-in' ? players => ({
      skatePaths: [
        createSkatePath(players[1].id, attack, [point(565, 350), point(735, 345), point(880, 350)]),
        createSkatePath(players[2].id, defend, [point(800, 290), point(860, 315), point(915, 340)]),
      ],
      events: [{ id: generateId(), type: 'dump', fromPlayerId: players[0].id, team: attack, fromPoint: { x: players[0].x, y: players[0].y }, toPoint: corner, targetNet: 'dump', at: 0.05, arrivalAt: 0.32 }],
    }) : family.startsWith('battle') ? players => ({
      skatePaths: players.map((p, index) => createSkatePath(p.id, p.team, [{ x: p.x, y: p.y }, point(index === 0 ? 840 : index === 1 ? 855 : 820, index % 2 ? 365 : 320), point(index < 2 ? 883 + index * 32 : 840, index < 2 ? 350 : 290 + (index % 2) * 35)])),
      events: [],
    }) : undefined,
  };
}

export const QUICK_SETUP_PRESETS: FormationPresetDefinition[] = [
  { id: 'faceoff-center', title: 'Centre faceoff', subtitle: '5v5 at centre ice, both goalies and a loose puck on the dot', category: 'Quick Drills', initialPuck: { x: RINK.centerX, y: RINK.centerY }, players: () => faceoffPlayers({ x: RINK.centerX, y: RINK.centerY }, true) },
  ...families.flatMap(family => spots.map(spot => atSpot(family, spot))),
];
