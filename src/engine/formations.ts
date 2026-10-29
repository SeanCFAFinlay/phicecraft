// ============================================================================
// PLAY FORMATIONS & PRESETS
//
// Instant tactical setups for coaches. Placing 10 players manually into a
// 1-3-1 Power Play, 4v5 Box, or 5v5 Breakout takes 2 minutes of tedious
// tapping. These presets deploy canonical tactical formations in a single tap.
// ============================================================================

import type { Player, Point, DrillSettings, CoachingDetails } from '@/core/types';
import { RINK } from '@/core/constants';
import { createPlayer } from './drill';
import { QUICK_SETUP_PRESETS, type FormationSequence, type QuickFormationPreset } from './quickSetups';
import { SHOWCASE_PRESET } from './showcase';

export type PlayFormationPreset =
  | 'pp-131'
  | 'pk-box'
  | 'breakout-5v5'
  | 'rush-3v2'
  | 'rush-2v1'
  | 'forecheck-212'
  | 'trap-122'
  | 'pp-umbrella'
  | 'faceoff-ozone'
  | 'faceoff-dzone'
  | 'showcase-faceoff'
  | QuickFormationPreset;

export interface FormationPresetDefinition {
  id: PlayFormationPreset;
  title: string;
  subtitle: string;
  category: 'Special Teams' | 'Systems' | 'Rush & Set Plays' | 'Quick Drills';
  players: () => Player[];
  initialPuck?: Point;
  sequence?: (players: Player[]) => FormationSequence;
  settings?: Partial<DrillSettings>;
  coaching?: Pick<CoachingDetails, 'objective' | 'cues'>;
}

export const FORMATION_PRESETS: readonly FormationPresetDefinition[] = [
  SHOWCASE_PRESET,
  ...QUICK_SETUP_PRESETS,
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
    id: 'rush-2v1',
    title: '2-on-1 Rush Attack',
    subtitle: 'Odd-man rush with carrier driving wide and trailing pass option',
    category: 'Rush & Set Plays',
    players: () => [
      createPlayer(520, 130, 'home', '10', 'LW', true),
      createPlayer(500, 295, 'home', '88', 'RW'),
      createPlayer(690, RINK.centerY, 'away', '4', 'D'),
      createPlayer(920, RINK.centerY, 'away', '1', 'G'),
    ],
  },
  {
    id: 'forecheck-212',
    title: '2-1-2 Heavy Forecheck',
    subtitle: 'Aggressive F1/F2 puck pursuit with F3 high slot lock and pinch support',
    category: 'Systems',
    players: () => [
      // Home Breakout
      createPlayer(120, 100, 'home', '2', 'D', true),
      createPlayer(120, 325, 'home', '3', 'D'),
      createPlayer(200, RINK.centerY, 'home', '9', 'C'),
      createPlayer(260, 90, 'home', '13', 'LW'),
      createPlayer(260, 335, 'home', '18', 'RW'),
      createPlayer(80, RINK.centerY, 'home', '30', 'G'),
      // Away Forecheck
      createPlayer(190, 135, 'away', '11', 'LW'),
      createPlayer(220, 290, 'away', '17', 'RW'),
      createPlayer(310, RINK.centerY, 'away', '19', 'C'),
      createPlayer(420, 140, 'away', '4', 'D'),
      createPlayer(440, 285, 'away', '6', 'D'),
    ],
  },
  {
    id: 'trap-122',
    title: '1-2-2 Neutral Zone Trap',
    subtitle: 'Steering F1 with 2-man neutral wall and backline defense',
    category: 'Systems',
    players: () => [
      // Away Trap Unit
      createPlayer(450, RINK.centerY, 'away', '19', 'C'),
      createPlayer(540, 130, 'away', '11', 'LW'),
      createPlayer(540, 295, 'away', '17', 'RW'),
      createPlayer(670, 150, 'away', '4', 'D'),
      createPlayer(670, 275, 'away', '6', 'D'),
      createPlayer(920, RINK.centerY, 'away', '1', 'G'),
      // Home Attack Unit
      createPlayer(320, RINK.centerY, 'home', '97', 'C', true),
      createPlayer(340, 90, 'home', '8', 'LW'),
      createPlayer(340, 335, 'home', '88', 'RW'),
      createPlayer(240, 140, 'home', '5', 'D'),
      createPlayer(240, 285, 'home', '2', 'D'),
    ],
  },
  {
    id: 'pp-umbrella',
    title: 'Umbrella Power Play',
    subtitle: 'High point quarterback with half-wall shooters and net-front screens',
    category: 'Special Teams',
    players: () => [
      // Home PP
      createPlayer(630, RINK.centerY, 'home', '5', 'D', true),
      createPlayer(740, 85, 'home', '8', 'LW'),
      createPlayer(740, 340, 'home', '88', 'RW'),
      createPlayer(875, 175, 'home', '19', 'C'),
      createPlayer(875, 250, 'home', '97', 'F'),
      // Away PK Diamond
      createPlayer(720, RINK.centerY, 'away', '11', 'C'),
      createPlayer(810, 150, 'away', '17', 'LW'),
      createPlayer(810, 275, 'away', '23', 'RW'),
      createPlayer(870, RINK.centerY, 'away', '4', 'D'),
      createPlayer(920, RINK.centerY, 'away', '1', 'G'),
    ],
  },
  {
    id: 'faceoff-dzone',
    title: 'D-Zone Faceoff Alignment',
    subtitle: 'Defensive box coverage inside circle defending home crease',
    category: 'Rush & Set Plays',
    initialPuck: { x: 205, y: 322.5 },
    players: () => [
      // Home Defending
      createPlayer(205, 315, 'home', '9', 'C'),
      createPlayer(130, 260, 'home', '4', 'D'),
      createPlayer(170, 380, 'home', '6', 'D'),
      createPlayer(225, 380, 'home', '13', 'LW'),
      createPlayer(265, 260, 'home', '18', 'RW'),
      createPlayer(80, RINK.centerY, 'home', '30', 'G'),
      // Away Attacking
      createPlayer(215, 330, 'away', '19', 'C'),
      createPlayer(220, 390, 'away', '11', 'LW'),
      createPlayer(240, 270, 'away', '17', 'RW'),
      createPlayer(350, 320, 'away', '2', 'D'),
      createPlayer(360, 160, 'away', '5', 'D'),
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
