// ============================================================================
// CYCLE AND POWER PLAY PACK
//
// Offensive-zone possession: keeping the puck below the dots by cycling it,
// and the power plays that are built on the same idea - move the puck faster
// than the defence can move its feet, then hit the seam that opens.
//
// Hockey logic this pack holds itself to:
//   - a cycle is a puck LEFT for a teammate skating in behind on the wall,
//     never a pass to someone standing still; the passer then rolls off the
//     wall toward the net or the point, so every player keeps moving;
//   - defenders and penalty killers react: the box shifts to the puck side on
//     every pass, which is exactly what opens the far side;
//   - every pass goes around a defender, not through one;
//   - the shot comes from a lane the defence has just been pulled out of, with
//     somebody at the net for the screen and the rebound.
//
// The home team attacks the RIGHT net. Facing it, the top of the board is the
// attackers' left side and the bottom is their right.
// ============================================================================

import { goalie, pass, route, shot, skater, template, type DrillTemplate } from './builder';

const awayGoalie = goalie('gkr', 'away', '30', { x: 922, y: 212.5 });

// ============================================================================
// CYCLING
// ============================================================================

const twoManLowCycle = template({
  id: 'tpl-cycle-two-man-low',
  title: 'Two-Man Low Cycle & Point Shot',
  summary:
    'The winger takes the puck down the wall, protects it and leaves it for the centre swinging in behind, rolls off to the net, and the puck goes up the wall to the point for a shot through the screen.',
  categories: ['puck-handling', 'passing', 'shooting', 'battle'],
  tags: ['cycle', 'o-zone', 'low cycle', 'puck protection', 'screen', '2v1'],
  ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 10,
  durationSeconds: 6.5,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Winger with the puck on the half wall, centre a few strides behind and inside them.',
    'One defenceman at the near point, one defender starting at the faceoff dot.',
    'Run it on both walls so every forward cycles on the forehand and the backhand.',
  ],
  coachingPoints: [
    'Puck carrier: body between the defender and the puck, stick on the outside, head up.',
    'Leave the puck on the wall, where the defender is not - do not throw it into the slot.',
    'Second forward arrives with speed under the first one, so the puck never stops.',
    'The first forward rolls straight to the net once the puck is gone: screen, tip, rebound.',
    'Point: walk to the middle before you shoot, low and hard for a tip.',
  ],
  progressions: ['The defender is live and the forwards must cycle twice before going to the point.'],
  variations: ['Instead of the point, the second forward hits the first one at the net front.'],
  actors: [
    skater('f1', 'home', '17', { x: 740, y: 368 }, 'RW'),
    skater('f2', 'home', '11', { x: 775, y: 318 }, 'C'),
    skater('d1', 'home', '4', { x: 660, y: 330 }, 'D'),
    skater('x1', 'away', '5', { x: 875, y: 318 }, 'D'),
    awayGoalie,
  ],
  routes: [
    // Down the wall with the puck.
    route('f1', [{ x: 740, y: 368 }, { x: 820, y: 378 }, { x: 895, y: 372 }], { startAt: 0, durationSeconds: 1.9 }),
    // The defender angles them into the corner.
    route('x1', [{ x: 875, y: 318 }, { x: 900, y: 336 }], { startAt: 0.6, durationSeconds: 1 }),
    // The centre follows a couple of strides behind, along the boards.
    route('f2', [{ x: 775, y: 318 }, { x: 800, y: 350 }, { x: 845, y: 375 }], { startAt: 0.9, durationSeconds: 1.6 }),
    // Puck left: roll off the wall along the goal line and up to the net.
    route('f1', [{ x: 895, y: 372 }, { x: 920, y: 330 }, { x: 902, y: 270 }, { x: 890, y: 240 }], { startAt: 2.15, durationSeconds: 1.7 }),
    // The defender has to go with them and box them out.
    route('x1', [{ x: 900, y: 336 }, { x: 912, y: 292 }, { x: 905, y: 262 }], { startAt: 2.3, durationSeconds: 1.5 }),
    // The centre carries it back up the wall, away from pressure.
    route('f2', [{ x: 845, y: 375 }, { x: 800, y: 365 }, { x: 772, y: 348 }], { startAt: 2.6, durationSeconds: 1.2 }),
    // The point walks toward the middle for a lane.
    route('d1', [{ x: 660, y: 330 }, { x: 668, y: 296 }], { startAt: 3.1, durationSeconds: 1 }),
  ],
  puck: {
    from: 'f1',
    actions: [
      pass('f1', 'f2', { at: 2, flightSeconds: 0.45 }),
      pass('f2', 'd1', { at: 3.7, flightSeconds: 0.6 }),
      shot('d1', { at: 4.7 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

const threeManCycle = template({
  id: 'tpl-cycle-three-man',
  title: 'Three-Man Cycle: Low, Wall & High Seam',
  summary:
    'Three forwards rotate through the corner, the wall and the high slot: the puck is left low, carried up the wall to the third forward rotating down, who walks into the middle and shoots with a screen in front.',
  categories: ['puck-handling', 'passing', 'shooting'],
  tags: ['cycle', 'o-zone', 'rotation', 'puck protection', 'walk out', '3v2'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  durationSeconds: 7,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Three forwards on the left wall: one with the puck at the hash marks, one behind on the wall, one in the high slot.',
    'Two defenders: one on the wall side, one holding the slot.',
  ],
  coachingPoints: [
    'Three spots - low, wall, high. When one forward leaves a spot, the next one fills it.',
    'The puck carrier always has two options: the man behind on the wall, and the man in the high slot.',
    'First forward to leave the puck goes hard to the net. Never stand and watch the cycle.',
    'The shooter walks off the wall to the middle, changing the angle before shooting.',
  ],
  progressions: ['Both defenders live, and the forwards keep cycling until a clean shooting lane opens.'],
  variations: ['The high forward one-times it from the slot instead of walking it in.'],
  actors: [
    skater('f1', 'home', '19', { x: 745, y: 52 }, 'LW'),
    skater('f2', 'home', '91', { x: 770, y: 112 }, 'C'),
    skater('f3', 'home', '27', { x: 790, y: 178 }, 'RW'),
    skater('x1', 'away', '4', { x: 872, y: 112 }, 'D'),
    skater('x2', 'away', '6', { x: 830, y: 230 }, 'D'),
    awayGoalie,
  ],
  routes: [
    route('f1', [{ x: 745, y: 52 }, { x: 830, y: 42 }, { x: 900, y: 55 }], { startAt: 0, durationSeconds: 1.9 }),
    route('x1', [{ x: 872, y: 112 }, { x: 895, y: 88 }], { startAt: 0.7, durationSeconds: 1 }),
    route('f2', [{ x: 770, y: 112 }, { x: 805, y: 70 }, { x: 850, y: 46 }], { startAt: 0.8, durationSeconds: 1.6 }),
    // First forward rolls off to the net front.
    route('f1', [{ x: 900, y: 55 }, { x: 925, y: 95 }, { x: 905, y: 155 }, { x: 890, y: 188 }], { startAt: 2.1, durationSeconds: 1.7 }),
    route('x1', [{ x: 895, y: 88 }, { x: 912, y: 135 }, { x: 905, y: 168 }], { startAt: 2.3, durationSeconds: 1.5 }),
    // Second forward carries out of the corner, up the wall.
    route('f2', [{ x: 850, y: 46 }, { x: 875, y: 60 }, { x: 858, y: 82 }], { startAt: 2.5, durationSeconds: 1 }),
    // Third forward rotates from the high slot down to the wall to support.
    route('f3', [{ x: 790, y: 178 }, { x: 772, y: 125 }, { x: 765, y: 78 }], { startAt: 2.4, durationSeconds: 1.4 }),
    // ...and walks off it into the middle with the puck.
    route('f3', [{ x: 765, y: 78 }, { x: 752, y: 122 }, { x: 748, y: 158 }], { startAt: 4.2, durationSeconds: 1.2 }),
    // The slot defender steps up late.
    route('x2', [{ x: 830, y: 230 }, { x: 815, y: 205 }], { startAt: 4.4, durationSeconds: 0.8 }),
  ],
  puck: {
    from: 'f1',
    actions: [
      pass('f1', 'f2', { at: 2, flightSeconds: 0.45 }),
      pass('f2', 'f3', { at: 3.6, flightSeconds: 0.5 }),
      shot('f3', { at: 5.3 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

const cycleDefenceActivation = template({
  id: 'tpl-cycle-d-activation',
  title: 'Cycle & Defence Activation Down the Wall',
  summary:
    'The defenceman pinches down the wall as the winger walks up it, takes the puck low, and hits the winger who has rotated up to cover the point; D-to-D across and a one-timer through the screen.',
  categories: ['passing', 'shooting', 'puck-handling'],
  tags: ['cycle', 'o-zone', 'd activation', 'rotation', 'one-timer', 'screen'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  durationSeconds: 6.5,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Winger with the puck in the right corner, centre in the slot, both defencemen on the blue line.',
    'One defender chasing the winger out of the corner.',
  ],
  coachingPoints: [
    'Defenceman: read the winger walking up the wall and go - arrive with speed under them.',
    'Winger: the moment the D activates, your job is the point. Get above the puck and cover the line.',
    'Low-to-high quickly, before the defender can turn back up.',
    'Far D slides to the middle and has the stick loaded for the one-timer.',
    'Centre takes the goalie’s eyes and stops at the net for the rebound.',
  ],
  progressions: ['A second defender covers the point, so the winger must read whether to go high or stay low.'],
  variations: ['The activating defenceman takes it to the net from below the goal line instead.'],
  actors: [
    skater('f1', 'home', '17', { x: 875, y: 370 }, 'RW'),
    skater('d1', 'home', '44', { x: 660, y: 345 }, 'D'),
    skater('d2', 'home', '2', { x: 660, y: 120 }, 'D'),
    skater('c', 'home', '11', { x: 800, y: 255 }, 'C'),
    skater('x1', 'away', '5', { x: 898, y: 325 }, 'D'),
    awayGoalie,
  ],
  routes: [
    // The winger walks the puck up the wall, defender on their back.
    route('f1', [{ x: 875, y: 370 }, { x: 800, y: 372 }], { startAt: 0, durationSeconds: 1.3 }),
    route('x1', [{ x: 898, y: 325 }, { x: 845, y: 350 }], { startAt: 0.5, durationSeconds: 1.2 }),
    // The defenceman reads it and activates down the wall.
    route('d1', [{ x: 660, y: 345 }, { x: 715, y: 368 }, { x: 790, y: 380 }, { x: 865, y: 376 }], { startAt: 0.6, durationSeconds: 2.2 }),
    // Puck left; the winger rotates up to cover the point.
    route('f1', [{ x: 800, y: 372 }, { x: 735, y: 348 }, { x: 670, y: 332 }], { startAt: 1.7, durationSeconds: 1.6 }),
    // The defender turns back with the defenceman, staying on the inside.
    route('x1', [{ x: 845, y: 350 }, { x: 872, y: 338 }], { startAt: 2, durationSeconds: 0.9 }),
    // Far defenceman slides to the middle of the line.
    route('d2', [{ x: 660, y: 120 }, { x: 665, y: 170 }, { x: 668, y: 205 }], { startAt: 2.4, durationSeconds: 1.5 }),
    // The centre goes to the top of the crease.
    route('c', [{ x: 800, y: 255 }, { x: 870, y: 228 }], { startAt: 3, durationSeconds: 1.2 }),
    // The activated D goes to the back post for the rebound.
    route('d1', [{ x: 865, y: 376 }, { x: 890, y: 310 }, { x: 896, y: 262 }], { startAt: 3.3, durationSeconds: 1.4 }),
  ],
  puck: {
    from: 'f1',
    actions: [
      pass('f1', 'd1', { at: 1.4, flightSeconds: 0.5 }),
      pass('d1', 'f1', { at: 3, flightSeconds: 0.7 }),
      pass('f1', 'd2', { at: 4, flightSeconds: 0.6 }),
      shot('d2', { at: 4.9 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

// ============================================================================
// POWER PLAY
// ============================================================================

const ppLowCycleUmbrella = template({
  id: 'tpl-pp-low-cycle-umbrella',
  title: 'Power Play: Low Cycle to Far-Flank One-Timer',
  summary:
    '5-on-4. The puck goes down the strong side and is cycled up the wall, the penalty-kill box shifts with it, and the quarterback swings it to the far flank for a one-timer the box has just been pulled away from.',
  categories: ['power-play', 'passing', 'shooting'],
  tags: ['power play', 'cycle', 'umbrella', 'one-timer', 'special teams', '5v4', 'o-zone'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  durationSeconds: 7,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Power play: quarterback in the middle of the blue line, a flank on each half wall, one forward on the goal line, one at the net front.',
    'Penalty kill: four in a box, two forwards high, two defencemen low.',
  ],
  coachingPoints: [
    'Every pass pulls the box one way - the shot is on the side it just left.',
    'Low cycle: the goal-line forward carries up as the flank rotates down, so the killers have to switch.',
    'Quarterback: walk the line with the puck to freeze the high forward before moving it.',
    'Far flank stays on the off wing, stick loaded, and is ready before the puck arrives.',
    'Net-front player screens the goalie and stops at the top of the crease for the rebound.',
  ],
  progressions: ['The killers play it live after the first pass.'],
  variations: ['The quarterback fakes the far side and shoots through the screen.'],
  actors: [
    skater('qb', 'home', '8', { x: 655, y: 212 }, 'D'),
    skater('h1', 'home', '88', { x: 735, y: 70 }, 'RW'),
    skater('h2', 'home', '19', { x: 735, y: 355 }, 'LW'),
    skater('gl', 'home', '14', { x: 895, y: 335 }, 'F'),
    skater('nf', 'home', '71', { x: 880, y: 195 }, 'C'),
    skater('k1', 'away', '9', { x: 750, y: 165 }, 'F'),
    skater('k2', 'away', '17', { x: 750, y: 255 }, 'F'),
    skater('k3', 'away', '4', { x: 845, y: 165 }, 'D'),
    skater('k4', 'away', '5', { x: 848, y: 258 }, 'D'),
    awayGoalie,
  ],
  routes: [
    // Puck to the strong-side flank: the whole box shifts down.
    route('k2', [{ x: 750, y: 255 }, { x: 775, y: 290 }], { startAt: 0.6, durationSeconds: 1 }),
    route('k1', [{ x: 750, y: 165 }, { x: 745, y: 210 }], { startAt: 0.7, durationSeconds: 1 }),
    route('k3', [{ x: 845, y: 165 }, { x: 858, y: 205 }], { startAt: 0.8, durationSeconds: 1 }),
    route('k4', [{ x: 848, y: 258 }, { x: 866, y: 288 }], { startAt: 0.8, durationSeconds: 1 }),
    // Puck down to the goal line: the low killer has to go out to it.
    route('k4', [{ x: 866, y: 288 }, { x: 885, y: 312 }], { startAt: 2, durationSeconds: 0.8 }),
    // The cycle: goal-line forward carries up the wall, the flank rotates down.
    route('gl', [{ x: 895, y: 335 }, { x: 900, y: 360 }, { x: 860, y: 372 }, { x: 815, y: 365 }], { startAt: 2.3, durationSeconds: 1.3 }),
    route('h2', [{ x: 735, y: 355 }, { x: 790, y: 335 }, { x: 860, y: 325 }, { x: 900, y: 320 }], { startAt: 2.4, durationSeconds: 1.6 }),
    // The quarterback slides toward the strong side for the outlet.
    route('qb', [{ x: 655, y: 212 }, { x: 665, y: 250 }], { startAt: 3, durationSeconds: 0.9 }),
    // The far flank steps down into the shooting lane.
    route('h1', [{ x: 735, y: 70 }, { x: 752, y: 102 }], { startAt: 3.9, durationSeconds: 0.9 }),
    // The net-front forward slides to the goalie's eyes.
    route('nf', [{ x: 880, y: 195 }, { x: 888, y: 182 }], { startAt: 4.4, durationSeconds: 0.6 }),
  ],
  puck: {
    from: 'qb',
    actions: [
      pass('qb', 'h2', { at: 0.5, flightSeconds: 0.7 }),
      pass('h2', 'gl', { at: 1.6, flightSeconds: 0.6 }),
      pass('gl', 'qb', { at: 3.75, flightSeconds: 0.8 }),
      pass('qb', 'h1', { at: 4.6, flightSeconds: 0.8, passType: 'one-touch' }),
      shot('h1', { at: 5.6 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

const pp131WallCycle = template({
  id: 'tpl-pp-131-wall-cycle',
  title: 'Power Play 1-3-1: Wall Rotation to the Bumper',
  summary:
    '5-on-4. Half wall and goal line swap spots with the puck, the killer chasing it is pulled down the wall, and the bumper one-touches it to the weak-side flank for the shot.',
  categories: ['power-play', 'passing', 'shooting'],
  tags: ['power play', 'cycle', '1-3-1', 'bumper', 'rotation', 'special teams', '5v4', 'o-zone'],
  ageBands: ['u15', 'u18', 'adult'],
  skillLevel: 'elite',
  rinkArea: 'half',
  durationMinutes: 12,
  durationSeconds: 6.5,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Power play in a 1-3-1: one at the top, the half wall, the bumper in the slot, the weak-side flank, and one on the goal line.',
    'Penalty kill in a box, the strong-side forward on the half wall.',
  ],
  coachingPoints: [
    'Half wall and goal line rotate: one carries up, the other drops below them - the killer has to choose.',
    'Bumper lives in the soft spot between the four killers and gives one-touch passes.',
    'Weak-side flank: off the wall and into the lane as the puck goes to the bumper.',
    'Shoot for the far pad; the low forward is at the top of the crease for the screen and the rebound.',
  ],
  progressions: ['The killers are live; the bumper must find the seam or reset to the top.'],
  variations: ['The bumper shoots it himself when the high killer cheats to the flank.'],
  actors: [
    skater('top', 'home', '8', { x: 655, y: 212 }, 'D'),
    skater('hw', 'home', '88', { x: 760, y: 348 }, 'RW'),
    skater('gl', 'home', '14', { x: 912, y: 332 }, 'F'),
    skater('b', 'home', '19', { x: 790, y: 212 }, 'C'),
    skater('ws', 'home', '71', { x: 770, y: 80 }, 'LW'),
    skater('k1', 'away', '9', { x: 720, y: 245 }, 'F'),
    skater('k2', 'away', '17', { x: 800, y: 290 }, 'F'),
    skater('k3', 'away', '4', { x: 862, y: 250 }, 'D'),
    skater('k4', 'away', '5', { x: 852, y: 165 }, 'D'),
    awayGoalie,
  ],
  routes: [
    // The rotation: the goal-line forward carries up the wall...
    route('gl', [{ x: 912, y: 332 }, { x: 880, y: 362 }, { x: 822, y: 358 }], { startAt: 1.2, durationSeconds: 1.4 }),
    // ...as the half-wall forward drops down inside them to the goal line.
    route('hw', [{ x: 760, y: 348 }, { x: 805, y: 328 }, { x: 880, y: 318 }, { x: 915, y: 322 }], { startAt: 1.0, durationSeconds: 1.6 }),
    // The strong-side killer chases the puck down the wall.
    route('k2', [{ x: 800, y: 290 }, { x: 838, y: 330 }, { x: 852, y: 342 }], { startAt: 1.4, durationSeconds: 1.2 }),
    // The bumper finds the soft spot.
    route('b', [{ x: 790, y: 212 }, { x: 795, y: 235 }], { startAt: 2.6, durationSeconds: 0.7 }),
    // The weak-side flank steps off the wall into the lane.
    route('ws', [{ x: 770, y: 80 }, { x: 790, y: 110 }], { startAt: 3.2, durationSeconds: 0.9 }),
    // Now low, the half-wall forward steps to the top of the crease for the screen.
    route('hw', [{ x: 915, y: 322 }, { x: 905, y: 282 }, { x: 892, y: 250 }], { startAt: 3.2 }),
    // The high killer collapses on the bumper, a step too late.
    route('k1', [{ x: 720, y: 245 }, { x: 742, y: 232 }], { startAt: 3.3, durationSeconds: 0.7 }),
  ],
  puck: {
    from: 'hw',
    actions: [
      pass('hw', 'gl', { at: 0.5, flightSeconds: 0.6 }),
      pass('gl', 'b', { at: 3.2, flightSeconds: 0.5 }),
      pass('b', 'ws', { at: 3.8, flightSeconds: 0.6, passType: 'one-touch' }),
      shot('ws', { at: 4.7 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

const pp5v3Triangle = template({
  id: 'tpl-pp-5v3-triangle',
  title: '5-on-3 Power Play: Move the Triangle',
  summary:
    'Against a three-man triangle, the puck goes low to high and D-to-D so the top killer has to slide across, then down the weak side for a one-timer from the low slot.',
  categories: ['power-play', 'passing', 'shooting'],
  tags: ['power play', '5v3', 'triangle', 'd-to-d', 'one-timer', 'special teams', 'o-zone'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 10,
  durationSeconds: 5.5,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Five attackers: two on the points, one on the half wall with the puck, one on the goal line, one low on the weak side.',
    'Three killers in a triangle: one high, two low beside the net.',
  ],
  coachingPoints: [
    'A triangle cannot cover both points and the low weak side - make the top killer choose.',
    'D-to-D quickly: the top killer is sliding, so the far point has time.',
    'Weak-side forward stays low and hidden until the puck reaches the far point.',
    'Goal-line forward goes to the net on the pass: screen and rebound.',
  ],
  progressions: ['The killers are live, and the attack must still score within three passes.'],
  variations: ['The far point shoots through the screen if the top killer does not get across.'],
  actors: [
    skater('p1', 'home', '2', { x: 655, y: 120 }, 'D'),
    skater('p2', 'home', '8', { x: 655, y: 305 }, 'D'),
    skater('hw', 'home', '88', { x: 770, y: 352 }, 'RW'),
    skater('gl', 'home', '14', { x: 910, y: 330 }, 'F'),
    skater('bd', 'home', '19', { x: 880, y: 108 }, 'LW'),
    skater('k1', 'away', '9', { x: 760, y: 215 }, 'F'),
    skater('k2', 'away', '4', { x: 860, y: 268 }, 'D'),
    skater('k3', 'away', '5', { x: 858, y: 165 }, 'D'),
    awayGoalie,
  ],
  routes: [
    // The top killer chases the puck to the near point...
    route('k1', [{ x: 760, y: 215 }, { x: 738, y: 262 }], { startAt: 0.6, durationSeconds: 1 }),
    // ...and has to slide all the way back across on the D-to-D.
    route('k1', [{ x: 738, y: 262 }, { x: 728, y: 180 }], { startAt: 1.8, durationSeconds: 1.2 }),
    // The goal-line forward goes to the net.
    route('gl', [{ x: 910, y: 330 }, { x: 900, y: 272 }, { x: 893, y: 240 }], { startAt: 2, durationSeconds: 1.2 }),
    // The weak-side forward steps into the low slot.
    route('bd', [{ x: 880, y: 108 }, { x: 878, y: 138 }], { startAt: 2.6, durationSeconds: 0.8 }),
  ],
  puck: {
    from: 'hw',
    actions: [
      pass('hw', 'p2', { at: 0.5, flightSeconds: 0.7 }),
      pass('p2', 'p1', { at: 1.6, flightSeconds: 0.8 }),
      pass('p1', 'bd', { at: 2.8, flightSeconds: 0.7, passType: 'one-touch' }),
      shot('bd', { at: 3.8 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

// ============================================================================
// CYCLE READS - stop, change direction, find the seam
// ============================================================================

const stopUpCycle = template({
  id: 'tpl-cycle-stop-up-escape',
  title: 'Stop-Up Cycle: Escape Up the Wall to the Point',
  summary:
    'The winger drives deep with a defender chasing, stops hard on the wall, and escapes back up it as the defender over-commits to the corner; the puck goes to the point for a shot through the centre’s screen.',
  categories: ['puck-handling', 'passing', 'shooting', 'battle'],
  tags: ['cycle', 'o-zone', 'stop up', 'puck protection', 'low to high', 'screen'],
  ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 10,
  durationSeconds: 6.5,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Winger with the puck on the half wall, centre in the high slot, a defenceman at the near point.',
    'One defender starts at the faceoff dot and chases the winger into the corner.',
  ],
  coachingPoints: [
    'Drive deep enough to pull the defender below the goal line with you.',
    'Stop on the inside edges with the puck on the boards side - body between the defender and the puck.',
    'Out of the stop, the first stride is up the wall, away from the defender’s momentum.',
    'Centre goes to the net as soon as the winger stops: the point shot needs a screen.',
    'Point: walk to the middle and shoot low for a tip or a rebound.',
  ],
  progressions: ['The defender is live: if they do not over-commit, the winger takes the puck to the net instead.'],
  variations: ['Stop up and hit the centre in the slot instead of the point.'],
  actors: [
    skater('f1', 'home', '17', { x: 760, y: 370 }, 'RW'),
    skater('f2', 'home', '11', { x: 800, y: 290 }, 'C'),
    skater('d1', 'home', '4', { x: 660, y: 335 }, 'D'),
    skater('x1', 'away', '5', { x: 870, y: 318 }, 'D'),
    awayGoalie,
  ],
  routes: [
    // Drive deep...
    route('f1', [{ x: 760, y: 370 }, { x: 850, y: 380 }, { x: 905, y: 368 }], { startAt: 0 }),
    // ...stop, and escape back up the wall.
    route('f1', [{ x: 905, y: 368 }, { x: 862, y: 380 }, { x: 805, y: 372 }], { startAt: 2.3 }),
    // The defender chases and over-commits to the corner.
    route('x1', [{ x: 870, y: 318 }, { x: 900, y: 340 }, { x: 918, y: 358 }], { startAt: 0.4 }),
    // ...and has to turn back to the net front.
    route('x1', [{ x: 918, y: 358 }, { x: 900, y: 300 }, { x: 893, y: 262 }], { startAt: 3.2 }),
    // The centre goes to the net for the screen.
    route('f2', [{ x: 800, y: 290 }, { x: 860, y: 250 }, { x: 885, y: 228 }], { startAt: 1.8 }),
    // The point walks to the middle for a lane.
    route('d1', [{ x: 660, y: 335 }, { x: 670, y: 290 }], { startAt: 3 }),
  ],
  puck: {
    from: 'f1',
    actions: [pass('f1', 'd1', { at: 3.9, flightSeconds: 0.6 }), shot('d1', { at: 5 })],
  },
  finishPolicy: 'finish-with-shot',
});

const reverseBehindNet = template({
  id: 'tpl-cycle-reverse-behind-net',
  title: 'Behind-the-Net Reverse & Walk-Out',
  summary:
    'The carrier takes the puck behind the net; the defender jumps the near post to stop the wrap-around, so the carrier reverses it back along the end boards to the forward trailing the play, who walks out from the goal line and shoots.',
  categories: ['passing', 'puck-handling', 'shooting'],
  tags: ['cycle', 'o-zone', 'reverse', 'behind the net', 'walk out', 'back door'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'quarter',
  durationMinutes: 10,
  durationSeconds: 6,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Two forwards in the right corner, the carrier ahead of the trailer.',
    'One defender at the top of the circle who reads the carrier.',
  ],
  coachingPoints: [
    'Carrier: go behind the net with speed and look for the defender - if they jump the post, the reverse is open.',
    'Reverse the puck hard along the boards, behind your own skates, to where the trailer is going.',
    'Trailer: stay a stick length behind and below the carrier so the reverse comes to you in stride.',
    'Walk off the goal line toward the slot before shooting - make the goalie move with you.',
    'The carrier keeps going around to the back door for the rebound.',
  ],
  progressions: ['The defender reads it live and may take the wrap or the reverse.'],
  variations: ['If the defender stays home, the carrier wraps it on the far side.'],
  actors: [
    skater('f1', 'home', '19', { x: 880, y: 360 }, 'LW'),
    skater('f2', 'home', '91', { x: 820, y: 332 }, 'C'),
    skater('x1', 'away', '4', { x: 850, y: 290 }, 'D'),
    awayGoalie,
  ],
  routes: [
    // Behind the net, heading for the far side.
    route('f1', [{ x: 880, y: 360 }, { x: 935, y: 335 }, { x: 972, y: 262 }, { x: 972, y: 190 }], { startAt: 0 }),
    // On around to the back door once the puck is gone.
    route('f1', [{ x: 972, y: 190 }, { x: 958, y: 148 }, { x: 918, y: 172 }], { startAt: 2.7 }),
    // The defender jumps the near post to take away the wrap-around.
    route('x1', [{ x: 850, y: 290 }, { x: 912, y: 282 }, { x: 932, y: 232 }], { startAt: 0.5 }),
    // The trailer follows into the corner, below the carrier.
    route('f2', [{ x: 820, y: 332 }, { x: 895, y: 372 }, { x: 942, y: 352 }], { startAt: 0.7 }),
    // ...takes the reverse, and walks off the goal line.
    route('f2', [{ x: 942, y: 352 }, { x: 915, y: 302 }, { x: 878, y: 266 }], { startAt: 3.1 }),
  ],
  puck: {
    from: 'f1',
    actions: [pass('f1', 'f2', { at: 2.3, flightSeconds: 0.6 }), shot('f2', { at: 5 })],
  },
  finishPolicy: 'finish-with-shot',
});

const weakSideSneak = template({
  id: 'tpl-cycle-weak-side-d-sneak',
  title: 'Weak-Side D Sneak to the Back Door',
  summary:
    'While the forwards hold the puck low on the strong side, the weak-side defenceman sneaks down to the back door. The goal-line forward draws the net-front defender to the post and bumps it up to the half wall, and the half-wall forward hits the sneak through the seam for a one-timer.',
  categories: ['passing', 'shooting'],
  tags: ['cycle', 'o-zone', 'd activation', 'back door', 'seam pass', 'one-timer'],
  ageBands: ['u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 10,
  durationSeconds: 5,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Strong side: a forward on the goal line with the puck, one on the half wall, a defenceman at the point.',
    'Weak side: a defenceman at the point. Two defenders: one on the half wall, one at the net front.',
  ],
  coachingPoints: [
    'Every defender is watching the puck below the goal line - that is when the weak-side D goes.',
    'Sneak in down the middle of the far circle, stick down and loaded for a one-timer.',
    'Strong-side D slides to the middle of the line: someone always covers the blue line.',
    'Goal-line forward: walk up toward the post to pull the defender and the goalie with you, then bump it up the wall.',
    'Half wall: step off the boards to open the seam, and pass it through before the defender recovers.',
    'With the goalie sealing the near post, the far side of the net is the target.',
  ],
  progressions: ['The net-front defender is live and may cheat to the back door.'],
  variations: ['If the seam closes, the half wall goes D-to-D through the strong-side D in the middle.'],
  actors: [
    skater('gl', 'home', '17', { x: 900, y: 362 }, 'RW'),
    skater('hw', 'home', '11', { x: 790, y: 368 }, 'C'),
    skater('d1', 'home', '4', { x: 660, y: 330 }, 'D'),
    skater('d2', 'home', '6', { x: 660, y: 112 }, 'D'),
    skater('x1', 'away', '9', { x: 800, y: 300 }, 'F'),
    skater('x2', 'away', '5', { x: 878, y: 252 }, 'D'),
    awayGoalie,
  ],
  routes: [
    // The goal-line forward walks up a stride with the puck and stops.
    route('gl', [{ x: 900, y: 362 }, { x: 928, y: 330 }, { x: 925, y: 302 }], { startAt: 0.3 }),
    // The weak-side D reads it and sneaks down.
    route('d2', [{ x: 660, y: 112 }, { x: 772, y: 128 }, { x: 878, y: 150 }], { startAt: 0.8 }),
    // The strong-side D slides to the middle to cover the line.
    route('d1', [{ x: 660, y: 330 }, { x: 664, y: 260 }, { x: 666, y: 212 }], { startAt: 1.4 }),
    // The net-front defender jumps the goal-line carrier at the post.
    route('x2', [{ x: 878, y: 252 }, { x: 905, y: 285 }], { startAt: 0.8 }),
    // The half-wall forward steps off the boards to open the seam...
    route('hw', [{ x: 790, y: 368 }, { x: 800, y: 344 }], { startAt: 1.4 }),
    // ...as the defender pressures them from above.
    route('x1', [{ x: 800, y: 300 }, { x: 772, y: 328 }], { startAt: 1.2 }),
  ],
  puck: {
    from: 'gl',
    actions: [
      pass('gl', 'hw', { at: 1.7, flightSeconds: 0.5 }),
      pass('hw', 'd2', { at: 2.8, flightSeconds: 0.6, passType: 'one-touch' }),
      shot('d2', { at: 3.8 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
});

export const CYCLE_TEMPLATES: DrillTemplate[] = [
  stopUpCycle,
  reverseBehindNet,
  weakSideSneak,
  twoManLowCycle,
  threeManCycle,
  cycleDefenceActivation,
  ppLowCycleUmbrella,
  pp131WallCycle,
  pp5v3Triangle,
];
