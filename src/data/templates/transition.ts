// ============================================================================
// TRANSITION AND RUSH TEMPLATES
//
// Full-ice and half-ice drills about changing direction with the puck.
// Original first-party content.
//
// Several of these are multi-segment by nature - skate, receive, pivot, go
// again - which the old one-route-per-player model could not represent at all.
// ============================================================================

import { RINK_LANDMARKS as L, gear, pass, route, shot, skater, template } from './builder';
import type { DrillTemplate } from './builder';

const awayGoalie = {
  kind: 'goalie' as const,
  id: 'gkr',
  team: 'away' as const,
  number: '1',
  position: { x: 920, y: L.centreY },
};

const homeGoalie = {
  kind: 'goalie' as const,
  id: 'gkl',
  team: 'home' as const,
  number: '30',
  position: { x: 80, y: L.centreY },
};

export const twoOnTwoRushBackcheck: DrillTemplate = template({
  id: 'tpl-2v2-rush-backcheck',
  title: '2v2 Rush and Backcheck',
  summary:
    'Two attackers leave on a 2v0, and two backcheckers are released a beat later to hunt them down.',
  categories: ['transition', 'rush', 'conditioning'],
  tags: ['backcheck', '2v2', 'full ice'],
  ageBands: ['u13', 'u15', 'u18'],
  skillLevel: 'developing',
  rinkArea: 'full',
  durationMinutes: 10,
  equipmentSummary: ['pucks', 'nets'],
  setupNotes: [
    'Attackers start at the near blue line, backcheckers at the goal line.',
    'Coach releases the backcheckers one whistle after the rush leaves.',
  ],
  coachingPoints: [
    'Attack the middle of the ice before the backcheck arrives.',
    'Backcheckers take the inside lane, not the puck.',
    'Shoot on the first look; the window is closing.',
  ],
  progressions: ['Release the backcheck earlier.'],
  variations: ['Backcheckers must touch the far blue line first.'],
  actors: [
    skater('ra', 'home', '11', { x: 340, y: 150 }),
    skater('rb', 'home', '19', { x: 340, y: 280 }),
    skater('bc1', 'away', '21', { x: 120, y: 170 }),
    skater('bc2', 'away', '22', { x: 120, y: 260 }),
    awayGoalie,
  ],
  routes: [
    route('ra', [
      { x: 340, y: 150 },
      { x: 560, y: 130 },
      { x: 760, y: 160 },
      { x: 850, y: 190 },
    ]),
    route('rb', [
      { x: 340, y: 280 },
      { x: 570, y: 300 },
      { x: 780, y: 270 },
    ]),
    route('bc1', [
      { x: 120, y: 170 },
      { x: 420, y: 180 },
      { x: 700, y: 200 },
    ]),
    route('bc2', [
      { x: 120, y: 260 },
      { x: 430, y: 265 },
      { x: 690, y: 250 },
    ]),
  ],
  puck: {
    from: 'ra',
    actions: [pass('ra', 'rb', { at: 2.0 }), pass('rb', 'ra', { at: 4.4 }), shot('ra', { at: 6.6 })],
  },
  finishPolicy: 'finish-with-shot',
});

export const twoOnTwoTransition: DrillTemplate = template({
  id: 'tpl-2v2-transition',
  title: '2v2 Transition Game',
  summary: 'A 2v2 where possession changing hands sends both pairs the other way immediately.',
  categories: ['transition', 'small-area-game'],
  tags: ['2v2', 'transition', 'continuous'],
  ageBands: ['u13', 'u15', 'u18'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  equipmentSummary: ['pucks', '2 nets'],
  setupNotes: [
    'Half ice, nets at both ends, two pairs on the ice.',
    'On a turnover, play continues the other way with no reset.',
  ],
  coachingPoints: [
    'Do not admire the turnover - go.',
    'The far player stretches; the near player supports.',
    'Defend with your feet, not your reach.',
  ],
  progressions: ['Add a third attacker on the whistle.'],
  variations: ['Two-pass minimum before a shot.'],
  actors: [
    skater('ta', 'home', '9', { x: 420, y: 160 }),
    skater('tb', 'home', '29', { x: 460, y: 300 }),
    skater('ua', 'away', '9', { x: 680, y: 180 }),
    skater('ub', 'away', '29', { x: 700, y: 290 }),
    awayGoalie,
  ],
  routes: [
    route('ta', [
      { x: 420, y: 160 },
      { x: 600, y: 140 },
      { x: 760, y: 180 },
    ]),
    route('tb', [
      { x: 460, y: 300 },
      { x: 640, y: 310 },
      { x: 790, y: 270 },
    ]),
  ],
  puck: {
    from: 'ta',
    actions: [pass('ta', 'tb', { at: 1.8 }), shot('tb', { at: 4.2 })],
  },
  finishPolicy: 'loop',
});

export const turnAndBurn: DrillTemplate = template({
  id: 'tpl-turn-and-burn',
  title: 'Turn and Burn',
  summary:
    'A player skates hard to a cone, pivots to face back up ice, receives, and attacks the other way.',
  categories: ['transition', 'skating', 'puck-handling'],
  tags: ['pivot', 'change of direction', 'first three strides'],
  ageBands: ['u11', 'u13', 'u15'],
  skillLevel: 'developing',
  rinkArea: 'full',
  durationMinutes: 8,
  equipmentSummary: ['2 cones', 'pucks'],
  setupNotes: [
    'One cone at each blue line.',
    'Skate hard to the cone, pivot, take the pass, attack.',
  ],
  coachingPoints: [
    'Pivot without gliding - keep the feet moving through the turn.',
    'Present your stick as a target before you have finished turning.',
    'Explode out of the pivot; do not coast into the pass.',
  ],
  progressions: ['Pivot the other way.'],
  variations: ['Two pivots before the pass.'],
  actors: [
    skater('tb1', 'home', '17', { x: 160, y: 212 }),
    skater('feed', 'home', '44', { x: 200, y: 380 }),
    awayGoalie,
  ],
  equipment: [
    gear('cone-a', 'cone', { x: L.blueLineLeft, y: 212 }),
    gear('cone-b', 'cone', { x: L.blueLineRight, y: 212 }),
  ],
  routes: [
    route('tb1', [
      { x: 160, y: 212 },
      { x: 300, y: 190 },
      { x: L.blueLineLeft, y: 200 },
    ], { durationSeconds: 3 }),
    route('tb1', [
      { x: L.blueLineLeft, y: 200 },
      { x: 560, y: 230 },
      { x: 760, y: 210 },
      { x: 850, y: 200 },
    ], { movement: 'forward' }),
  ],
  puck: {
    from: 'feed',
    actions: [pass('feed', 'tb1', { at: 3.0 }), shot('tb1', { at: 7.0 })],
  },
  finishPolicy: 'finish-with-shot',
});

export const threeOnTwoRaceToFive: DrillTemplate = template({
  id: 'tpl-3v2-race-to-five',
  title: '3v2 Race to Five',
  summary: 'Continuous 3v2 rushes both directions, first team to five goals.',
  categories: ['transition', 'rush', 'conditioning'],
  tags: ['3v2', 'odd man', 'continuous'],
  ageBands: ['u13', 'u15', 'u18'],
  skillLevel: 'advanced',
  rinkArea: 'full',
  durationMinutes: 14,
  equipmentSummary: ['pucks', '2 nets'],
  setupNotes: [
    'Three attackers leave one end against two defenders at the far blue line.',
    'On a whistle or a goal, three new attackers leave the other way.',
  ],
  coachingPoints: [
    'Wide lanes force the defenders apart.',
    'The middle drive is a decoy as often as an option.',
    'Defenders stay between the dots and let the goalie see it.',
  ],
  progressions: ['Add a late backchecker.'],
  variations: ['No shots from outside the dots.'],
  actors: [
    skater('ma', 'home', '10', { x: 260, y: 120 }),
    skater('mb', 'home', '20', { x: 240, y: 220 }),
    skater('mc', 'home', '30', { x: 260, y: 330 }),
    skater('nd1', 'away', '4', { x: 640, y: 170 }, 'D'),
    skater('nd2', 'away', '5', { x: 640, y: 270 }, 'D'),
    awayGoalie,
  ],
  routes: [
    route('ma', [
      { x: 260, y: 120 },
      { x: 520, y: 100 },
      { x: 760, y: 140 },
    ]),
    route('mb', [
      { x: 240, y: 220 },
      { x: 500, y: 215 },
      { x: 720, y: 215 },
    ]),
    route('mc', [
      { x: 260, y: 330 },
      { x: 520, y: 340 },
      { x: 780, y: 300 },
    ]),
  ],
  puck: {
    from: 'mb',
    actions: [pass('mb', 'ma', { at: 2.2 }), pass('ma', 'mc', { at: 4.6 }), shot('mc', { at: 6.8 })],
  },
  finishPolicy: 'finish-with-shot',
});

export const quickTransition3v1: DrillTemplate = template({
  id: 'tpl-quick-transition-3v1',
  title: 'Quick Transition 3v1',
  summary: 'Three attackers move quickly against a single retreating defender.',
  categories: ['transition', 'rush'],
  tags: ['3v1', 'speed', 'support'],
  ageBands: ['u9', 'u11', 'u13'],
  skillLevel: 'beginner',
  rinkArea: 'half',
  durationMinutes: 8,
  equipmentSummary: ['pucks', 'net'],
  setupNotes: [
    'Three attackers start at centre, one defender at the top of the circles.',
    'Attack with speed; the defender may only retreat.',
  ],
  coachingPoints: [
    'Two quick passes beat one long one.',
    'Stay wide until the defender commits.',
    'Somebody goes to the net every time.',
  ],
  progressions: ['Make it a 3v2.'],
  variations: ['No passing in the last ten metres.'],
  actors: [
    skater('qa', 'home', '8', { x: 500, y: 130 }),
    skater('qb', 'home', '18', { x: 520, y: 230 }),
    skater('qc', 'home', '28', { x: 500, y: 330 }),
    skater('qd', 'away', '2', { x: 740, y: 220 }, 'D'),
    awayGoalie,
  ],
  routes: [
    route('qa', [
      { x: 500, y: 130 },
      { x: 700, y: 120 },
      { x: 840, y: 165 },
    ]),
    route('qb', [
      { x: 520, y: 230 },
      { x: 700, y: 225 },
      { x: 810, y: 215 },
    ]),
    route('qc', [
      { x: 500, y: 330 },
      { x: 700, y: 330 },
      { x: 830, y: 280 },
    ]),
  ],
  puck: {
    from: 'qb',
    actions: [pass('qb', 'qc', { at: 1.4 }), pass('qc', 'qa', { at: 3.2 }), shot('qa', { at: 5.0 })],
  },
  finishPolicy: 'finish-with-shot',
});

export const quickReads2v1: DrillTemplate = template({
  id: 'tpl-quick-reads-2v1',
  title: 'Quick Reads 2v1',
  summary:
    'A 2v1 where the defender chooses to play the puck or the pass, and the attackers must read it.',
  categories: ['transition', 'rush'],
  tags: ['2v1', 'reads', 'decision'],
  ageBands: ['u11', 'u13', 'u15'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 9,
  equipmentSummary: ['pucks', 'net'],
  setupNotes: [
    'Two attackers, one defender, starting from the far blue line.',
    'The defender is told secretly whether to play the puck or the pass.',
  ],
  coachingPoints: [
    'Read the defender stick, not their body.',
    'If they take the pass, drive and shoot.',
    'If they take the puck, move it early.',
  ],
  progressions: ['Defender may choose freely.'],
  variations: ['Attackers must cross once before the blue line.'],
  actors: [
    skater('k1', 'home', '12', { x: 480, y: 160 }),
    skater('k2', 'home', '22', { x: 470, y: 290 }),
    skater('kd', 'away', '7', { x: 700, y: 225 }, 'D'),
    awayGoalie,
  ],
  routes: [
    route('k1', [
      { x: 480, y: 160 },
      { x: 660, y: 150 },
      { x: 820, y: 185 },
    ]),
    route('k2', [
      { x: 470, y: 290 },
      { x: 660, y: 295 },
      { x: 800, y: 260 },
    ]),
  ],
  puck: {
    from: 'k1',
    actions: [pass('k1', 'k2', { at: 2.0 }), shot('k2', { at: 4.4 })],
  },
  finishPolicy: 'finish-with-shot',
});

export const quickBackcheck: DrillTemplate = template({
  id: 'tpl-quick-backcheck',
  title: 'Quick Backcheck',
  summary: 'A single attacker breaks out while a backchecker chases from behind the net.',
  categories: ['transition', 'conditioning'],
  tags: ['backcheck', '1v1', 'angle'],
  ageBands: ['u11', 'u13', 'u15'],
  skillLevel: 'developing',
  rinkArea: 'full',
  durationMinutes: 7,
  equipmentSummary: ['pucks', 'nets'],
  setupNotes: [
    'Attacker starts with a puck at the near hash marks.',
    'Backchecker starts behind their own net and chases.',
  ],
  coachingPoints: [
    'Take the inside lane, not the shortest one.',
    'Stick on the puck side, body between them and the middle.',
    'Attacker protects the puck to the outside.',
  ],
  progressions: ['Give the backchecker a longer head start.'],
  variations: ['Add a second attacker joining late.'],
  actors: [
    skater('ba', 'home', '14', { x: 220, y: 300 }),
    skater('bb', 'away', '24', { x: 110, y: 260 }),
    awayGoalie,
    homeGoalie,
  ],
  routes: [
    route('ba', [
      { x: 220, y: 300 },
      { x: 480, y: 260 },
      { x: 720, y: 230 },
      { x: 860, y: 220 },
    ]),
    route('bb', [
      { x: 110, y: 260 },
      { x: 400, y: 230 },
      { x: 680, y: 210 },
      { x: 810, y: 210 },
    ]),
  ],
  puck: { from: 'ba', actions: [shot('ba', { at: 6.0 })] },
  finishPolicy: 'finish-with-shot',
});

export const oneOnOneFullIce: DrillTemplate = template({
  id: 'tpl-1v1-full-ice',
  title: '1v1 Full-Ice',
  summary: 'A full-length 1v1 where the defender must gap up rather than retreat to the net.',
  categories: ['transition', 'battle', 'defensive-zone'],
  tags: ['1v1', 'gap control', 'full ice'],
  ageBands: ['u13', 'u15', 'u18'],
  skillLevel: 'advanced',
  rinkArea: 'full',
  durationMinutes: 9,
  equipmentSummary: ['pucks', 'nets'],
  setupNotes: [
    'Attacker starts behind their own net with a puck.',
    'Defender starts at the far blue line and must close the gap.',
  ],
  coachingPoints: [
    'Close the gap at the red line, not in your own zone.',
    'Stay square as long as possible before turning.',
    'Attacker changes speed at least once.',
  ],
  progressions: ['Defender starts skating backwards from the goal line.'],
  variations: ['Attacker must beat the defender wide.'],
  actors: [
    skater('oa', 'home', '27', { x: 100, y: 240 }),
    skater('od', 'away', '3', { x: L.blueLineRight, y: 212 }, 'D'),
    awayGoalie,
  ],
  routes: [
    route('oa', [
      { x: 100, y: 240 },
      { x: 320, y: 200 },
      { x: 560, y: 240 },
      { x: 790, y: 200 },
    ]),
    route('od', [
      { x: L.blueLineRight, y: 212 },
      { x: 540, y: 212 },
      { x: 700, y: 215 },
      { x: 820, y: 212 },
    ], { movement: 'backward' }),
  ],
  puck: { from: 'oa', actions: [shot('oa', { at: 7.2 })] },
  finishPolicy: 'finish-with-shot',
});

export const TRANSITION_TEMPLATES: DrillTemplate[] = [
  twoOnTwoRushBackcheck,
  twoOnTwoTransition,
  turnAndBurn,
  threeOnTwoRaceToFive,
  quickTransition3v1,
  quickReads2v1,
  quickBackcheck,
  oneOnOneFullIce,
];
