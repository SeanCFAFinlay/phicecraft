// ============================================================================
// PLAY FORMATIONS & PRESETS
//
// Instant tactical setups for coaches. Placing 10 players manually into a
// 1-3-1 Power Play, 4v5 Box, or 5v5 Breakout takes 2 minutes of tedious
// tapping. These presets deploy canonical tactical formations in a single tap.
// ============================================================================

import type { Player, Point, DrillSettings, CoachingDetails } from '@/core/types';
import { RINK } from '@/core/constants';
import { createPlayer, createSkatePath } from './drill';
import { generateId } from '@/utils/id';
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[0].id, 'home', [{ x: 650, y: RINK.centerY }, { x: 670, y: 175 }]),
        createSkatePath(players[1].id, 'home', [{ x: 740, y: 90 }, { x: 760, y: 125 }]),
        createSkatePath(players[3].id, 'home', [{ x: 780, y: RINK.centerY }, { x: 795, y: 205 }]),
        createSkatePath(players[7].id, 'away', [{ x: 845, y: 150 }, { x: 855, y: 165 }], 'backward'),
        createSkatePath(players[8].id, 'away', [{ x: 845, y: 275 }, { x: 855, y: 260 }], 'backward'),
      ],
      events: [
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[0].id,
          toPlayerId: players[1].id,
          fromPoint: { x: 650, y: RINK.centerY },
          toPoint: { x: 750, y: 110 },
          at: 0.18,
          arrivalAt: 0.35,
        },
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[1].id,
          toPlayerId: players[3].id,
          fromPoint: { x: 760, y: 125 },
          toPoint: { x: 795, y: 205 },
          at: 0.48,
          arrivalAt: 0.62,
        },
        {
          id: generateId(),
          type: 'shot',
          team: 'home',
          fromPlayerId: players[3].id,
          fromPoint: { x: 795, y: 205 },
          toPoint: { x: RINK.netRightX, y: RINK.netRightY },
          targetNet: 'R',
          at: 0.72,
          arrivalAt: 0.86,
        },
      ],
    }),
    coaching: {
      objective: '1-3-1 Umbrella rotation: Point quarterback distributes to half-wall, quick seam pass to bumper in slot for one-timer.',
      cues: [
        'Point QB walks line to pull top penalty killer out of lane',
        'Half-wall delivers quick, flat pass into bumper stick pocket',
        'Net-front forward creates visual screen in front of goalie',
      ].join(' • '),
    },
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[2].id, 'home', [{ x: 155, y: 150 }, { x: 140, y: 165 }], 'backward'),
        createSkatePath(players[3].id, 'home', [{ x: 155, y: 275 }, { x: 140, y: 260 }], 'backward'),
        createSkatePath(players[0].id, 'home', [{ x: 270, y: 155 }, { x: 280, y: 135 }]),
        createSkatePath(players[6].id, 'away', [{ x: 260, y: 90 }, { x: 280, y: 110 }]),
        createSkatePath(players[5].id, 'away', [{ x: 350, y: RINK.centerY }, { x: 335, y: 180 }]),
      ],
      events: [
        {
          id: generateId(),
          type: 'pass',
          team: 'away',
          fromPlayerId: players[6].id,
          toPlayerId: players[5].id,
          fromPoint: { x: 260, y: 90 },
          toPoint: { x: 340, y: 195 },
          at: 0.22,
          arrivalAt: 0.40,
        },
        {
          id: generateId(),
          type: 'shot',
          team: 'away',
          fromPlayerId: players[5].id,
          fromPoint: { x: 335, y: 180 },
          toPoint: { x: RINK.netLeftX, y: RINK.netLeftY },
          targetNet: 'L',
          at: 0.65,
          arrivalAt: 0.82,
        },
      ],
    }),
    coaching: {
      objective: '4v5 Penalty kill box: collapse into slot protection, block passing lanes and contest point shots.',
      cues: [
        'Defensemen skate backward maintaining crease perimeter',
        'Forwards pressure the flanks while preventing slot seams',
        'Goalie tracks point release through screen',
      ].join(' • '),
    },
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[0].id, 'home', [
          { x: 120, y: 90 },
          { x: 80, y: 140 },
          { x: 75, y: RINK.centerY },
          { x: 105, y: 270 },
          { x: 145, y: 305 },
        ]),
        createSkatePath(players[2].id, 'home', [
          { x: 220, y: RINK.centerY },
          { x: 195, y: 255 },
          { x: 230, y: 305 },
        ]),
        createSkatePath(players[4].id, 'home', [
          { x: 400, y: 320 },
          { x: 470, y: 310 },
        ]),
        createSkatePath(players[6].id, 'away', [
          { x: 180, y: 125 },
          { x: 135, y: 135 },
          { x: 95, y: 180 },
        ]),
      ],
      events: [
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[0].id,
          toPlayerId: players[2].id,
          fromPoint: { x: 105, y: 270 },
          toPoint: { x: 215, y: 285 },
          at: 0.42,
          arrivalAt: 0.58,
        },
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[2].id,
          toPlayerId: players[4].id,
          fromPoint: { x: 230, y: 305 },
          toPoint: { x: 440, y: 315 },
          at: 0.72,
          arrivalAt: 0.88,
        },
      ],
    }),
    coaching: {
      objective: 'Wheel breakout under pressure: D1 wheels behind net, dishes to supporting center who transitions to weak-side winger.',
      cues: [
        'D1 checks shoulder before retrieval to confirm wheel option',
        'Center swings low and maintains puck-facing support',
        'Wingers provide reliable wall release options',
      ].join(' • '),
    },
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[0].id, 'home', [{ x: 510, y: 110 }, { x: 670, y: 115 }, { x: 750, y: 135 }]),
        createSkatePath(players[1].id, 'home', [{ x: 490, y: RINK.centerY }, { x: 650, y: RINK.centerY }, { x: 775, y: 205 }]),
        createSkatePath(players[2].id, 'home', [{ x: 480, y: 315 }, { x: 640, y: 305 }, { x: 765, y: 285 }]),
        createSkatePath(players[3].id, 'away', [{ x: 680, y: 165 }, { x: 760, y: 175 }, { x: 840, y: 185 }], 'backward'),
        createSkatePath(players[4].id, 'away', [{ x: 680, y: 260 }, { x: 760, y: 250 }, { x: 840, y: 240 }], 'backward'),
      ],
      events: [
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[0].id,
          toPlayerId: players[1].id,
          fromPoint: { x: 670, y: 115 },
          toPoint: { x: 715, y: RINK.centerY },
          at: 0.36,
          arrivalAt: 0.50,
        },
        {
          id: generateId(),
          type: 'shot',
          team: 'home',
          fromPlayerId: players[1].id,
          fromPoint: { x: 775, y: 205 },
          toPoint: { x: RINK.netRightX, y: RINK.netRightY },
          targetNet: 'R',
          at: 0.72,
          arrivalAt: 0.86,
        },
      ],
    }),
    coaching: {
      objective: 'Mid-lane drive entry: LW carries wide to push defenders back, dishes to center driving slot for quick snap shot.',
      cues: [
        'LW maintains wide lane entry and keeps head up',
        'Defending pair retreats backward with tight 1.5-stick gap control',
        'C drives slot hard to back defenders into crease',
        'RW fills weakside lane for rebound coverage',
      ].join(' • '),
    },
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[0].id, 'home', [{ x: 520, y: 130 }, { x: 660, y: 140 }, { x: 760, y: 170 }]),
        createSkatePath(players[1].id, 'home', [{ x: 500, y: 295 }, { x: 650, y: 285 }, { x: 760, y: 255 }]),
        createSkatePath(players[2].id, 'away', [{ x: 690, y: RINK.centerY }, { x: 770, y: RINK.centerY }, { x: 845, y: RINK.centerY }], 'backward'),
      ],
      events: [
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[0].id,
          toPlayerId: players[1].id,
          fromPoint: { x: 660, y: 140 },
          toPoint: { x: 710, y: 270 },
          at: 0.38,
          arrivalAt: 0.52,
        },
        {
          id: generateId(),
          type: 'shot',
          team: 'home',
          fromPlayerId: players[1].id,
          fromPoint: { x: 760, y: 255 },
          toPoint: { x: RINK.netRightX, y: RINK.netRightY },
          targetNet: 'R',
          at: 0.74,
          arrivalAt: 0.88,
        },
      ],
    }),
    coaching: {
      objective: 'Odd-man 2v1 rush: carrier forces lone defenseman to commit before saucer pass across the slot for one-timer.',
      cues: [
        'Defenseman skates backward in mid-slot playing pass lane with active stick',
        'Carrier attacks defender triangle to freeze feet',
        'Weak-side winger stays on tape ready for one-timer shot',
      ].join(' • '),
    },
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[0].id, 'home', [{ x: 120, y: 100 }, { x: 80, y: 145 }, { x: 85, y: RINK.centerY }]),
        createSkatePath(players[6].id, 'away', [{ x: 190, y: 135 }, { x: 135, y: 125 }, { x: 95, y: 165 }]),
        createSkatePath(players[7].id, 'away', [{ x: 220, y: 290 }, { x: 200, y: 315 }]),
        createSkatePath(players[9].id, 'away', [{ x: 420, y: 140 }, { x: 450, y: 145 }], 'backward'),
        createSkatePath(players[10].id, 'away', [{ x: 440, y: 285 }, { x: 470, y: 280 }], 'backward'),
      ],
      events: [
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[0].id,
          toPlayerId: players[2].id,
          fromPoint: { x: 85, y: RINK.centerY },
          toPoint: { x: 200, y: RINK.centerY },
          at: 0.45,
          arrivalAt: 0.65,
        },
      ],
    }),
    coaching: {
      objective: '2-1-2 Aggressive forecheck: F1 pressures puck carrier behind net, F2 seals wall, F3 locks high slot.',
      cues: [
        'F1 steers carrier to back of net with stick on puck',
        'F2 reads breakout pass and pinches along the boards',
        'Defensemen retreat backward maintaining blue line gap',
      ].join(' • '),
    },
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[6].id, 'home', [{ x: 320, y: RINK.centerY }, { x: 440, y: 190 }, { x: 520, y: 155 }]),
        createSkatePath(players[0].id, 'away', [{ x: 450, y: RINK.centerY }, { x: 480, y: 180 }]),
        createSkatePath(players[3].id, 'away', [{ x: 670, y: 150 }, { x: 730, y: 155 }], 'backward'),
        createSkatePath(players[4].id, 'away', [{ x: 670, y: 275 }, { x: 730, y: 270 }], 'backward'),
      ],
      events: [
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[6].id,
          toPlayerId: players[7].id,
          fromPoint: { x: 520, y: 155 },
          toPoint: { x: 380, y: 100 },
          at: 0.45,
          arrivalAt: 0.65,
        },
      ],
    }),
    coaching: {
      objective: '1-2-2 Neutral zone trap: F1 steers carrier toward the boards, neutral wall denies center ice entry.',
      cues: [
        'F1 angles carrier to designated side with active stick',
        'Mid-wall wings seal passing lanes across red line',
        'Defensemen skate backward maintaining tight neutral zone gap',
      ].join(' • '),
    },
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[0].id, 'home', [{ x: 630, y: RINK.centerY }, { x: 650, y: 260 }]),
        createSkatePath(players[2].id, 'home', [{ x: 740, y: 340 }, { x: 770, y: 310 }]),
        createSkatePath(players[8].id, 'away', [{ x: 870, y: RINK.centerY }, { x: 885, y: RINK.centerY }], 'backward'),
      ],
      events: [
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[0].id,
          toPlayerId: players[2].id,
          fromPoint: { x: 630, y: RINK.centerY },
          toPoint: { x: 755, y: 325 },
          at: 0.22,
          arrivalAt: 0.42,
        },
        {
          id: generateId(),
          type: 'shot',
          team: 'home',
          fromPlayerId: players[2].id,
          fromPoint: { x: 770, y: 310 },
          toPoint: { x: RINK.netRightX, y: RINK.netRightY },
          targetNet: 'R',
          at: 0.68,
          arrivalAt: 0.84,
        },
      ],
    }),
    coaching: {
      objective: 'Overload umbrella power play: work the strong-side half-wall to set up cross-ice one-timer.',
      cues: [
        'Point QB distributes cleanly to shooting flank',
        'Half-wall winger steps into circle for high-danger release',
        'Net-front battles for screen and deflection',
      ].join(' • '),
    },
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[1].id, 'home', [{ x: 130, y: 260 }, { x: 125, y: 310 }]),
        createSkatePath(players[4].id, 'home', [{ x: 265, y: 260 }, { x: 310, y: 260 }]),
      ],
      events: [
        {
          id: generateId(),
          type: 'pickup',
          team: 'home',
          fromPlayerId: players[0].id,
          fromPoint: { x: 205, y: 322.5 },
          toPoint: { x: 205, y: 315 },
          at: 0.05,
          arrivalAt: 0.12,
        },
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[0].id,
          toPlayerId: players[1].id,
          fromPoint: { x: 205, y: 315 },
          toPoint: { x: 125, y: 300 },
          at: 0.22,
          arrivalAt: 0.42,
        },
      ],
    }),
    coaching: {
      objective: 'Defensive zone faceoff breakout: Center ties up or wins draw to corner defenseman for clean wall exit.',
      cues: [
        'Center prioritizes winning puck to strong-side corner',
        'Defenseman retrieves cleanly and hits winger on tape',
        'Weak-side wing curls for center ice support',
      ].join(' • '),
    },
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
    sequence: players => ({
      skatePaths: [
        createSkatePath(players[3].id, 'home', [{ x: 650, y: 320 }, { x: 670, y: 280 }]),
        createSkatePath(players[1].id, 'home', [{ x: 820, y: 260 }, { x: 855, y: 240 }]),
      ],
      events: [
        {
          id: generateId(),
          type: 'pickup',
          team: 'home',
          fromPlayerId: players[0].id,
          fromPoint: { x: 795, y: 322.5 },
          toPoint: { x: 790, y: 315 },
          at: 0.05,
          arrivalAt: 0.12,
        },
        {
          id: generateId(),
          type: 'pass',
          team: 'home',
          fromPlayerId: players[0].id,
          toPlayerId: players[3].id,
          fromPoint: { x: 790, y: 315 },
          toPoint: { x: 665, y: 290 },
          at: 0.20,
          arrivalAt: 0.42,
        },
        {
          id: generateId(),
          type: 'shot',
          team: 'home',
          fromPlayerId: players[3].id,
          fromPoint: { x: 670, y: 280 },
          toPoint: { x: RINK.netRightX, y: RINK.netRightY },
          targetNet: 'R',
          at: 0.65,
          arrivalAt: 0.82,
        },
      ],
    }),
    coaching: {
      objective: 'Offensive zone faceoff set play: Center wins draw back to point defenseman for screen shot.',
      cues: [
        'Center wins puck cleanly to shooting defenseman',
        'Point walks blue line to open shooting lane',
        'Wingers drive net for screen and rebound',
      ].join(' • '),
    },
  },
] as const;

export function getFormationPreset(preset: PlayFormationPreset): FormationPresetDefinition {
  const match = FORMATION_PRESETS.find(item => item.id === preset);
  if (!match) throw new Error(`Unknown formation preset: ${preset}`);
  return match;
}
