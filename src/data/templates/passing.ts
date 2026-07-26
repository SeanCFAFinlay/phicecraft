// ============================================================================
// PASSING AND WARM-UP TEMPLATES
//
// Original first-party drills. The names in the market review are a starting
// list, not content to copy: every diagram, setup note and coaching point here
// is written for this product.
//
// These are the drills the old four-pass cap and the compulsory finishing shot
// made impossible to author honestly - continuous patterns, one-touch chains,
// and warm-ups that end when the sequence does rather than at a net.
// ============================================================================

import { RINK_LANDMARKS as L, coneLine, gear, pass, route, shot, skater, template } from './builder';
import type { DrillTemplate } from './builder';

export const getOpenPassingGame: DrillTemplate = template({
  id: 'tpl-get-open-passing',
  title: 'Get Open Passing Game',
  summary:
    'Four players keep the puck moving in a small box, with the rule that nobody may pass to the player who just passed to them.',
  categories: ['passing', 'warm-up', 'small-area-game'],
  tags: ['support', 'head up', 'no goalie'],
  ageBands: ['u9', 'u11', 'u13'],
  skillLevel: 'developing',
  rinkArea: 'quarter',
  durationMinutes: 6,
  equipmentSummary: ['4 cones', 'pucks'],
  setupNotes: [
    'Mark a box roughly from the goal line to the top of the circle with four cones.',
    'Four players inside, one puck to start.',
    'No goalie and no net: this is about support, not finishing.',
  ],
  coachingPoints: [
    'Move to a new passing lane the moment you release the puck.',
    'Receive on the far stick blade so the next pass is already lined up.',
    'Head up before the puck arrives, not after.',
  ],
  progressions: ['Add a second puck once the pattern is clean.', 'One touch only.'],
  variations: ['Add a passive defender in the middle.'],
  actors: [
    skater('p1', 'home', '1', { x: 120, y: 120 }),
    skater('p2', 'home', '2', { x: 300, y: 110 }),
    skater('p3', 'home', '3', { x: 310, y: 320 }),
    skater('p4', 'home', '4', { x: 130, y: 310 }),
  ],
  equipment: [
    gear('c1', 'cone', { x: 90, y: 80 }),
    gear('c2', 'cone', { x: 340, y: 80 }),
    gear('c3', 'cone', { x: 340, y: 350 }),
    gear('c4', 'cone', { x: 90, y: 350 }),
  ],
  routes: [
    route('p1', [
      { x: 120, y: 120 },
      { x: 190, y: 190 },
    ]),
    route('p2', [
      { x: 300, y: 110 },
      { x: 250, y: 210 },
    ]),
    route('p3', [
      { x: 310, y: 320 },
      { x: 230, y: 300 },
    ]),
    route('p4', [
      { x: 130, y: 310 },
      { x: 170, y: 250 },
    ]),
  ],
  puck: {
    from: 'p1',
    actions: [pass('p1', 'p3'), pass('p3', 'p2'), pass('p2', 'p4'), pass('p4', 'p1')],
  },
  finishPolicy: 'loop',
});

export const oneTouchWarmUp: DrillTemplate = template({
  id: 'tpl-one-touch-warm-up',
  title: 'One-Touch Passing Warm-Up',
  summary: 'A five-player chain across the neutral zone where every puck is moved on first touch.',
  categories: ['passing', 'warm-up'],
  tags: ['one touch', 'quick hands', 'neutral zone'],
  ageBands: ['u11', 'u13', 'u15', 'u18'],
  skillLevel: 'advanced',
  rinkArea: 'third',
  durationMinutes: 5,
  equipmentSummary: ['pucks'],
  setupNotes: [
    'Five players spread across the neutral zone, roughly ten metres apart.',
    'Start slowly and only add pace once nobody is stopping the puck.',
  ],
  coachingPoints: [
    'Angle the blade rather than swinging at it.',
    'Call for the puck before it leaves the passer.',
    'Feet keep moving between touches.',
  ],
  progressions: ['Two pucks moving in opposite directions.'],
  variations: ['Allow one control touch for younger groups.'],
  actors: [
    skater('a', 'home', '1', { x: 380, y: 110 }),
    skater('b', 'home', '2', { x: 460, y: 300 }),
    skater('c', 'home', '3', { x: 540, y: 110 }),
    skater('d', 'home', '4', { x: 620, y: 300 }),
    skater('e', 'home', '5', { x: 690, y: 150 }),
  ],
  puck: {
    from: 'a',
    actions: [
      pass('a', 'b', { passType: 'one-touch', flightSeconds: 0.6 }),
      pass('b', 'c', { passType: 'one-touch', flightSeconds: 0.6 }),
      pass('c', 'd', { passType: 'one-touch', flightSeconds: 0.6 }),
      pass('d', 'e', { passType: 'one-touch', flightSeconds: 0.6 }),
    ],
  },
  finishPolicy: 'stop-after-sequence',
});

export const pivotOutWarmUp: DrillTemplate = template({
  id: 'tpl-pivot-out-warm-up',
  title: 'Pivot-Out Passing Warm-Up',
  summary:
    'Players receive facing the boards, pivot to face up ice, and move the puck to the next station.',
  categories: ['passing', 'warm-up', 'skating'],
  tags: ['pivot', 'shoulder check', 'escape'],
  ageBands: ['u11', 'u13', 'u15'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 6,
  equipmentSummary: ['4 cones', 'pucks'],
  setupNotes: [
    'Cones along the half-boards mark where each player receives.',
    'Receive with your back half-turned, then pivot out and pass.',
  ],
  coachingPoints: [
    'Shoulder check BEFORE the puck arrives.',
    'Pivot on the inside edge; do not glide through the turn.',
    'Protect the puck with your body through the pivot.',
  ],
  progressions: ['Add a stick-check from a passive defender.'],
  variations: ['Pivot the other way to work the weak side.'],
  actors: [
    skater('s1', 'home', '7', { x: 160, y: 300 }),
    skater('s2', 'home', '8', { x: 330, y: 340 }),
    skater('s3', 'home', '9', { x: 470, y: 300 }),
    skater('s4', 'home', '10', { x: 600, y: 250 }),
  ],
  equipment: coneLine('cone', { x: 200, y: 370 }, { x: 560, y: 370 }, 4),
  routes: [
    route('s2', [
      { x: 330, y: 340 },
      { x: 300, y: 280 },
      { x: 340, y: 240 },
    ]),
    route('s3', [
      { x: 470, y: 300 },
      { x: 440, y: 240 },
      { x: 480, y: 200 },
    ]),
  ],
  puck: {
    from: 's1',
    actions: [pass('s1', 's2'), pass('s2', 's3'), pass('s3', 's4')],
  },
  finishPolicy: 'stop-after-sequence',
});

export const fourDotWarmUp: DrillTemplate = template({
  id: 'tpl-four-dot-warm-up',
  title: 'Four-Dot Quick Warm-Up',
  summary: 'A square of players on the four faceoff dots, moving one puck at pace.',
  categories: ['passing', 'warm-up'],
  tags: ['quick', 'square', 'no goalie'],
  ageBands: ['u9', 'u11', 'u13', 'u15'],
  skillLevel: 'beginner',
  rinkArea: 'full',
  durationMinutes: 4,
  equipmentSummary: ['pucks'],
  setupNotes: [
    'One player on each end-zone faceoff dot.',
    'The puck goes around the square; change direction on the whistle.',
  ],
  coachingPoints: [
    'Flat, firm passes on the ice.',
    'Stick on the ice as a target before the pass comes.',
  ],
  variations: ['Reverse direction.', 'Add a second puck going the other way.'],
  actors: [
    skater('d1', 'home', '1', { x: L.faceoffLeftX, y: L.faceoffTopY }),
    skater('d2', 'home', '2', { x: L.faceoffRightX, y: L.faceoffTopY }),
    skater('d3', 'home', '3', { x: L.faceoffRightX, y: L.faceoffBottomY }),
    skater('d4', 'home', '4', { x: L.faceoffLeftX, y: L.faceoffBottomY }),
  ],
  puck: {
    from: 'd1',
    actions: [pass('d1', 'd2'), pass('d2', 'd3'), pass('d3', 'd4'), pass('d4', 'd1')],
  },
  finishPolicy: 'loop',
});

export const gatesPassingGame: DrillTemplate = template({
  id: 'tpl-gates-passing',
  title: 'Gates Passing Game',
  summary: 'Pairs move up the ice and must complete each pass through a cone gate.',
  categories: ['passing', 'skating'],
  tags: ['accuracy', 'gates', 'partners'],
  ageBands: ['u9', 'u11', 'u13'],
  skillLevel: 'developing',
  rinkArea: 'full',
  durationMinutes: 8,
  equipmentSummary: ['8 cones (4 gates)', 'pucks'],
  setupNotes: [
    'Build four gates down the middle of the ice, roughly two metres wide.',
    'Partners skate the length, passing through each gate in turn.',
  ],
  coachingPoints: [
    'Lead the receiver into space rather than passing to their feet.',
    'Keep skating through the pass; do not coast to make it.',
  ],
  progressions: ['Narrow the gates.', 'Both partners must touch the puck between gates.'],
  variations: ['Backhand only through the last gate.'],
  actors: [
    skater('g1', 'home', '11', { x: 140, y: 150 }),
    skater('g2', 'home', '12', { x: 140, y: 280 }),
  ],
  equipment: [
    gear('gate-1a', 'cone', { x: 300, y: 180 }),
    gear('gate-1b', 'cone', { x: 300, y: 250 }),
    gear('gate-2a', 'cone', { x: 470, y: 180 }),
    gear('gate-2b', 'cone', { x: 470, y: 250 }),
    gear('gate-3a', 'cone', { x: 640, y: 180 }),
    gear('gate-3b', 'cone', { x: 640, y: 250 }),
    gear('gate-4a', 'cone', { x: 800, y: 180 }),
    gear('gate-4b', 'cone', { x: 800, y: 250 }),
  ],
  routes: [
    route('g1', [
      { x: 140, y: 150 },
      { x: 420, y: 130 },
      { x: 700, y: 150 },
      { x: 860, y: 170 },
    ]),
    route('g2', [
      { x: 140, y: 280 },
      { x: 420, y: 300 },
      { x: 700, y: 285 },
      { x: 860, y: 260 },
    ]),
  ],
  puck: {
    from: 'g1',
    actions: [pass('g1', 'g2', { at: 1.2 }), pass('g2', 'g1', { at: 3.4 }), shot('g1', { at: 6.5 })],
  },
  finishPolicy: 'finish-with-shot',
});

export const dSkatingAndPassing: DrillTemplate = template({
  id: 'tpl-d-skating-passing',
  title: 'D Skating and Passing',
  summary:
    'Defence retrieve behind the net, escape up the wall and hit a forward breaking through the middle.',
  categories: ['passing', 'breakout', 'defensive-zone'],
  tags: ['retrieval', 'escape', 'defence'],
  ageBands: ['u13', 'u15', 'u18'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 8,
  equipmentSummary: ['pucks'],
  setupNotes: [
    'Pucks in the corner. One defender starts at the far post.',
    'Forwards start at the top of the circles.',
  ],
  coachingPoints: [
    'Look over your inside shoulder before you touch the puck.',
    'Take the puck up the wall, not back into the middle.',
    'Pass to the forward at speed, not to where they are standing.',
  ],
  progressions: ['Add a forechecker on the retrieval.'],
  variations: ['Reverse behind the net instead of escaping up the wall.'],
  actors: [
    skater('d', 'home', '4', { x: 90, y: 250 }, 'D'),
    skater('f1', 'home', '9', { x: 300, y: 120 }),
    skater('f2', 'home', '17', { x: 330, y: 320 }),
    goalieActor(),
  ],
  routes: [
    route('d', [
      { x: 90, y: 250 },
      { x: 120, y: 320 },
      { x: 210, y: 350 },
    ]),
    route('f1', [
      { x: 300, y: 120 },
      { x: 420, y: 170 },
      { x: 520, y: 210 },
    ]),
  ],
  puck: {
    from: 'd',
    actions: [pass('d', 'f1', { at: 2.2 }), pass('f1', 'f2', { at: 4.4 })],
  },
  finishPolicy: 'finish-with-zone-entry',
});

function goalieActor() {
  return {
    kind: 'goalie' as const,
    id: 'gk',
    team: 'home' as const,
    number: '30',
    position: { x: 80, y: L.centreY },
  };
}

export const centreTimingDelay: DrillTemplate = template({
  id: 'tpl-centre-timing-delay',
  title: 'Centre Timing Delay',
  summary:
    'The centre delays at the top of the zone so the trailing player arrives with speed onto the puck.',
  categories: ['passing', 'transition'],
  tags: ['timing', 'delay', 'trailer'],
  ageBands: ['u13', 'u15', 'u18'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 7,
  equipmentSummary: ['pucks'],
  setupNotes: [
    'Wingers start wide, centre starts low.',
    'The centre must slow down before speeding up - the delay is the drill.',
  ],
  coachingPoints: [
    'Do not force the pass to the trailer until they have speed.',
    'Keep your feet moving through the delay; a stopped player is a target.',
    'The trailer calls for it.',
  ],
  progressions: ['Add a defender who reads the delay.'],
  variations: ['Delay behind the net instead of at the top of the circle.'],
  actors: [
    skater('c', 'home', '91', { x: 700, y: 300 }, 'C'),
    skater('w', 'home', '14', { x: 780, y: 120 }),
    skater('t', 'home', '55', { x: 560, y: 250 }, 'D'),
    { kind: 'goalie' as const, id: 'gk2', team: 'away' as const, number: '1', position: { x: 920, y: L.centreY } },
  ],
  routes: [
    route('c', [
      { x: 700, y: 300 },
      { x: 760, y: 260 },
      { x: 720, y: 200 },
    ]),
    route('t', [
      { x: 560, y: 250 },
      { x: 660, y: 230 },
      { x: 740, y: 245 },
    ]),
  ],
  puck: {
    from: 'w',
    actions: [pass('w', 'c', { at: 1.0 }), pass('c', 't', { at: 3.6 }), shot('t', { at: 5.4 })],
  },
  finishPolicy: 'finish-with-shot',
});

export const rimControlBreakout: DrillTemplate = template({
  id: 'tpl-rim-control-breakout',
  title: 'Rim Control Breakout and Regroup',
  summary:
    'A rimmed puck is stopped on the wall, moved to the centre, and regrouped back through the neutral zone.',
  categories: ['passing', 'breakout', 'transition'],
  tags: ['rim', 'wall play', 'regroup'],
  ageBands: ['u13', 'u15', 'u18'],
  skillLevel: 'advanced',
  rinkArea: 'full',
  durationMinutes: 10,
  equipmentSummary: ['pucks'],
  setupNotes: [
    'Coach rims a puck around the boards from the corner.',
    'The winger stops it on the wall; the centre supports below the dots.',
  ],
  coachingPoints: [
    'Stop the rim with your skate against the wall, not your stick alone.',
    'Support underneath the wall player, never level with them.',
    'The regroup pass goes to the far blue line, not up the middle.',
  ],
  progressions: ['Add a forechecker on the wall.'],
  variations: ['Reverse the rim if the forecheck arrives first.'],
  actors: [
    skater('w1', 'home', '22', { x: 210, y: 370 }),
    skater('c1', 'home', '19', { x: 300, y: 260 }, 'C'),
    skater('d1', 'home', '5', { x: 420, y: 120 }, 'D'),
  ],
  routes: [
    route('w1', [
      { x: 210, y: 370 },
      { x: 300, y: 350 },
    ]),
    route('c1', [
      { x: 300, y: 260 },
      { x: 380, y: 280 },
      { x: 450, y: 240 },
    ]),
    route('d1', [
      { x: 420, y: 120 },
      { x: 560, y: 130 },
      { x: 640, y: 170 },
    ]),
  ],
  puck: {
    from: 'w1',
    actions: [pass('w1', 'c1', { at: 1.4 }), pass('c1', 'd1', { at: 3.6 })],
  },
  finishPolicy: 'finish-with-zone-entry',
});

export const PASSING_TEMPLATES: DrillTemplate[] = [
  getOpenPassingGame,
  oneTouchWarmUp,
  pivotOutWarmUp,
  fourDotWarmUp,
  gatesPassingGame,
  dSkatingAndPassing,
  centreTimingDelay,
  rimControlBreakout,
];
