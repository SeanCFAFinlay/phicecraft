// ============================================================================
// FUNDAMENTALS PACK
//
// The blocks every practice is built from, and what the catalogue was thin on
// next to the drill libraries coaches already use: skating and edge work, a
// full-ice flow warm-up to open practice, and battle drills to close it.
//
// All content is original and first-party. The home team attacks the RIGHT
// net unless a drill says otherwise.
// ============================================================================

import {
  RINK_LANDMARKS as L,
  goalie,
  pass,
  pickup,
  route,
  shot,
  skater,
  template,
  type DrillTemplate,
} from './builder';
import type { Point } from '@/core/types';

const rightGoalie = goalie('gr', 'away', '30', { x: 922, y: L.centreY });

// ============================================================================
// SKATING
// ============================================================================

/** Both left-end circles as one figure eight, skated just outside the paint. */
const FIGURE_EIGHT: Point[] = [
  { x: 255, y: 212 },
  { x: 225, y: 165 },
  { x: 245, y: 102 },
  { x: 215, y: 38 },
  { x: 155, y: 20 },
  { x: 95, y: 40 },
  { x: 68, y: 102 },
  { x: 95, y: 166 },
  { x: 155, y: 212 },
  { x: 215, y: 258 },
  { x: 242, y: 323 },
  { x: 215, y: 387 },
  { x: 155, y: 405 },
  { x: 95, y: 385 },
  { x: 68, y: 323 },
  { x: 95, y: 259 },
  { x: 155, y: 214 },
  { x: 225, y: 200 },
  { x: 262, y: 212 },
];

const figureEightEdges = template({
  id: 'tpl-skate-figure-eight-edges',
  title: 'Figure-Eight Edges Around the Circles',
  summary:
    'Skaters follow each other around both end-zone circles in a figure eight, crossing over on one circle and the opposite way on the other, so both edges are worked every lap.',
  categories: ['skating', 'warm-up'],
  tags: ['edges', 'crossovers', 'figure eight', 'no puck', 'stations', 'no goalie'],
  ageBands: ['u7', 'u9', 'u11', 'u13', 'u15'],
  skillLevel: 'beginner',
  rinkArea: 'third',
  durationMinutes: 6,
  durationSeconds: 18,
  equipmentSummary: ['none'],
  setupNotes: [
    'A line of skaters at the top of the slot in one end.',
    'The next skater goes when the one ahead reaches the far side of the first circle.',
  ],
  coachingPoints: [
    'Knees bent and chest up: sit in the stance, do not bend at the waist.',
    'Push with the outside skate under the body on every crossover - full extension, then recover.',
    'Inside shoulder dropped and eyes leading the turn around the circle.',
    'Through the middle, switch edges cleanly before the second circle.',
  ],
  progressions: ['Add a puck.', 'Backward crossovers on the second lap.'],
  variations: ['Use the neutral-zone dots as a smaller figure eight for younger groups.'],
  actors: [
    skater('s1', 'home', '1', { x: 255, y: 212 }),
    skater('s2', 'home', '2', { x: 305, y: 196 }),
    skater('s3', 'home', '3', { x: 340, y: 230 }),
  ],
  routes: [
    // Each skater rejoins the back of the line at their own spot, so nobody stops where the next one finishes.
    route('s1', [...FIGURE_EIGHT, { x: 345, y: 200 }], { startAt: 0, durationSeconds: 14 }),
    route('s2', [{ x: 305, y: 196 }, ...FIGURE_EIGHT, { x: 310, y: 232 }], { startAt: 2.2, durationSeconds: 14 }),
    route('s3', [{ x: 340, y: 230 }, ...FIGURE_EIGHT], { startAt: 5.0, durationSeconds: 13 }),
  ],
  // Skating only: the pucks stay by the boards until the progression.
  puck: { from: { x: 330, y: 400 }, actions: [] },
  finishPolicy: 'none',
});

/**
 * One skater's lane: sprint and stop on each line, then a backward stretch
 * and a pivot into the last sprint. Every leg starts from a dead stop.
 */
function lane(id: string, number: string, y: number) {
  return {
    actor: skater(id, 'home', number, { x: 70, y }),
    routes: [
      route(id, [{ x: 70, y }, { x: L.blueLineLeft, y }], { startAt: 0.5 }),
      route(id, [{ x: L.blueLineLeft, y }, { x: L.centreX, y }], { startAt: 5.2 }),
      route(id, [{ x: L.centreX, y }, { x: L.blueLineLeft, y }], { startAt: 8.4, movement: 'backward' as const }),
      route(id, [{ x: L.blueLineLeft, y }, { x: L.blueLineRight, y }], { startAt: 12 }),
    ],
  };
}

const lanes = [lane('a', '1', 90), lane('b', '2', 170), lane('c', '3', 255), lane('d', '4', 335)];

const stopsAndStarts = template({
  id: 'tpl-skate-stops-starts-ladder',
  title: 'Stops & Starts: Line to Line',
  summary:
    'On each whistle: sprint from the goal line and stop dead on the blue line, sprint to the red line and stop, skate backward to the blue line, then pivot and sprint through the far blue line.',
  categories: ['skating', 'conditioning'],
  tags: ['stops', 'starts', 'pivots', 'backward skating', 'no puck', 'no goalie'],
  ageBands: ['u9', 'u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'beginner',
  rinkArea: 'full',
  durationMinutes: 6,
  durationSeconds: 16,
  equipmentSummary: ['none'],
  setupNotes: [
    'Skaters spread along the goal line, a stick length apart.',
    'One whistle per leg: nobody moves until it goes, so every start is from a dead stop.',
  ],
  coachingPoints: [
    'First three strides short and quick, on the toes, before lengthening out.',
    'Stop on both skates right on the line, shoulders square - no rolling through it.',
    'From the red-line stop, push straight into backward skating with no glide in between.',
    'Pivot forward with the hips open and the head up, and accelerate out of it.',
  ],
  progressions: ['Alternate which way you face on each stop.', 'Carry a puck through all of it.'],
  variations: ['Lateral shuffle between the lines for defencemen.'],
  actors: lanes.map(item => item.actor),
  routes: lanes.flatMap(item => item.routes),
  // Skating only: the pucks wait in the far corner, the way the skaters face.
  puck: { from: { x: 945, y: 395 }, actions: [] },
  finishPolicy: 'none',
});

const crossoverCircleShot = template({
  id: 'tpl-skate-crossover-circle-shot',
  title: 'Crossover Circle & Cut to the Net',
  summary:
    'With the puck, a skater takes a full lap of crossovers around the faceoff circle, then cuts hard to the net and shoots. Run a line on each circle and alternate them.',
  categories: ['skating', 'puck-handling', 'shooting'],
  tags: ['crossovers', 'edges', 'puck control', 'shot in stride'],
  ageBands: ['u9', 'u11', 'u13', 'u15', 'u18'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 8,
  durationSeconds: 9,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Two lines at the blue line, one on each wall, each with pucks.',
    'Lines alternate so the goalie sees one shot at a time.',
  ],
  coachingPoints: [
    'Keep the puck on the outside of the turn, away from the circle, protected by the body.',
    'Crossovers all the way round - no gliding on two feet.',
    'Come out of the circle with speed and attack the middle of the net, not the corner.',
    'Shoot in stride, without stopping to set the puck.',
  ],
  progressions: ['A passive defender waits at the top of the crease.'],
  variations: ['Reverse direction so the crossovers go the other way.'],
  actors: [
    skater('s1', 'home', '17', { x: 650, y: 360 }, 'RW'),
    rightGoalie,
  ],
  routes: [
    route('s1', [
      { x: 650, y: 360 }, { x: 760, y: 330 }, { x: 845, y: 240 }, { x: 928, y: 322 },
      { x: 845, y: 402 }, { x: 765, y: 322 }, { x: 820, y: 262 }, { x: 860, y: 238 },
    ], { startAt: 0, durationSeconds: 7.5 }),
  ],
  puck: {
    from: 's1',
    actions: [shot('s1', { at: 7.7 })],
  },
  finishPolicy: 'finish-with-shot',
});

// ============================================================================
// FLOW WARM-UP
// ============================================================================

const circleFlow = template({
  id: 'tpl-flow-swing-pass-shoot',
  title: 'Full-Ice Flow: Swing, Take the Pass & Shoot',
  summary:
    'A skater comes out of the corner, up the wall and swings through the neutral zone, takes a pass in stride from the next player in line and attacks the far net. Run it from both ends at once so nobody waits.',
  categories: ['warm-up', 'passing', 'shooting', 'skating'],
  tags: ['flow', 'full ice', 'continuous', 'swing', 'pass in stride', 'warm-up'],
  ageBands: ['u9', 'u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'full',
  durationMinutes: 8,
  durationSeconds: 10,
  equipmentSummary: ['pucks', '2 nets'],
  setupNotes: [
    'Two groups in diagonally opposite corners, each with pucks, and a goalie in each net; both ends go on the same whistle.',
    'The first player in each line goes; the second player in that line is the passer, then goes next.',
  ],
  coachingPoints: [
    'Skate the whole route at speed - this is the first time the legs get going.',
    'Swing with the stick on the ice and show a target before the pass is made.',
    'Passer: hit the skater in stride, in front of them, not at their skates.',
    'Shoot in stride and follow the shot to the net for the rebound.',
  ],
  progressions: ['Add a give-and-go with the passer.', 'Finish 1-on-0 with a deke instead of a shot.'],
  variations: ['Switch sides halfway through so both groups shoot from the other wing.'],
  actors: [
    skater('a', 'home', '11', { x: 95, y: 355 }, 'F'),
    skater('pa', 'home', '14', { x: 125, y: 300 }, 'F'),
    rightGoalie,
  ],
  routes: [
    route('a', [
      { x: 95, y: 355 }, { x: 200, y: 385 }, { x: 330, y: 352 }, { x: 400, y: 262 },
      { x: 520, y: 232 }, { x: 690, y: 215 }, { x: 830, y: 212 },
    ], { startAt: 0, durationSeconds: 8.5 }),
  ],
  puck: {
    from: 'pa',
    actions: [pass('pa', 'a', { at: 2.9, flightSeconds: 1 }), shot('a', { at: 7.8 })],
  },
  finishPolicy: 'finish-with-shot',
});

// ============================================================================
// BATTLES
// ============================================================================

const netFrontBoxOut = template({
  id: 'tpl-battle-net-front-box-out',
  title: 'Net-Front Battle: Box Out vs Screen & Tip',
  summary:
    'A forward fights for the top of the crease while a defender boxes them out; the puck goes from the wall to the point and is shot for the tip.',
  categories: ['battle', 'shooting', 'defensive-zone'],
  tags: ['net front', 'box out', 'screen', 'tip', 'compete', '1v1'],
  ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 8,
  durationSeconds: 5,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'A defender at the top of the crease, a forward in the slot, a passer on the half wall and a shooter at the point.',
    'Short reps: twenty seconds, then the pair switches roles.',
  ],
  coachingPoints: [
    'Forward: get to the goalie’s eyes and keep the stick on the ice - that blade is the target.',
    'Defender: body between the forward and the net, stick on their stick, not just on their back.',
    'Point: walk the line for a lane and shoot low, at a stick, not at the net.',
    'Both stay on the puck after the shot - the rebound is the second battle.',
  ],
  progressions: ['Live after the shot: a rebound goal counts, a clear by the defender counts.'],
  variations: ['Two forwards against one defender to teach who the defender picks up.'],
  actors: [
    skater('w', 'home', '17', { x: 760, y: 372 }, 'RW'),
    skater('pt', 'home', '4', { x: 660, y: 262 }, 'D'),
    skater('f', 'home', '9', { x: 838, y: 245 }, 'F'),
    skater('x', 'away', '5', { x: 885, y: 210 }, 'D'),
    rightGoalie,
  ],
  routes: [
    // The forward fights through to the top of the crease.
    route('f', [{ x: 838, y: 245 }, { x: 862, y: 236 }, { x: 878, y: 230 }], { startAt: 0.4, durationSeconds: 1.6 }),
    // The defender holds inside position, between the forward and the net.
    route('x', [{ x: 885, y: 210 }, { x: 893, y: 222 }], { startAt: 0.6, durationSeconds: 1.2 }),
    // The point walks the line toward the middle for a lane.
    route('pt', [{ x: 660, y: 262 }, { x: 668, y: 228 }], { startAt: 1.1, durationSeconds: 1 }),
  ],
  puck: {
    from: 'w',
    actions: [pass('w', 'pt', { at: 0.5, flightSeconds: 0.7 }), shot('pt', { at: 2.4 })],
  },
  finishPolicy: 'finish-with-shot',
});

const cornerBattle = template({
  id: 'tpl-battle-corner-1v1-to-net',
  title: 'Corner 1-on-1: Win It, Protect It, Take It to the Net',
  summary:
    'A forward and a defender go for a loose puck in the corner; the forward wins it, protects it along the wall with the defender on their back, walks off the goal line and shoots.',
  categories: ['battle', 'puck-handling', 'shooting'],
  tags: ['1v1', 'corner', 'puck protection', 'walk out', 'compete'],
  ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'quarter',
  durationMinutes: 8,
  durationSeconds: 5.5,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Coach places or rims a puck into the corner.',
    'Forward starts at the hash marks, defender a stride closer to the net.',
  ],
  coachingPoints: [
    'Forward: arrive with your body between the defender and the puck - win the position, then the puck.',
    'Wide base and low hips along the wall; the puck stays on the far side of the body.',
    'Use the net as a screen: walk off the goal line to the front, not out to the boards.',
    'Defender: angle them to the wall, stick on stick, and never give up the inside.',
  ],
  progressions: ['The defender is live and scores by carrying it out to the blue line.'],
  variations: ['Start both players facing the boards and the coach shouts the go.'],
  actors: [
    skater('f', 'home', '19', { x: 790, y: 330 }, 'F'),
    skater('x', 'away', '3', { x: 840, y: 262 }, 'D'),
    rightGoalie,
  ],
  routes: [
    route('f', [{ x: 790, y: 330 }, { x: 860, y: 370 }, { x: 902, y: 372 }], { startAt: 0, durationSeconds: 1.8 }),
    route('x', [{ x: 840, y: 262 }, { x: 878, y: 330 }], { startAt: 0.25, durationSeconds: 1.4 }),
    // Protect along the goal line and walk off it to the front of the net.
    route('f', [{ x: 902, y: 372 }, { x: 928, y: 332 }, { x: 918, y: 292 }, { x: 893, y: 262 }], { startAt: 2, durationSeconds: 2 }),
    // The defender stays on their back, on the inside.
    route('x', [{ x: 878, y: 330 }, { x: 900, y: 312 }, { x: 878, y: 284 }], { startAt: 2.2, durationSeconds: 1.8 }),
  ],
  puck: {
    from: { x: 905, y: 375 },
    actions: [
      pickup('f', { at: 1.6, flightSeconds: 0.3, target: { x: 905, y: 375 } }),
      shot('f', { at: 4.3 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

export const FUNDAMENTAL_TEMPLATES: DrillTemplate[] = [
  circleFlow,
  figureEightEdges,
  stopsAndStarts,
  crossoverCircleShot,
  netFrontBoxOut,
  cornerBattle,
];
