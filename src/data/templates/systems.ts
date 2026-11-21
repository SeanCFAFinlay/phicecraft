// ============================================================================
// TEAM SYSTEMS, SPECIAL TEAMS AND SKILL STATIONS
//
// The catalogue grew up around passing, transition and small-area games, and
// was thin exactly where a coach preparing for a game goes looking: one
// penalty kill, one forecheck, nothing for a goalie, nothing in the neutral
// zone. This pack fills those shelves.
//
// Conventions, the same as the rest of the catalogue:
//   - the home team attacks the RIGHT net and defends the LEFT one, so a
//     penalty kill or defensive-zone play is staged in the left zone;
//   - a play that names opposition has that opposition on the ice;
//   - a turnover is drawn as a pass from one team to the other, because that
//     is what it is.
//
// All content is first-party.
// ============================================================================

import {
  RINK_LANDMARKS as L,
  coneLine,
  dump,
  gear,
  goalie,
  pass,
  route,
  shot,
  skater,
  template,
  type DrillTemplate,
} from './builder';

const awayGoalie = goalie('gkr', 'away', '1', { x: 920, y: L.centreY });
const homeGoalie = goalie('gkl', 'home', '30', { x: 80, y: L.centreY });

/** Faceoff centres stand either side of the dot, not on top of each other. */
const DRAW_GAP = 11;

// ============================================================================
// PENALTY KILL
// ============================================================================

const pkDiamond = template({
  id: 'tpl-sys-pk-diamond',
  title: 'Penalty Kill Diamond vs Umbrella',
  summary:
    'Four killers hold a diamond against a three-high power play, rotate with every pass, jump the pass to the low man and clear the zone.',
  categories: ['penalty-kill', 'defensive-zone'],
  tags: ['penalty kill', 'diamond', 'special teams', 'rotation', 'clear'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  durationSeconds: 8,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Four killers in a diamond: one high, two on the sides, one at the net.',
    'Five attackers: three across the top, two low.',
    'The power play moves it around the top twice before attacking.',
  ],
  coachingPoints: [
    'The diamond moves as one - when the top killer goes, the side behind fills the middle.',
    'Sticks in the passing lanes, bodies in the shooting lanes.',
    'Let them pass it around the outside; take away everything through the middle.',
    'When you win it, it goes the full length of the ice. No extra passes.',
  ],
  progressions: ['The power play is live: play to a goal or a clear.'],
  variations: ['Switch to a box when the power play drops a forward to the goal line.'],
  actors: [
    skater('k1', 'home', '9', { x: 300, y: 212 }, 'F'),
    skater('k2', 'home', '17', { x: 215, y: 135 }, 'F'),
    skater('k3', 'home', '4', { x: 215, y: 290 }, 'D'),
    skater('k4', 'home', '5', { x: 130, y: 212 }, 'D'),
    homeGoalie,
    skater('qb', 'away', '8', { x: 360, y: 212 }, 'D'),
    skater('w1', 'away', '19', { x: 330, y: 92 }, 'LW'),
    skater('w2', 'away', '88', { x: 330, y: 335 }, 'RW'),
    skater('a1', 'away', '71', { x: 105, y: 120 }, 'F'),
    skater('a2', 'away', '14', { x: 120, y: 330 }, 'F'),
  ],
  routes: [
    route('k1', [{ x: 300, y: 212 }, { x: 295, y: 150 }, { x: 300, y: 235 }], { startAt: 0.9 }),
    route('k2', [{ x: 215, y: 135 }, { x: 245, y: 118 }, { x: 225, y: 170 }], { startAt: 1 }),
    route('k3', [{ x: 215, y: 290 }, { x: 225, y: 318 }, { x: 190, y: 335 }], { startAt: 3.4 }),
    route('k4', [{ x: 130, y: 212 }, { x: 125, y: 190 }, { x: 130, y: 240 }], { startAt: 1 }),
  ],
  puck: {
    from: 'qb',
    actions: [
      pass('qb', 'w1', { at: 0.8 }),
      pass('w1', 'qb', { at: 2.2 }),
      pass('qb', 'w2', { at: 3.4 }),
      // The pass down low is the one the diamond is waiting for.
      pass('w2', 'k3', { at: 5 }),
      dump('k3', { x: 900, y: 345 }, { at: 6.3, flightSeconds: 1.5 }),
    ],
  },
  finishPolicy: 'none',
});

const pkWallPressure = template({
  id: 'tpl-sys-pk-wall-pressure',
  title: 'Penalty Kill: Pressure the Wall',
  summary:
    'When the puck goes to the half wall the killers pressure together, seal the wall low, win the puck and send a forward away shorthanded.',
  categories: ['penalty-kill', 'defensive-zone', 'battle'],
  tags: ['penalty kill', 'pressure', 'half wall', 'shorthanded', 'special teams'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 10,
  durationSeconds: 8,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Four killers in a box. The power play starts with the puck at the point.',
    'The pass to the half wall is the trigger: everybody goes on it.',
  ],
  coachingPoints: [
    'Pressure on a trigger, never on a whim: the puck on the wall, a bobble, a back turned.',
    'First killer takes the body and the top; the low killer seals the wall underneath.',
    'The weak-side killers collapse to the middle - pressure with two, protect with two.',
    'Win it and go: the far forward leaves the moment the puck is ours.',
  ],
  progressions: ['The power play may reverse it behind the net; the box has to reset.'],
  variations: ['Pressure the point instead, on a pass that is behind the defenceman.'],
  actors: [
    skater('k1', 'home', '9', { x: 275, y: 170 }, 'F'),
    skater('k2', 'home', '17', { x: 270, y: 262 }, 'F'),
    skater('k3', 'home', '4', { x: 155, y: 265 }, 'D'),
    skater('k4', 'home', '5', { x: 150, y: 170 }, 'D'),
    homeGoalie,
    skater('qb', 'away', '8', { x: 362, y: 250 }, 'D'),
    skater('w1', 'away', '88', { x: 300, y: 362 }, 'RW'),
    skater('a1', 'away', '14', { x: 110, y: 350 }, 'F'),
    skater('a2', 'away', '71', { x: 140, y: 215 }, 'F'),
    skater('p2', 'away', '19', { x: 362, y: 120 }, 'D'),
  ],
  routes: [
    route('k2', [{ x: 270, y: 262 }, { x: 292, y: 320 }], { startAt: 0.9 }),
    route('k3', [{ x: 155, y: 265 }, { x: 205, y: 335 }, { x: 228, y: 350 }], { startAt: 0.9 }),
    route('k1', [{ x: 275, y: 170 }, { x: 300, y: 215 }, { x: 480, y: 250 }, { x: 640, y: 262 }], { startAt: 1.2 }),
    route('k4', [{ x: 150, y: 170 }, { x: 140, y: 190 }], { startAt: 1.2 }),
  ],
  puck: {
    from: 'qb',
    actions: [
      pass('qb', 'w1', { at: 0.7 }),
      // Under pressure the wall player throws it down low - into the seal.
      pass('w1', 'k3', { at: 3 }),
      pass('k3', 'k1', { at: 4.3, flightSeconds: 1.1 }),
      dump('k1', { x: 905, y: 330 }, { at: 6.4, flightSeconds: 1.2 }),
    ],
  },
  finishPolicy: 'none',
});

const pkFaceoffClear = template({
  id: 'tpl-sys-pk-faceoff-clear',
  title: 'Penalty Kill Faceoff: Win It & Ice It',
  summary:
    'A shorthanded defensive-zone draw: the centre wins it back to the corner and the defenceman sends it the length of the ice.',
  categories: ['penalty-kill', 'defensive-zone'],
  tags: ['penalty kill', 'faceoff', 'clear', 'set play', 'special teams'],
  ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'quarter',
  durationMinutes: 6,
  durationSeconds: 5,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Faceoff in the defensive zone, four killers against five.',
    'One defenceman lines up directly behind the centre; the winger takes the inside lane.',
  ],
  coachingPoints: [
    'Win it back, not forward - the defenceman behind you is the only safe target.',
    'The winger blocks out the nearest forechecker for one second. That is all it takes.',
    'High off the glass or hard around the wall: shorthanded, icing is free.',
  ],
  progressions: ['The power play wins the draw one rep in three; the killers get to their box.'],
  variations: ['Win it to the winger on the boards, who chips it out past the point.'],
  actors: [
    skater('c', 'home', '9', { x: L.faceoffLeftX - DRAW_GAP, y: L.faceoffBottomY }, 'C'),
    skater('d1', 'home', '4', { x: 92, y: 352 }, 'D'),
    skater('d2', 'home', '5', { x: 105, y: 250 }, 'D'),
    skater('w', 'home', '17', { x: 190, y: 268 }, 'F'),
    homeGoalie,
    skater('ac', 'away', '19', { x: L.faceoffLeftX + DRAW_GAP, y: L.faceoffBottomY }, 'C'),
    skater('aw1', 'away', '88', { x: 205, y: 368 }, 'RW'),
    skater('aw2', 'away', '14', { x: 215, y: 250 }, 'LW'),
    skater('ap1', 'away', '8', { x: 362, y: 320 }, 'D'),
    skater('ap2', 'away', '6', { x: 362, y: 190 }, 'D'),
  ],
  routes: [
    route('d1', [{ x: 92, y: 352 }, { x: 78, y: 330 }], { startAt: 0.4 }),
    route('w', [{ x: 190, y: 268 }, { x: 205, y: 300 }], { startAt: 0.4 }),
    route('aw2', [{ x: 215, y: 250 }, { x: 205, y: 262 }], { startAt: 0.6 }),
  ],
  puck: {
    from: 'c',
    actions: [
      pass('c', 'd1', { at: 0.5, flightSeconds: 0.6 }),
      dump('d1', { x: 900, y: 90 }, { at: 2, flightSeconds: 2.2 }),
    ],
  },
  finishPolicy: 'none',
});

// ============================================================================
// FORECHECK
// ============================================================================

const forecheck212 = template({
  id: 'tpl-sys-forecheck-212',
  title: '2-1-2 Forecheck: Two Deep',
  summary:
    'Two forwards go deep on the puck and the net, the third reads the wall, and the turnover goes straight to the slot.',
  categories: ['forecheck', 'battle', 'shooting'],
  tags: ['forecheck', '2-1-2', 'pressure', 'turnover', 'systems'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  durationSeconds: 7,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'The puck is dumped into the corner. A defenceman retrieves it with a winger on the wall and a partner at the net.',
    'Three forecheckers start at the top of the circles, two defencemen at the blue line.',
  ],
  coachingPoints: [
    'First forward takes the body on the puck carrier; second takes away the pass behind the net.',
    'Third forward stays above the puck and reads the wall - if it comes up the boards, it is yours.',
    'The strong-side defenceman pinches only when the third forward is above them.',
    'On the turnover, find the slot before the defenders turn around.',
  ],
  progressions: ['The breakout is live and may go behind the net; the second forward has to finish the check.'],
  variations: ['Fall back to a 1-2-2 when the first forward arrives late.'],
  actors: [
    skater('f1', 'home', '9', { x: 765, y: 300 }, 'F'),
    skater('f2', 'home', '11', { x: 765, y: 135 }, 'F'),
    skater('f3', 'home', '17', { x: 700, y: 222 }, 'F'),
    skater('d1', 'home', '4', { x: 640, y: 335 }, 'D'),
    skater('d2', 'home', '5', { x: 640, y: 150 }, 'D'),
    skater('ad1', 'away', '2', { x: 905, y: 345 }, 'D'),
    skater('ad2', 'away', '3', { x: 900, y: 150 }, 'D'),
    skater('aw', 'away', '15', { x: 735, y: 375 }, 'RW'),
    awayGoalie,
  ],
  routes: [
    route('f1', [{ x: 765, y: 300 }, { x: 850, y: 300 }, { x: 885, y: 305 }]),
    route('f2', [{ x: 765, y: 135 }, { x: 850, y: 150 }, { x: 868, y: 205 }]),
    route('f3', [{ x: 700, y: 222 }, { x: 740, y: 290 }, { x: 772, y: 338 }], { startAt: 0.4 }),
    route('d1', [{ x: 640, y: 335 }, { x: 680, y: 362 }], { startAt: 1 }),
  ],
  puck: {
    from: 'ad1',
    actions: [
      // Rushed, the defenceman rims it up the wall - where the third forward is waiting.
      pass('ad1', 'f3', { at: 1.8 }),
      pass('f3', 'f2', { at: 3.4 }),
      shot('f2', { at: 4.6 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

const neutralZoneTrap = template({
  id: 'tpl-sys-trap-131',
  title: '1-3-1 Neutral-Zone Trap',
  summary:
    'One forward steers the breakout to a wall, three across the red line close it off, and the turnover becomes a counter-attack.',
  categories: ['forecheck', 'transition', 'rush'],
  tags: ['trap', '1-3-1', 'neutral zone', 'turnover', 'counter-attack', 'systems'],
  ageBands: ['u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'full',
  durationMinutes: 15,
  durationSeconds: 9,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'One forward high, three across the neutral zone, one defenceman back.',
    'The other team breaks out with four: a defenceman carrying, a centre in support, a winger on each wall.',
  ],
  coachingPoints: [
    'The first forward does not chase - they pick a side and take the middle away.',
    'The three across slide together toward the puck; the far one becomes the safety.',
    'Close on the wall player as the pass arrives, not after.',
    'Turnover: the first pass goes forward to the far side, where nobody is.',
    'The first forward is deep when the puck turns over: tag up at the blue line, then follow the play to the net.',
  ],
  progressions: ['Let the breakout try the long cross-ice pass; the safety has to read it.'],
  variations: ['Drop to a 1-2-2 against a team that dumps it in.'],
  actors: [
    skater('f1', 'home', '9', { x: 640, y: 215 }, 'F'),
    skater('f2', 'home', '11', { x: 540, y: 95 }, 'F'),
    skater('m', 'home', '4', { x: 540, y: 212 }, 'D'),
    skater('f3', 'home', '17', { x: 540, y: 335 }, 'F'),
    skater('d2', 'home', '5', { x: 400, y: 212 }, 'D'),
    skater('ad', 'away', '2', { x: 765, y: 255 }, 'D'),
    skater('aw1', 'away', '15', { x: 655, y: 72 }, 'LW'),
    skater('aw2', 'away', '21', { x: 655, y: 352 }, 'RW'),
    skater('ac', 'away', '19', { x: 610, y: 285 }, 'C'),
    awayGoalie,
  ],
  routes: [
    route('f1', [{ x: 640, y: 215 }, { x: 705, y: 262 }], { startAt: 0 }),
    // On the turnover the forechecker is deep in the zone: tag up at the blue
    // line so the counter-attack is onside, then drive the net behind it.
    route('f1', [{ x: 705, y: 262 }, { x: 650, y: 268 }, { x: 612, y: 240 }], { startAt: 2.8 }),
    route('f1', [{ x: 612, y: 240 }, { x: 720, y: 220 }, { x: 860, y: 205 }], { startAt: 5.6 }),
    route('aw1', [{ x: 655, y: 72 }, { x: 600, y: 66 }], { startAt: 1.6 }),
    route('f2', [{ x: 540, y: 95 }, { x: 562, y: 100 }], { startAt: 1.6 }),
    route('m', [{ x: 540, y: 212 }, { x: 562, y: 150 }], { startAt: 1.4 }),
    route('f3', [{ x: 540, y: 335 }, { x: 560, y: 270 }, { x: 700, y: 262 }, { x: 815, y: 240 }], { startAt: 3.2 }),
    route('d2', [{ x: 400, y: 212 }, { x: 430, y: 170 }], { startAt: 1.6 }),
  ],
  puck: {
    from: 'ad',
    actions: [
      pass('ad', 'aw1', { at: 1.2 }),
      // Shut off on the wall, the winger forces it to the middle.
      pass('aw1', 'm', { at: 3.4 }),
      pass('m', 'f3', { at: 4.8 }),
      shot('f3', { at: 7.2 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

// ============================================================================
// POWER PLAY
// ============================================================================

const ppUmbrella = template({
  id: 'tpl-sys-pp-umbrella',
  title: 'Umbrella Power Play: Flank One-Timer',
  summary:
    'Three across the top move the box side to side until the far flank has room for a one-timer, with two forwards at the net.',
  categories: ['power-play', 'passing', 'shooting'],
  tags: ['power play', 'umbrella', 'one-timer', 'special teams', 'o-zone'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  durationSeconds: 7,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Three players across the top: one in the middle of the blue line, one at each flank.',
    'Two forwards low, either side of the crease. Four killers in a box.',
  ],
  coachingPoints: [
    'Move the puck faster than the box can move its feet.',
    'The middle player gets it and gives it - one touch if the lane is there.',
    'Flanks stay on their off wing so the one-timer is on the forehand.',
    'Both low forwards take the goalie’s eyes, then play the rebound.',
  ],
  progressions: ['The killers are live and may pressure the middle player.'],
  variations: ['The flank fakes the shot and passes down to the low forward for a tap-in.'],
  actors: [
    skater('qb', 'home', '8', { x: 655, y: 212 }, 'D'),
    skater('h1', 'home', '88', { x: 705, y: 95 }, 'RW'),
    skater('h2', 'home', '19', { x: 705, y: 330 }, 'LW'),
    skater('n1', 'home', '14', { x: 892, y: 180 }, 'F'),
    skater('n2', 'home', '71', { x: 892, y: 245 }, 'F'),
    skater('k1', 'away', '9', { x: 735, y: 168 }, 'F'),
    skater('k2', 'away', '17', { x: 735, y: 258 }, 'F'),
    skater('k3', 'away', '4', { x: 845, y: 172 }, 'D'),
    skater('k4', 'away', '5', { x: 845, y: 255 }, 'D'),
    awayGoalie,
  ],
  routes: [
    route('k2', [{ x: 735, y: 258 }, { x: 728, y: 285 }], { startAt: 0.8 }),
    route('k1', [{ x: 735, y: 168 }, { x: 742, y: 200 }], { startAt: 0.8 }),
    route('h1', [{ x: 705, y: 95 }, { x: 740, y: 112 }], { startAt: 2.4 }),
  ],
  puck: {
    from: 'qb',
    actions: [
      pass('qb', 'h2', { at: 0.6 }),
      pass('h2', 'qb', { at: 1.9 }),
      pass('qb', 'h1', { at: 3.1, passType: 'one-touch' }),
      shot('h1', { at: 4.4 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

const ppOverload = template({
  id: 'tpl-sys-pp-overload',
  title: 'Overload Power Play: Low Walk-Out',
  summary:
    'Three attackers overload one side, the low forward walks off the goal line, and the backdoor opens when the box collapses on them.',
  categories: ['power-play', 'passing', 'shooting'],
  tags: ['power play', 'overload', 'walk-out', 'backdoor', 'special teams'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  durationSeconds: 7,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Strong side: a forward on the half wall, one on the goal line, a defenceman at the point.',
    'Weak side: a defenceman in the middle of the blue line and a forward waiting off the far post.',
  ],
  coachingPoints: [
    'Half wall, goal line and point make a triangle - keep it small enough for short passes.',
    'The low forward attacks the net off the goal line; make a killer come to you.',
    'The weak-side forward stays hidden behind the box until the walk-out starts.',
    'If nothing is there, send it back to the point and set it again. Never force it.',
  ],
  progressions: ['The killers are live once the puck goes to the goal line.'],
  variations: ['The half-wall forward walks to the middle and shoots through the screen.'],
  actors: [
    skater('w', 'home', '88', { x: 780, y: 352 }, 'RW'),
    skater('lo', 'home', '14', { x: 905, y: 358 }, 'F'),
    skater('d1', 'home', '8', { x: 655, y: 325 }, 'D'),
    skater('d2', 'home', '6', { x: 655, y: 200 }, 'D'),
    skater('bd', 'home', '19', { x: 835, y: 120 }, 'LW'),
    skater('k1', 'away', '9', { x: 745, y: 285 }, 'F'),
    skater('k2', 'away', '17', { x: 745, y: 185 }, 'F'),
    skater('k3', 'away', '4', { x: 860, y: 300 }, 'D'),
    skater('k4', 'away', '5', { x: 872, y: 160 }, 'D'),
    awayGoalie,
  ],
  routes: [
    route('lo', [{ x: 905, y: 358 }, { x: 912, y: 310 }, { x: 895, y: 268 }], { startAt: 1.6 }),
    route('bd', [{ x: 835, y: 120 }, { x: 842, y: 170 }, { x: 852, y: 205 }], { startAt: 2 }),
    route('k3', [{ x: 860, y: 300 }, { x: 880, y: 295 }], { startAt: 1.8 }),
  ],
  puck: {
    from: 'w',
    actions: [
      pass('w', 'lo', { at: 0.6 }),
      pass('lo', 'bd', { at: 3.3, flightSeconds: 0.6 }),
      shot('bd', { at: 4.3 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

const ppBreakoutDrop = template({
  id: 'tpl-sys-pp-breakout-drop',
  title: 'Power-Play Breakout: Drop Pass Entry',
  summary:
    'The defenceman carries up the middle to back the killers off, drops it to a forward arriving with speed, and the entry goes wide.',
  categories: ['power-play', 'breakout', 'transition'],
  tags: ['power play', 'breakout', 'drop pass', 'zone entry', 'special teams'],
  ageBands: ['u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'full',
  durationMinutes: 12,
  durationSeconds: 9,
  equipmentSummary: ['pucks'],
  goalieCount: 0,
  setupNotes: [
    'A defenceman starts with the puck below the circles; the speed forward starts behind them.',
    'Two forwards wait wide at the far blue line. Four killers stand up in the neutral zone.',
  ],
  coachingPoints: [
    'The carrier skates at the killers so they have to back up, then leaves it.',
    'The speed forward takes the drop at full stride - they should be the fastest player on the ice.',
    'Wide forwards stay onside and still: they are the outlets, not the entry.',
    'Enter with possession. If the line is closed, hit the wall and go get it.',
  ],
  progressions: ['The killers may pressure the drop; the carrier keeps it when they do.'],
  variations: ['The carrier fakes the drop and hits the wide forward directly.'],
  actors: [
    skater('d1', 'home', '8', { x: 115, y: 240 }, 'D'),
    skater('sp', 'home', '88', { x: 85, y: 150 }, 'F'),
    skater('f2', 'home', '19', { x: 585, y: 62 }, 'LW'),
    skater('f3', 'home', '14', { x: 585, y: 362 }, 'RW'),
    skater('d2', 'home', '6', { x: 240, y: 330 }, 'D'),
    skater('k1', 'away', '9', { x: 520, y: 195 }, 'F'),
    skater('k2', 'away', '17', { x: 590, y: 235 }, 'F'),
    skater('k3', 'away', '4', { x: 655, y: 140 }, 'D'),
    skater('k4', 'away', '5', { x: 655, y: 225 }, 'D'),
  ],
  routes: [
    route('d1', [{ x: 115, y: 240 }, { x: 250, y: 215 }, { x: 420, y: 212 }]),
    route('sp', [{ x: 85, y: 150 }, { x: 200, y: 195 }, { x: 330, y: 212 }, { x: 480, y: 262 }, { x: 640, y: 310 }, { x: 760, y: 300 }], { startAt: 1.2 }),
    // The wide winger holds at the line and times the entry: the puck crosses first.
    route('f3', [{ x: 585, y: 362 }, { x: 615, y: 365 }, { x: 720, y: 368 }], { startAt: 6 }),
    route('k1', [{ x: 520, y: 195 }, { x: 470, y: 190 }], { startAt: 1.5, movement: 'backward' }),
  ],
  puck: {
    from: 'd1',
    actions: [
      pass('d1', 'sp', { at: 3.7, flightSeconds: 0.6 }),
      pass('sp', 'f3', { at: 6.3 }),
    ],
  },
  finishPolicy: 'finish-with-zone-entry',
});

// ============================================================================
// DEFENSIVE ZONE
// ============================================================================

const dZoneCoverage = template({
  id: 'tpl-sys-dzone-coverage',
  title: 'D-Zone Coverage: Collapse & Exit',
  summary:
    'Five defenders hold their zone against a cycle, the strong-side winger picks off the pass to the point, and the centre leads the exit.',
  categories: ['defensive-zone', 'breakout', 'battle'],
  tags: ['d-zone', 'coverage', '5v5', 'systems', 'exit'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 15,
  durationSeconds: 8,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Five attackers cycle the puck from the corner to the half wall to the point.',
    'Defenders: one defenceman on the puck, one at the net, centre in low support, a winger on each point.',
  ],
  coachingPoints: [
    'One defender on the puck, everybody else between their check and the net.',
    'The centre is the third defenceman: low, in support, never above the puck.',
    'Wingers stand in the shooting lane with a stick in the passing lane.',
    'The exit starts with the centre coming underneath to give the winger an easy first pass.',
  ],
  progressions: ['The cycle is live and may go low-to-high or behind the net.'],
  variations: ['Switch the centre and the puck-side defenceman when the cycle changes corners.'],
  actors: [
    skater('d1', 'home', '4', { x: 125, y: 318 }, 'D'),
    skater('d2', 'home', '5', { x: 125, y: 235 }, 'D'),
    skater('c', 'home', '9', { x: 170, y: 290 }, 'C'),
    skater('w1', 'home', '17', { x: 295, y: 300 }, 'RW'),
    skater('w2', 'home', '11', { x: 255, y: 185 }, 'LW'),
    homeGoalie,
    skater('a1', 'away', '15', { x: 92, y: 352 }, 'F'),
    skater('a2', 'away', '21', { x: 235, y: 362 }, 'F'),
    skater('a3', 'away', '19', { x: 160, y: 205 }, 'F'),
    skater('p1', 'away', '2', { x: 362, y: 320 }, 'D'),
    skater('p2', 'away', '3', { x: 362, y: 130 }, 'D'),
  ],
  routes: [
    route('c', [{ x: 170, y: 290 }, { x: 200, y: 322 }, { x: 290, y: 245 }, { x: 420, y: 222 }], { startAt: 1.2 }),
    route('w1', [{ x: 295, y: 300 }, { x: 312, y: 328 }], { startAt: 2.4 }),
    route('w2', [{ x: 255, y: 185 }, { x: 300, y: 150 }, { x: 430, y: 110 }], { startAt: 3.8 }),
    route('d1', [{ x: 125, y: 318 }, { x: 150, y: 330 }], { startAt: 1.4 }),
  ],
  puck: {
    from: 'a1',
    actions: [
      pass('a1', 'a2', { at: 1 }),
      // The pass back to the point is the one the winger has been sitting on.
      pass('a2', 'w1', { at: 2.8 }),
      pass('w1', 'c', { at: 4.3 }),
    ],
  },
  finishPolicy: 'finish-with-possession',
});

const dZoneFaceoffExit = template({
  id: 'tpl-sys-dzone-faceoff-exit',
  title: 'D-Zone Faceoff: Win & Weak-Side Exit',
  summary:
    'The centre wins the draw to the corner, the defence reverse it behind the net, and the weak-side winger carries it out.',
  categories: ['defensive-zone', 'breakout', 'passing'],
  tags: ['faceoff', 'd-zone', 'breakout', 'reverse', 'set play'],
  ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 8,
  durationSeconds: 7,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Faceoff at a defensive-zone dot, five against five.',
    'One defenceman behind the centre, the other at the near post, wingers on the hash marks.',
  ],
  coachingPoints: [
    'Win it back and to the corner - away from the middle of the ice.',
    'The defence talk: "reverse" is called before the puck is touched.',
    'The weak-side winger leaves for the wall as soon as the draw is won.',
    'The centre comes through the middle underneath the puck as the next pass.',
  ],
  progressions: ['Add a second forechecker who takes away the reverse; the defenceman goes up the strong side.'],
  variations: ['Win it straight to the boards-side winger for a quick chip out.'],
  actors: [
    skater('c', 'home', '9', { x: L.faceoffLeftX - DRAW_GAP, y: L.faceoffBottomY }, 'C'),
    skater('d1', 'home', '4', { x: 95, y: 355 }, 'D'),
    skater('d2', 'home', '5', { x: 95, y: 250 }, 'D'),
    skater('w1', 'home', '17', { x: 185, y: 372 }, 'RW'),
    skater('w2', 'home', '11', { x: 195, y: 265 }, 'LW'),
    homeGoalie,
    skater('ac', 'away', '19', { x: L.faceoffLeftX + DRAW_GAP, y: L.faceoffBottomY }, 'C'),
    skater('aw', 'away', '15', { x: 215, y: 345 }, 'F'),
    skater('ap1', 'away', '2', { x: 362, y: 330 }, 'D'),
    skater('ap2', 'away', '3', { x: 362, y: 195 }, 'D'),
  ],
  routes: [
    route('d2', [{ x: 95, y: 250 }, { x: 62, y: 200 }, { x: 88, y: 125 }], { startAt: 0.6 }),
    route('w2', [{ x: 195, y: 265 }, { x: 225, y: 150 }, { x: 320, y: 92 }], { startAt: 1 }),
    route('c', [{ x: L.faceoffLeftX - DRAW_GAP, y: L.faceoffBottomY }, { x: 240, y: 270 }, { x: 400, y: 205 }], { startAt: 1.6 }),
    route('ac', [{ x: L.faceoffLeftX + DRAW_GAP, y: L.faceoffBottomY }, { x: 140, y: 350 }], { startAt: 1.2 }),
  ],
  puck: {
    from: 'c',
    actions: [
      pass('c', 'd1', { at: 0.5, flightSeconds: 0.6 }),
      pass('d1', 'd2', { at: 1.9, flightSeconds: 1 }),
      pass('d2', 'w2', { at: 3.6 }),
      pass('w2', 'c', { at: 5.2 }),
    ],
  },
  finishPolicy: 'finish-with-possession',
});

// ============================================================================
// NEUTRAL ZONE
// ============================================================================

const nzFaceoffQuickUp = template({
  id: 'tpl-sys-nz-faceoff-quick-up',
  title: 'Neutral-Zone Faceoff: Quick Up',
  summary:
    'Off a centre-ice draw the defence go D-to-D and hit the far winger in stride at the blue line for a clean entry.',
  categories: ['transition', 'passing', 'rush'],
  tags: ['faceoff', 'neutral zone', 'd-to-d', 'zone entry', 'set play'],
  ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'full',
  durationMinutes: 8,
  durationSeconds: 7,
  equipmentSummary: ['pucks'],
  goalieCount: 0,
  setupNotes: [
    'Centre-ice faceoff, five against five.',
    'The winger on the far side lines up a stride behind the red line so they can leave early and stay onside.',
  ],
  coachingPoints: [
    'Win the draw back to the defenceman on your strong side.',
    'D-to-D moves the forecheck across the ice; the second defenceman passes first touch.',
    'The winger times the blue line - the puck crosses first.',
    'Centre and far winger follow in two more lanes: enter three wide.',
  ],
  progressions: ['The other team forechecks the first defenceman hard; the pass goes back to the centre instead.'],
  variations: ['The second defenceman carries it and the winger drives the net without the puck.'],
  actors: [
    skater('c', 'home', '9', { x: L.centreX - DRAW_GAP, y: L.centreY }, 'C'),
    skater('lw', 'home', '11', { x: 470, y: 95 }, 'LW'),
    skater('rw', 'home', '17', { x: 478, y: 330 }, 'RW'),
    skater('d1', 'home', '4', { x: 410, y: 265 }, 'D'),
    skater('d2', 'home', '5', { x: 410, y: 150 }, 'D'),
    skater('ac', 'away', '19', { x: L.centreX + DRAW_GAP, y: L.centreY }, 'C'),
    skater('aw1', 'away', '15', { x: 525, y: 300 }, 'F'),
    skater('aw2', 'away', '21', { x: 530, y: 135 }, 'F'),
    skater('ad1', 'away', '2', { x: 610, y: 265 }, 'D'),
    skater('ad2', 'away', '3', { x: 610, y: 160 }, 'D'),
  ],
  routes: [
    route('lw', [{ x: 470, y: 95 }, { x: 560, y: 70 }, { x: 680, y: 75 }, { x: 800, y: 130 }], { startAt: 1.8 }),
    route('c', [{ x: L.centreX - DRAW_GAP, y: L.centreY }, { x: 520, y: 180 }, { x: 700, y: 200 }], { startAt: 2.4 }),
    route('rw', [{ x: 478, y: 330 }, { x: 600, y: 345 }, { x: 720, y: 320 }], { startAt: 2.6 }),
    route('aw1', [{ x: 525, y: 300 }, { x: 455, y: 290 }], { startAt: 0.8 }),
    route('ad2', [{ x: 610, y: 160 }, { x: 720, y: 170 }], { startAt: 2.6, movement: 'backward' }),
    route('ad1', [{ x: 610, y: 265 }, { x: 720, y: 250 }], { startAt: 2.6, movement: 'backward' }),
  ],
  puck: {
    from: 'c',
    actions: [
      pass('c', 'd1', { at: 0.5, flightSeconds: 0.7 }),
      pass('d1', 'd2', { at: 1.8 }),
      pass('d2', 'lw', { at: 3.3, flightSeconds: 1 }),
    ],
  },
  finishPolicy: 'finish-with-zone-entry',
});

// ============================================================================
// GOALIE
// ============================================================================

const goaliePostToPost = template({
  id: 'tpl-sys-goalie-cross-ice-tracking',
  title: 'Goalie Tracking: Cross-Ice One-Timer',
  summary:
    'The puck goes from the point to one circle and across to the other, so the goalie has to follow it, push across and be set for the shot.',
  categories: ['goalie', 'shooting', 'warm-up'],
  tags: ['goalie', 'tracking', 'lateral push', 'one-timer', 'warm-up'],
  ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 8,
  durationSeconds: 6,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'One passer at the point with the pucks, a shooter at the top of each circle.',
    'Alternate sides every rep so the goalie pushes both ways.',
  ],
  coachingPoints: [
    'Goalie: eyes lead, then the head, then the push. Find the puck before you move.',
    'Arrive square and set - a save made while still sliding is a lucky one.',
    'Shooters: release it quickly. The drill is about the goalie beating the pass.',
    'Hold the rebound or put it in the corner; nothing back into the slot.',
  ],
  progressions: ['The first shooter may shoot instead of passing, so the goalie cannot cheat across.'],
  variations: ['Move both shooters down to the goal line extended for a tight-angle version.'],
  actors: [
    skater('pt', 'home', '4', { x: 670, y: 212 }, 'D'),
    skater('s1', 'home', '11', { x: 805, y: 112 }, 'LW'),
    skater('s2', 'home', '17', { x: 805, y: 312 }, 'RW'),
    awayGoalie,
  ],
  routes: [route('s2', [{ x: 805, y: 312 }, { x: 822, y: 292 }], { startAt: 1.8 })],
  puck: {
    from: 'pt',
    actions: [
      pass('pt', 's1', { at: 0.6 }),
      pass('s1', 's2', { at: 2, passType: 'one-touch' }),
      shot('s2', { at: 3.3 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

const goalieLowHighLow = template({
  id: 'tpl-sys-goalie-low-high-low',
  title: 'Goalie Tracking: Low-High-Low',
  summary:
    'The puck starts in the corner, goes to the point and comes back down to the far side, moving the goalie from the post, out to the top of the crease and back.',
  categories: ['goalie', 'passing', 'shooting'],
  tags: ['goalie', 'tracking', 'post play', 'depth', 'low to high'],
  ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 8,
  durationSeconds: 7,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'One forward in the corner with the pucks, a defenceman at the point, a shooter low on the far side.',
    'The goalie starts on the post nearest the puck.',
  ],
  coachingPoints: [
    'Goalie: on the post while the puck is below the goal line, off it the moment it goes high.',
    'Gain depth on the point pass, then give it back as the puck comes low.',
    'Track the puck all the way onto the far-side stick before pushing.',
    'Shooter: walk off the goal line and shoot as you arrive - make it a real read.',
  ],
  progressions: ['Add a screen at the top of the crease on the point pass.'],
  variations: ['The defenceman shoots one rep in three, so the goalie must be set at the top.'],
  actors: [
    skater('lo', 'home', '17', { x: 900, y: 348 }, 'RW'),
    skater('pt', 'home', '4', { x: 662, y: 300 }, 'D'),
    skater('sh', 'home', '11', { x: 898, y: 110 }, 'LW'),
    awayGoalie,
  ],
  routes: [
    route('pt', [{ x: 662, y: 300 }, { x: 665, y: 235 }], { startAt: 0.8 }),
    route('sh', [{ x: 898, y: 110 }, { x: 880, y: 160 }], { startAt: 2.6 }),
  ],
  puck: {
    from: 'lo',
    actions: [
      pass('lo', 'pt', { at: 0.6, flightSeconds: 1.1 }),
      pass('pt', 'sh', { at: 2.8, flightSeconds: 1.1 }),
      shot('sh', { at: 4.6 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

// ============================================================================
// PUCK HANDLING
// ============================================================================

const coneWeaveShot = template({
  id: 'tpl-sys-cone-weave-shot',
  title: 'Cone Weave & Shot',
  summary:
    'One skater at a time carries the puck through a line of cones down the middle of the ice and finishes with a shot.',
  categories: ['puck-handling', 'skating', 'shooting'],
  tags: ['stickhandling', 'cones', 'edges', 'head up', 'station'],
  ageBands: ['u7', 'u9', 'u11', 'u13'],
  skillLevel: 'beginner',
  rinkArea: 'full',
  durationMinutes: 6,
  durationSeconds: 10,
  equipmentSummary: ['pucks', '5 cones', '1 net'],
  setupNotes: [
    'Five cones in a line through the neutral zone, about three stick-lengths apart.',
    'Skaters line up at the first blue line with a puck each. The next one goes when the skater ahead reaches the third cone.',
  ],
  coachingPoints: [
    'Head up - look at the next cone, not at the puck.',
    'Move the puck across the body with soft hands; the feet go around the cone, the puck goes wide of it.',
    'Knees bent and on the edges through every turn.',
    'Finish it: skate all the way to the shot and stop at the net.',
  ],
  progressions: ['Tighten the cones to two stick-lengths.', 'Skate the weave backward to the third cone, then turn.'],
  variations: ['Race two lines side by side.'],
  actors: [
    skater('s1', 'home', '7', { x: 225, y: 212 }),
    skater('s2', 'home', '8', { x: 165, y: 212 }),
    awayGoalie,
  ],
  equipment: coneLine('weave', { x: 310, y: 212 }, { x: 630, y: 212 }, 5),
  routes: [
    route('s1', [
      { x: 225, y: 212 },
      { x: 310, y: 180 },
      { x: 390, y: 244 },
      { x: 470, y: 180 },
      { x: 550, y: 244 },
      { x: 630, y: 180 },
      { x: 730, y: 205 },
      { x: 835, y: 212 },
    ]),
  ],
  puck: {
    from: 's1',
    actions: [shot('s1', { at: 8.2 })],
  },
  finishPolicy: 'finish-with-shot',
});

const figureEightProtect = template({
  id: 'tpl-sys-figure-eight-protect',
  title: 'Figure-Eight Puck Protection',
  summary:
    'A skater carries a figure-eight around two tires, keeping the body between the puck and the tire, then feeds a partner for the shot.',
  categories: ['puck-handling', 'skating', 'passing'],
  tags: ['puck protection', 'figure eight', 'edges', 'tires', 'station'],
  ageBands: ['u7', 'u9', 'u11', 'u13', 'u15'],
  skillLevel: 'beginner',
  rinkArea: 'quarter',
  durationMinutes: 6,
  durationSeconds: 11,
  equipmentSummary: ['pucks', '2 tires', '1 net'],
  setupNotes: [
    'Two tires a few strides apart at the top of the circles.',
    'One skater with a puck between them, a partner waiting low beside the net.',
  ],
  coachingPoints: [
    'Puck on the outside of the turn, body between the puck and the tire.',
    'Lean into the turn and keep the feet moving - crossovers, not gliding.',
    'Top hand away from the body so the puck can reach wide.',
    'Head comes up out of the last turn to find the partner.',
  ],
  progressions: ['Replace the tires with a coach holding a stick out to poke at the puck.'],
  variations: ['Go around both tires the same direction so both sides get worked.'],
  actors: [
    skater('s1', 'home', '7', { x: 705, y: 212 }),
    skater('s2', 'home', '8', { x: 875, y: 320 }),
    awayGoalie,
  ],
  equipment: [
    gear('tire-1', 'tire', { x: 760, y: 150 }),
    gear('tire-2', 'tire', { x: 760, y: 275 }),
  ],
  routes: [
    route('s1', [
      { x: 705, y: 212 },
      { x: 745, y: 105 },
      { x: 805, y: 150 },
      { x: 760, y: 212 },
      { x: 715, y: 275 },
      { x: 760, y: 322 },
      { x: 805, y: 275 },
      { x: 795, y: 215 },
    ]),
    route('s2', [{ x: 875, y: 320 }, { x: 868, y: 250 }], { startAt: 6.4 }),
  ],
  puck: {
    from: 's1',
    actions: [
      pass('s1', 's2', { at: 7.6 }),
      shot('s2', { at: 8.9 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

export const SYSTEM_TEMPLATES: DrillTemplate[] = [
  pkDiamond,
  pkWallPressure,
  pkFaceoffClear,
  forecheck212,
  neutralZoneTrap,
  ppUmbrella,
  ppOverload,
  ppBreakoutDrop,
  dZoneCoverage,
  dZoneFaceoffExit,
  nzFaceoffQuickUp,
  goaliePostToPost,
  goalieLowHighLow,
  coneWeaveShot,
  figureEightProtect,
];
