// ============================================================================
// SMALL-AREA GAME TEMPLATES
//
// Battles, races and cross-ice games. Original first-party content.
//
// Most of these end on POSSESSION rather than on a shot, which is the whole
// point of the finish policy: a 2v2 in the corner is a complete drill when one
// team comes out with the puck, and bolting a shot onto the end of it
// misrepresents what the coach is teaching.
// ============================================================================

import { RINK_LANDMARKS as L, coneLine, gear, pass, pickup, route, shot, skater, template } from './builder';
import type { DrillTemplate } from './builder';

export const puckRaceToPossession: DrillTemplate = template({
  id: 'tpl-puck-race',
  title: 'Puck Race to Possession',
  summary:
    'Two players start level, race to a loose puck in the corner, and the winner has to come out with it.',
  categories: ['small-area-game', 'battle', 'conditioning'],
  tags: ['race', 'battle', 'corner'],
  ageBands: ['u9', 'u11', 'u13'],
  skillLevel: 'developing',
  rinkArea: 'quarter',
  durationMinutes: 6,
  equipmentSummary: ['pucks'],
  setupNotes: [
    'Two players on the goal line, one puck spotted in the corner.',
    'Coach calls go; the winner must carry it out past the dots.',
  ],
  coachingPoints: [
    'First three strides decide the race - stay low.',
    'Arrive with your body between the puck and your opponent.',
    'Protect it out of the corner, do not turn back into pressure.',
  ],
  progressions: ['Start both players facing the boards.'],
  variations: ['Winner must complete a pass instead of carrying it out.'],
  actors: [
    skater('r1', 'home', '9', { x: 120, y: 180 }),
    skater('r2', 'away', '9', { x: 120, y: 250 }),
  ],
  routes: [
    route('r1', [
      { x: 120, y: 180 },
      { x: 90, y: 90 },
      { x: 190, y: 110 },
    ]),
    route('r2', [
      { x: 120, y: 250 },
      { x: 100, y: 130 },
      { x: 200, y: 140 },
    ]),
  ],
  puck: { from: 'r1', actions: [pickup('r1', { at: 1.8 })] },
  finishPolicy: 'finish-with-possession',
});

export const cornerHalfWall2v1: DrillTemplate = template({
  id: 'tpl-corner-half-wall-2v1',
  title: 'Corner Half-Wall 2v1',
  summary: 'Two attackers work the half-wall against one defender to get a puck to the net front.',
  categories: ['small-area-game', 'battle', 'defensive-zone'],
  tags: ['half wall', '2v1', 'net front'],
  ageBands: ['u11', 'u13', 'u15'],
  skillLevel: 'developing',
  rinkArea: 'quarter',
  durationMinutes: 8,
  equipmentSummary: ['pucks', 'net'],
  setupNotes: [
    'Play below the top of the circle in one corner.',
    'Two attackers, one defender, live puck.',
  ],
  coachingPoints: [
    'The support player gets BELOW the puck, not level with it.',
    'Defender takes away the middle first, the wall second.',
    'Attack the net-front once the defender commits.',
  ],
  progressions: ['Add a second defender.'],
  variations: ['Attackers must complete two passes before shooting.'],
  actors: [
    skater('a1', 'home', '12', { x: 190, y: 330 }),
    skater('a2', 'home', '18', { x: 260, y: 250 }),
    skater('x1', 'away', '4', { x: 165, y: 250 }, 'D'),
    { kind: 'goalie' as const, id: 'gk', team: 'away' as const, number: '35', position: { x: 80, y: L.centreY } },
  ],
  routes: [
    route('a2', [
      { x: 260, y: 250 },
      { x: 200, y: 200 },
      { x: 140, y: 190 },
    ]),
  ],
  puck: {
    from: 'a1',
    actions: [pass('a1', 'a2', { at: 1.4 }), shot('a2', { at: 3.2, target: { x: 60, y: 212.5 } })],
  },
  finishPolicy: 'finish-with-shot',
});

export const crossIce2v1: DrillTemplate = template({
  id: 'tpl-cross-ice-2v1',
  title: 'Cross-Ice 2v1',
  summary: 'A 2v1 played across the width of the ice between the blue line and the goal line.',
  categories: ['small-area-game', 'transition'],
  tags: ['cross ice', '2v1', 'odd man'],
  ageBands: ['u9', 'u11', 'u13'],
  skillLevel: 'developing',
  rinkArea: 'third',
  durationMinutes: 10,
  equipmentSummary: ['2 mini-nets', 'pucks'],
  setupNotes: [
    'Two mini-nets against opposite boards in one end zone.',
    'Two attackers against one defender; next pair goes on the whistle.',
  ],
  coachingPoints: [
    'Attack in a wide lane; do not converge on the defender.',
    'The puck carrier drives the defender before releasing.',
    'Defender stays on the inside shoulder and takes the pass away.',
  ],
  progressions: ['Make it a 2v2.'],
  variations: ['One-touch finish only.'],
  actors: [
    skater('c1', 'home', '7', { x: 200, y: 380 }),
    skater('c2', 'home', '11', { x: 300, y: 350 }),
    skater('cd', 'away', '6', { x: 240, y: 230 }, 'D'),
  ],
  equipment: [
    gear('net-a', 'mini-net', { x: 230, y: 45 }, { label: 'Attack' }),
    gear('net-b', 'mini-net', { x: 230, y: 385 }, { label: 'Defend' }),
  ],
  routes: [
    route('c1', [
      { x: 200, y: 380 },
      { x: 180, y: 260 },
      { x: 200, y: 140 },
    ]),
    route('c2', [
      { x: 300, y: 350 },
      { x: 310, y: 220 },
      { x: 270, y: 120 },
    ]),
  ],
  puck: {
    from: 'c1',
    actions: [pass('c1', 'c2', { at: 2.0 }), shot('c2', { at: 4.0, target: { x: 230, y: 45 } })],
  },
  finishPolicy: 'finish-with-shot',
});

export const picketFences: DrillTemplate = template({
  id: 'tpl-picket-fences',
  title: 'Picket Fences 2v2',
  summary:
    'A 2v2 in a narrow lane bounded by cones, so players have to beat pressure rather than skate around it.',
  categories: ['small-area-game', 'battle', 'puck-handling'],
  tags: ['confined', '2v2', 'protection'],
  ageBands: ['u11', 'u13', 'u15'],
  skillLevel: 'advanced',
  rinkArea: 'quarter',
  durationMinutes: 8,
  equipmentSummary: ['8 cones', '2 mini-nets', 'pucks'],
  setupNotes: [
    'Two cone lines create a lane about a third of the ice wide.',
    'Play 2v2 inside the lane; a puck leaving the lane is a turnover.',
  ],
  coachingPoints: [
    'Protect with your back and hips, not just your stick.',
    'Support tight - there is no room to swing wide.',
    'Change the point of attack quickly.',
  ],
  progressions: ['Narrow the lane.', 'Make it 3v3.'],
  variations: ['Two-touch limit.'],
  actors: [
    skater('pf1', 'home', '10', { x: 180, y: 170 }),
    skater('pf2', 'home', '21', { x: 300, y: 200 }),
    skater('pf3', 'away', '10', { x: 240, y: 230 }),
    skater('pf4', 'away', '21', { x: 360, y: 190 }),
  ],
  equipment: [
    ...coneLine('lane-top', { x: 120, y: 130 }, { x: 420, y: 130 }, 4),
    ...coneLine('lane-bottom', { x: 120, y: 290 }, { x: 420, y: 290 }, 4),
  ],
  puck: {
    from: 'pf1',
    actions: [pass('pf1', 'pf2', { at: 1.2 }), pass('pf2', 'pf1', { at: 3.0 })],
  },
  finishPolicy: 'finish-with-possession',
});

export const threeOnThreeAddDefender: DrillTemplate = template({
  id: 'tpl-3v3-add-defender',
  title: '3v3 Add a Defender',
  summary:
    'A 3v2 that becomes a 3v3 the moment the extra defender joins, so attackers have a shrinking window.',
  categories: ['small-area-game', 'transition'],
  tags: ['3v3', 'odd man', 'urgency'],
  ageBands: ['u13', 'u15', 'u18'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 10,
  equipmentSummary: ['pucks', 'net'],
  setupNotes: [
    'Three attackers enter against two defenders.',
    'The third defender leaves the bench on the coach whistle.',
  ],
  coachingPoints: [
    'Attack before the numbers even up - hesitation is the drill.',
    'Get pucks to the net while the seam is open.',
    'Defenders communicate the late arrival.',
  ],
  progressions: ['Release the third defender earlier.'],
  variations: ['Add a backchecker instead of a defender.'],
  actors: [
    skater('t1', 'home', '13', { x: 480, y: 120 }),
    skater('t2', 'home', '16', { x: 500, y: 240 }),
    skater('t3', 'home', '24', { x: 460, y: 340 }),
    skater('td1', 'away', '2', { x: 700, y: 160 }, 'D'),
    skater('td2', 'away', '3', { x: 710, y: 280 }, 'D'),
    skater('td3', 'away', '8', { x: 620, y: 400 }, 'D'),
    { kind: 'goalie' as const, id: 'gk3', team: 'away' as const, number: '1', position: { x: 920, y: L.centreY } },
  ],
  routes: [
    route('t1', [
      { x: 480, y: 120 },
      { x: 640, y: 110 },
      { x: 780, y: 150 },
    ]),
    route('t2', [
      { x: 500, y: 240 },
      { x: 660, y: 230 },
      { x: 800, y: 220 },
    ]),
    route('t3', [
      { x: 460, y: 340 },
      { x: 620, y: 330 },
      { x: 760, y: 300 },
    ]),
    route('td3', [
      { x: 620, y: 400 },
      { x: 740, y: 340 },
    ]),
  ],
  puck: {
    from: 't2',
    actions: [pass('t2', 't1', { at: 1.6 }), pass('t1', 't3', { at: 3.4 }), shot('t3', { at: 5.2 })],
  },
  finishPolicy: 'finish-with-shot',
});

export const threeOnThreeEmptyNet: DrillTemplate = template({
  id: 'tpl-3v3-empty-net',
  title: '3v3 Empty-Net Transition',
  summary:
    'A continuous 3v3 with no goalies, so every turnover is instantly a chance the other way.',
  categories: ['small-area-game', 'transition', 'conditioning'],
  tags: ['3v3', 'no goalie', 'transition'],
  ageBands: ['u11', 'u13', 'u15', 'u18'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 12,
  equipmentSummary: ['2 mini-nets', 'pucks'],
  setupNotes: [
    'Mini-nets at each end of a half-ice surface, no goalies.',
    'Play continuous 90-second shifts.',
  ],
  coachingPoints: [
    'The first player back defends; do not argue about it.',
    'Score from in tight - there is no goalie to beat from distance.',
    'Turn defence into offence with one pass, not three.',
  ],
  progressions: ['Add a goalie at one end only.'],
  variations: ['Every goal must follow a completed pass.'],
  actors: [
    skater('e1', 'home', '5', { x: 300, y: 140 }),
    skater('e2', 'home', '15', { x: 380, y: 250 }),
    skater('e3', 'home', '25', { x: 260, y: 330 }),
    skater('f1', 'away', '5', { x: 560, y: 160 }),
    skater('f2', 'away', '15', { x: 620, y: 260 }),
    skater('f3', 'away', '25', { x: 540, y: 350 }),
  ],
  equipment: [
    gear('mn-1', 'mini-net', { x: 120, y: L.centreY }),
    gear('mn-2', 'mini-net', { x: 760, y: L.centreY }),
  ],
  routes: [
    route('e2', [
      { x: 380, y: 250 },
      { x: 500, y: 220 },
      { x: 620, y: 200 },
    ]),
  ],
  puck: {
    from: 'e1',
    actions: [pass('e1', 'e2', { at: 1.2 }), shot('e2', { at: 3.6, target: { x: 760, y: L.centreY } })],
  },
  finishPolicy: 'loop',
});

export const threeOnThreeRace: DrillTemplate = template({
  id: 'tpl-3v3-race',
  title: '3v3 Race Game',
  summary: 'Both trios start behind their own goal line and race to a puck spotted at centre.',
  categories: ['small-area-game', 'conditioning', 'battle'],
  tags: ['race', '3v3', 'first touch'],
  ageBands: ['u11', 'u13', 'u15'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 8,
  equipmentSummary: ['pucks', '2 mini-nets'],
  setupNotes: [
    'Both teams line up on their own goal line.',
    'Coach spots a puck at centre and calls go.',
  ],
  coachingPoints: [
    'Only one player races - the other two take lanes.',
    'Whoever loses the race becomes the first defender.',
  ],
  progressions: ['Spot two pucks.'],
  variations: ['Loser of the race must touch their own net before joining.'],
  actors: [
    skater('g1', 'home', '6', { x: 120, y: 150 }),
    skater('g2', 'home', '16', { x: 120, y: 220 }),
    skater('g3', 'home', '26', { x: 120, y: 290 }),
    skater('h1', 'away', '6', { x: 780, y: 150 }),
    skater('h2', 'away', '16', { x: 780, y: 220 }),
    skater('h3', 'away', '26', { x: 780, y: 290 }),
  ],
  routes: [
    route('g1', [
      { x: 120, y: 150 },
      { x: 320, y: 190 },
      { x: 470, y: 212 },
    ]),
    route('h1', [
      { x: 780, y: 150 },
      { x: 620, y: 190 },
      { x: 530, y: 212 },
    ]),
  ],
  puck: { from: 'g1', actions: [pickup('g1', { at: 2.4 }), pass('g1', 'g2', { at: 3.4 })] },
  finishPolicy: 'finish-with-possession',
});

export const tireTargetGame: DrillTemplate = template({
  id: 'tpl-tire-target',
  title: 'Tire Target Passing Game',
  summary: 'Teams score by hitting targets placed on the ice rather than by shooting on a net.',
  categories: ['small-area-game', 'passing', 'shooting'],
  tags: ['accuracy', 'targets', 'no goalie'],
  ageBands: ['u9', 'u11', 'u13'],
  skillLevel: 'beginner',
  rinkArea: 'quarter',
  durationMinutes: 8,
  equipmentSummary: ['4 tires or targets', 'pucks'],
  setupNotes: [
    'Place four targets around a quarter-ice box.',
    'A team scores by hitting a target with a pass, not a shot.',
  ],
  coachingPoints: [
    'Accuracy before power - a hard miss scores nothing.',
    'Look at the target before you release.',
    'Move after the pass to open the next angle.',
  ],
  progressions: ['Targets must be hit in order.'],
  variations: ['One-touch passes only.'],
  actors: [
    skater('tt1', 'home', '3', { x: 160, y: 160 }),
    skater('tt2', 'home', '14', { x: 320, y: 200 }),
    skater('tt3', 'away', '3', { x: 240, y: 300 }),
    skater('tt4', 'away', '14', { x: 380, y: 130 }),
  ],
  equipment: [
    gear('tire-1', 'tire', { x: 130, y: 90 }),
    gear('tire-2', 'tire', { x: 400, y: 90 }),
    gear('tire-3', 'tire', { x: 400, y: 330 }),
    gear('tire-4', 'tire', { x: 130, y: 330 }),
  ],
  puck: {
    from: 'tt1',
    actions: [pass('tt1', 'tt2', { at: 1.0 }), pass('tt2', 'tt1', { at: 2.8 })],
  },
  finishPolicy: 'stop-after-sequence',
});

export const SMALL_AREA_TEMPLATES: DrillTemplate[] = [
  puckRaceToPossession,
  cornerHalfWall2v1,
  crossIce2v1,
  picketFences,
  threeOnThreeAddDefender,
  threeOnThreeEmptyNet,
  threeOnThreeRace,
  tireTargetGame,
];
