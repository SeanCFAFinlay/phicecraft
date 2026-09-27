// ============================================================================
// PLAY FORMATIONS & PRESETS
//
// Instant tactical setups for coaches. Placing 10 players manually into a
// 1-3-1 Power Play, 4v5 Box, or 5v5 Breakout takes 2 minutes of tedious
// tapping. These presets deploy canonical tactical formations in a single tap.
// ============================================================================

import type { Player, Point } from '@/core/types';
import { RINK } from '@/core/constants';
import { createPlayer } from './drill';

export type PlayFormationPreset =
  | 'pp-131'
  | 'pk-box'
  | 'breakout-5v5'
  | 'rush-3v2'
  | 'faceoff-ozone';

export interface FormationPresetDefinition {
  id: PlayFormationPreset;
  title: string;
  subtitle: string;
  category: 'Special Teams' | 'Systems' | 'Rush & Set Plays';
  players: () => Player[];
  initialPuck?: Point;
}

export const FORMATION_PRESETS: readonly FormationPresetDefinition[] = [
  {
    id: 'pp-131',
    title: '1-3-1 Power Play',
    subtitle: '5v4 umbrella setup with point QB, bumper & net-front',
    category: 'Special Teams',
    players: () => [
      // Attacking Power Play (Home)
      createPlayer(650, RINK.centerY, 'home', '5', 'D', true),
      createPlayer(740, 90, 'home', '8', 'LW'),
      createPlayer(740, 335, 'home', '88', 'RW'),
      createPlayer(780, RINK.centerY, 'home', '19', 'C'),
      createPlayer(885, RINK.centerY, 'home', '97', 'F'),
      // Defending Penalty Kill (Away)
      createPlayer(730, 155, 'away', '11', 'LW'),
      createPlayer(730, 270, 'away', '17', 'RW'),
      createPlayer(845, 150, 'away', '4', 'D'),
      createPlayer(845, 275, 'away', '6', 'D'),
      createPlayer(920, RINK.centerY, 'away', '1', 'G'),
    ],
  },
  {
    id: 'pk-box',
    title: '4v5 Penalty Kill Box',
    subtitle: 'Slot protection box defending home net vs umbrella',
    category: 'Special Teams',
    players: () => [
      // Defending Penalty Kill (Home)
      createPlayer(270, 155, 'home', '11', 'LW'),
      createPlayer(270, 270, 'home', '17', 'RW'),
      createPlayer(155, 150, 'home', '4', 'D'),
      createPlayer(155, 275, 'home', '6', 'D'),
      createPlayer(80, RINK.centerY, 'home', '30', 'G'),
      // Attacking Power Play (Away)
      createPlayer(350, RINK.centerY, 'away', '55', 'D'),
      createPlayer(260, 90, 'away', '12', 'LW', true),
      createPlayer(260, 335, 'away', '88', 'RW'),
      createPlayer(220, RINK.centerY, 'away', '19', 'C'),
      createPlayer(115, RINK.centerY, 'away', '9', 'F'),
    ],
  },
  {
    id: 'breakout-5v5',
    title: '5v5 D-Zone Breakout',
    subtitle: 'Wheel / Over retrieval setup with low support & wingers',
    category: 'Systems',
    players: () => [
      // Home Breakout Unit
      createPlayer(120, 90, 'home', '2', 'D', true),
      createPlayer(120, 335, 'home', '3', 'D'),
      createPlayer(220, RINK.centerY, 'home', '9', 'C'),
      createPlayer(270, 95, 'home', '13', 'LW'),
      createPlayer(400, 320, 'home', '18', 'RW'),
      createPlayer(80, RINK.centerY, 'home', '30', 'G'),
      // Away Forecheckers
      createPlayer(180, 125, 'away', '21', 'C'),
      createPlayer(275, 230, 'away', '24', 'RW'),
    ],
  },
  {
    id: 'rush-3v2',
    title: '3-on-2 Rush Attack',
    subtitle: 'Mid-lane drive entry with wide puck carrier & weak-side fill',
    category: 'Rush & Set Plays',
    players: () => [
      // Home Rush
      createPlayer(510, 110, 'home', '10', 'LW', true),
      createPlayer(490, RINK.centerY, 'home', '97', 'C'),
      createPlayer(480, 315, 'home', '88', 'RW'),
      // Away Defenders & Goalie
      createPlayer(680, 165, 'away', '4', 'D'),
      createPlayer(680, 260, 'away', '6', 'D'),
      createPlayer(920, RINK.centerY, 'away', '1', 'G'),
    ],
  },
  {
    id: 'faceoff-ozone',
    title: 'O-Zone Faceoff Alignment',
    subtitle: 'Right circle offensive alignment with point & tie-up options',
    category: 'Rush & Set Plays',
    initialPuck: { x: 795, y: 322.5 },
    players: () => [
      // Home Offense
      createPlayer(790, 315, 'home', '97', 'C'),
      createPlayer(820, 260, 'home', '63', 'LW'),
      createPlayer(810, 375, 'home', '88', 'RW'),
      createPlayer(650, 320, 'home', '5', 'D'),
      createPlayer(640, 160, 'home', '8', 'D'),
      // Away Defense
      createPlayer(800, 330, 'away', '19', 'C'),
      createPlayer(815, 385, 'away', '23', 'LW'),
      createPlayer(825, 275, 'away', '11', 'RW'),
      createPlayer(870, 280, 'away', '2', 'D'),
      createPlayer(890, 220, 'away', '4', 'D'),
      createPlayer(920, RINK.centerY, 'away', '1', 'G'),
    ],
  },
] as const;

export function getFormationPreset(preset: PlayFormationPreset): FormationPresetDefinition {
  const match = FORMATION_PRESETS.find(item => item.id === preset);
  if (!match) throw new Error(`Unknown formation preset: ${preset}`);
  return match;
}
