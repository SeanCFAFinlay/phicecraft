// ============================================================================
// TOP TEN SCORING PACK
//
// A ready-to-run first-party pack for a coach who wants the most useful
// passing-to-finish patterns without building a session from scratch. Every
// drill has a pass chain and a finishing shot, so the puck never stops at a
// warm-up pass with no scoring outcome.
//
// Each of the ten is staged where it is actually played. A drill that names
// opposition ("3v2", "drive wide on the defender") has that opposition on the
// ice, and none of the ten repeats a play the rest of the catalogue already
// teaches - a pack that is the same four skaters running the same three
// passes under ten titles is one drill, not ten.
//
// The home team attacks the right-hand net throughout.
// ============================================================================

import {
  goalie,
  pass,
  route,
  shot,
  skater,
  template,
  RINK_LANDMARKS as L,
  type DrillTemplate,
  type TemplateSpec,
} from './builder';

const keeper = goalie('g1', 'away', '30', { x: 920, y: L.centreY });

type PackSpec = Omit<TemplateSpec, 'ageBands' | 'finishPolicy' | 'equipmentSummary' | 'tags'> & {
  tags: string[];
  ageBands?: TemplateSpec['ageBands'];
};

function scoringDrill(spec: PackSpec): DrillTemplate {
  return template({
    ageBands: ['u11', 'u13', 'u15', 'u18', 'adult'],
    ...spec,
    tags: ['top 10', ...spec.tags],
    finishPolicy: 'finish-with-shot',
    equipmentSummary: ['Pucks', '1 net'],
  });
}

export const TOP_TEN_TEMPLATES: DrillTemplate[] = [
  // --------------------------------------------------------------------------
  // 1. Low - point - weak side. The simplest scoring triangle there is.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-triangle-one-timer',
    title: 'Triangle Passing & One-Timer',
    summary:
      'The puck goes low to high to the weak side, and the weak-side skater steps into a one-timer while the passer screens.',
    categories: ['passing', 'shooting', 'warm-up'],
    tags: ['passing', 'one-timer', 'timing', 'low to high'],
    skillLevel: 'developing',
    rinkArea: 'half',
    durationMinutes: 8,
    durationSeconds: 7,
    actors: [
      skater('p1', 'home', '9', { x: 885, y: 345 }, 'RW'),
      skater('p2', 'home', '4', { x: 665, y: 330 }, 'D'),
      skater('p3', 'home', '11', { x: 670, y: 105 }, 'LW'),
      keeper,
    ],
    routes: [
      // The low player goes to the net as soon as the puck leaves the stick.
      route('p1', [{ x: 885, y: 345 }, { x: 905, y: 290 }, { x: 898, y: 240 }], { startAt: 1 }),
      route('p2', [{ x: 665, y: 330 }, { x: 672, y: 255 }], { startAt: 0.4 }),
      route('p3', [{ x: 670, y: 105 }, { x: 740, y: 120 }, { x: 800, y: 160 }], { startAt: 1.8 }),
    ],
    puck: {
      from: 'p1',
      actions: [
        pass('p1', 'p2', { at: 0.8, flightSeconds: 1 }),
        pass('p2', 'p3', { at: 3.2, passType: 'one-touch' }),
        shot('p3', { at: 4.6 }),
      ],
    },
    setupNotes: [
      'One skater low in the corner with the pucks, one at the strong-side point, one at the weak-side point.',
      'Rotate low to point to weak side after every shot.',
    ],
    coachingPoints: [
      'Show a target before the pass.',
      'The point player moves to the middle before passing, so the weak side opens.',
      'Shooter arrives as the puck does - skate into the shot, do not wait for it.',
    ],
    progressions: ['Add a passive defender in the high slot who takes away one option.'],
    variations: ['The weak-side skater fakes the shot and slides it to the screener for a tap-in.'],
  }),

  // --------------------------------------------------------------------------
  // 2. Give-and-go around a defender.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-give-and-go',
    title: 'Give-and-Go to the Net',
    summary:
      'The passer moves the puck to the wall, cuts behind the defender, takes it back in stride and finishes.',
    categories: ['passing', 'shooting', 'skating'],
    tags: ['give and go', 'cutting', 'release', '2v1'],
    skillLevel: 'developing',
    rinkArea: 'half',
    durationMinutes: 8,
    durationSeconds: 7,
    actors: [
      skater('p1', 'home', '9', { x: 655, y: 330 }, 'C'),
      skater('p2', 'home', '11', { x: 795, y: 310 }, 'RW'),
      skater('x1', 'away', '5', { x: 735, y: 245 }, 'D'),
      keeper,
    ],
    routes: [
      route('p1', [{ x: 655, y: 330 }, { x: 735, y: 195 }, { x: 850, y: 190 }], { startAt: 0.7 }),
      route('p2', [{ x: 795, y: 310 }, { x: 810, y: 300 }], { startAt: 0.4 }),
      // The defender steps to the puck on the wall - which is what opens the cut.
      route('x1', [{ x: 735, y: 245 }, { x: 760, y: 272 }], { startAt: 1, movement: 'backward' }),
    ],
    puck: {
      from: 'p1',
      actions: [
        pass('p1', 'p2', { at: 0.6 }),
        pass('p2', 'p1', { at: 2.5, passType: 'one-touch' }),
        shot('p1', { at: 4.2 }),
      ],
    },
    setupNotes: [
      'Attacker with the puck at the blue line, a partner on the half wall, one defender between them.',
      'Rotate attacker to wall to defender.',
    ],
    coachingPoints: [
      'Pass and immediately accelerate - the first three strides beat the defender.',
      'Cut behind the defender’s back, not across their stick.',
      'The wall player returns it first touch, into space ahead of the cutter.',
    ],
    progressions: ['Let the defender play live once the first pass is made.'],
    variations: ['The wall player fakes the return and walks to the middle to shoot.'],
  }),

  // --------------------------------------------------------------------------
  // 3. Cycle the puck low, find the slot.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-corner-cycle',
    title: 'Corner Cycle & Slot Finish',
    summary:
      'The carrier takes the puck down the wall, leaves it for the next forward, and the cycle finds a third attacker arriving in the slot.',
    categories: ['passing', 'shooting', 'small-area-game'],
    tags: ['cycle', 'corner', 'slot', 'puck protection'],
    skillLevel: 'developing',
    rinkArea: 'quarter',
    durationMinutes: 10,
    durationSeconds: 8,
    actors: [
      skater('f1', 'home', '9', { x: 780, y: 362 }, 'RW'),
      skater('f2', 'home', '17', { x: 705, y: 335 }, 'C'),
      skater('f3', 'home', '11', { x: 700, y: 195 }, 'LW'),
      skater('x1', 'away', '5', { x: 850, y: 325 }, 'D'),
      keeper,
    ],
    routes: [
      route('f1', [{ x: 780, y: 362 }, { x: 850, y: 372 }, { x: 895, y: 380 }]),
      route('f2', [{ x: 705, y: 335 }, { x: 770, y: 355 }, { x: 805, y: 358 }], { startAt: 0.8 }),
      route('f3', [{ x: 700, y: 195 }, { x: 780, y: 205 }, { x: 840, y: 220 }], { startAt: 2.6 }),
      route('x1', [{ x: 850, y: 325 }, { x: 900, y: 345 }], { startAt: 0.6 }),
    ],
    puck: {
      from: 'f1',
      actions: [
        pass('f1', 'f2', { at: 2.6 }),
        pass('f2', 'f3', { at: 4.4 }),
        shot('f3', { at: 5.7 }),
      ],
    },
    setupNotes: [
      'Three forwards and one defender in one corner. Play starts on the half wall.',
      'The defender plays the puck carrier honestly; change the defender every three reps.',
    ],
    coachingPoints: [
      'Keep your body between the defender and the puck going down the wall.',
      'Leave the puck on the wall for the next forward - do not pass it through the defender.',
      'The third forward stays high until the cycle turns, then arrives in the slot with speed.',
    ],
    progressions: ['Add a second defender in the slot so the third forward has to find a lane.'],
    variations: ['The second forward walks out of the corner and shoots short side instead of passing.'],
  }),

  // --------------------------------------------------------------------------
  // 4. Regroup and attack two defenders with three lanes.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-regroup-3v2',
    title: 'Neutral-Zone Regroup & 3v2',
    summary:
      'The defence go D-to-D, hit the centre swinging underneath, and three forwards attack two retreating defenders in three lanes.',
    categories: ['transition', 'rush', 'passing', 'shooting'],
    tags: ['regroup', '3v2', 'middle drive', 'd-to-d'],
    ageBands: ['u13', 'u15', 'u18', 'adult'],
    skillLevel: 'advanced',
    rinkArea: 'full',
    durationMinutes: 12,
    durationSeconds: 9,
    actors: [
      skater('d1', 'home', '4', { x: 430, y: 285 }, 'D'),
      skater('d2', 'home', '5', { x: 430, y: 140 }, 'D'),
      skater('f1', 'home', '11', { x: 560, y: 85 }, 'LW'),
      skater('f2', 'home', '9', { x: 545, y: 212 }, 'C'),
      skater('f3', 'home', '17', { x: 560, y: 340 }, 'RW'),
      skater('x1', 'away', '2', { x: 690, y: 165 }, 'D'),
      skater('x2', 'away', '3', { x: 690, y: 262 }, 'D'),
      keeper,
    ],
    routes: [
      route('f2', [{ x: 545, y: 212 }, { x: 490, y: 190 }, { x: 560, y: 150 }, { x: 720, y: 165 }, { x: 790, y: 150 }]),
      route('f1', [{ x: 560, y: 85 }, { x: 520, y: 75 }, { x: 680, y: 70 }, { x: 870, y: 150 }], { startAt: 1 }),
      route('f3', [{ x: 560, y: 340 }, { x: 520, y: 350 }, { x: 680, y: 350 }, { x: 815, y: 310 }], { startAt: 1 }),
      route('x1', [{ x: 690, y: 165 }, { x: 850, y: 185 }], { startAt: 1.8, movement: 'backward' }),
      route('x2', [{ x: 690, y: 262 }, { x: 850, y: 245 }], { startAt: 1.8, movement: 'backward' }),
    ],
    puck: {
      from: 'd1',
      actions: [
        pass('d1', 'd2', { at: 0.6 }),
        pass('d2', 'f2', { at: 2.1 }),
        pass('f2', 'f3', { at: 4.6 }),
        shot('f3', { at: 6.6 }),
      ],
    },
    setupNotes: [
      'Two defencemen at the near blue line, three forwards in the neutral zone, two defenders at the far blue line.',
      'Forwards curl back toward their own defence before turning up ice.',
    ],
    coachingPoints: [
      'Forwards come back to the puck - a regroup is skated, not waited for.',
      'The centre swings underneath and receives with speed through the middle.',
      'Fill three lanes: the middle lane drives the net and takes a defender with it.',
      'Move it wide early so the shot comes from a defender who is still backing up.',
    ],
    progressions: ['Add a backchecker who starts from the red line on the D-to-D pass.'],
    variations: ['The wide forward pulls up and hits the late defenceman as a fourth attacker.'],
  }),

  // --------------------------------------------------------------------------
  // 5. Low to high, traffic, shot through.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-low-high-point-shot',
    title: 'Low-to-High Point Shot',
    summary:
      'The forwards work the puck low, send it to the point, and the defenceman walks to the middle and shoots through a screen.',
    categories: ['passing', 'shooting'],
    tags: ['low to high', 'point shot', 'screen', 'tip'],
    skillLevel: 'beginner',
    rinkArea: 'half',
    durationMinutes: 8,
    durationSeconds: 7,
    actors: [
      skater('f1', 'home', '17', { x: 785, y: 355 }, 'RW'),
      skater('f2', 'home', '9', { x: 890, y: 362 }, 'C'),
      skater('f3', 'home', '11', { x: 880, y: 150 }, 'LW'),
      skater('d1', 'home', '4', { x: 655, y: 320 }, 'D'),
      skater('x1', 'away', '5', { x: 850, y: 285 }, 'D'),
      keeper,
    ],
    routes: [
      route('d1', [{ x: 655, y: 320 }, { x: 660, y: 225 }], { startAt: 1.6 }),
      // The far-side forward gets to the top of the crease for the screen.
      route('f3', [{ x: 880, y: 150 }, { x: 898, y: 200 }], { startAt: 1.2 }),
      route('f1', [{ x: 785, y: 355 }, { x: 830, y: 250 }], { startAt: 1 }),
    ],
    puck: {
      from: 'f1',
      actions: [
        pass('f1', 'f2', { at: 0.5 }),
        pass('f2', 'd1', { at: 2, flightSeconds: 1.1 }),
        shot('d1', { at: 4.2 }),
      ],
    },
    setupNotes: [
      'Two forwards on the strong side, one on the weak side, a defenceman at the point, one defender low.',
      'Every shot is followed to the net: play the rebound until the whistle.',
    ],
    coachingPoints: [
      'The low forward looks up the wall before the puck arrives.',
      'The defenceman walks to the middle before shooting - a shot from the wall hits shin pads.',
      'Screen at the top of the crease, stick on the ice for the tip.',
    ],
    progressions: ['Add a second defender who fronts the point shot.'],
    variations: ['The defenceman fakes the shot and slides it to the weak-side forward for a one-timer.'],
  }),

  // --------------------------------------------------------------------------
  // 6. From behind the net into the slot.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-behind-net-feed',
    title: 'Behind-the-Net Feed to the Slot',
    summary:
      'A forward takes the puck behind the goal line, makes the goalie turn, and feeds a teammate arriving in the slot.',
    categories: ['passing', 'shooting'],
    tags: ['behind the net', 'slot', 'goal line', 'timing'],
    skillLevel: 'developing',
    rinkArea: 'quarter',
    durationMinutes: 8,
    durationSeconds: 8,
    actors: [
      skater('d1', 'home', '4', { x: 665, y: 320 }, 'D'),
      skater('f1', 'home', '9', { x: 885, y: 350 }, 'C'),
      skater('f2', 'home', '11', { x: 750, y: 175 }, 'LW'),
      skater('x1', 'away', '5', { x: 895, y: 185 }, 'D'),
      keeper,
    ],
    routes: [
      route('f1', [{ x: 885, y: 350 }, { x: 940, y: 335 }, { x: 970, y: 278 }], { startAt: 1.5 }),
      route('f2', [{ x: 750, y: 175 }, { x: 820, y: 195 }, { x: 868, y: 222 }], { startAt: 2.6 }),
    ],
    puck: {
      from: 'd1',
      actions: [
        pass('d1', 'f1', { at: 0.5 }),
        pass('f1', 'f2', { at: 4.2 }),
        shot('f2', { at: 5.5 }),
      ],
    },
    setupNotes: [
      'A defenceman at the point with the pucks, one forward in the corner, one high on the weak side, one defender at the far post.',
      'The slot forward does not leave until the carrier is behind the goal line.',
    ],
    coachingPoints: [
      'Carry it below the goal line so the goalie and defender both have to turn.',
      'The slot forward arrives late, with the stick on the ice and already loaded.',
      'Pass to the stick side of the shooter so the release is one motion.',
    ],
    progressions: ['Let the defender choose: chase behind the net, or stay with the slot.'],
    variations: ['The carrier stuffs the far post on a wraparound if the defender leaves for the slot.'],
  }),

  // --------------------------------------------------------------------------
  // 7. One long pass, one skater, one goalie.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-stretch-breakaway',
    title: 'Stretch Pass Breakaway',
    summary:
      'The defence move it D-to-D and hit a winger leaving the zone at full speed, who goes in alone with a defender chasing.',
    categories: ['breakout', 'passing', 'rush', 'shooting'],
    tags: ['stretch pass', 'breakaway', 'd-to-d', 'speed'],
    skillLevel: 'developing',
    rinkArea: 'full',
    durationMinutes: 10,
    durationSeconds: 10,
    actors: [
      skater('d1', 'home', '4', { x: 120, y: 265 }, 'D'),
      skater('d2', 'home', '5', { x: 145, y: 150 }, 'D'),
      skater('f1', 'home', '11', { x: 350, y: 85 }, 'LW'),
      skater('f2', 'home', '9', { x: 300, y: 215 }, 'C'),
      skater('x1', 'away', '2', { x: 440, y: 215 }, 'D'),
      keeper,
    ],
    routes: [
      route('f1', [{ x: 350, y: 85 }, { x: 600, y: 105 }, { x: 790, y: 175 }, { x: 870, y: 205 }], { startAt: 1.6 }),
      route('f2', [{ x: 300, y: 215 }, { x: 560, y: 240 }, { x: 800, y: 265 }], { startAt: 2.4 }),
      route('x1', [{ x: 440, y: 215 }, { x: 640, y: 190 }, { x: 815, y: 228 }], { startAt: 3.2 }),
    ],
    puck: {
      from: 'd1',
      actions: [
        pass('d1', 'd2', { at: 0.5 }),
        pass('d2', 'f1', { at: 2.2, flightSeconds: 1.4 }),
        shot('f1', { at: 7.6 }),
      ],
    },
    setupNotes: [
      'Two defencemen below their own circles, a winger at the near blue line, a centre in support, one defender in the neutral zone.',
      'The defender may not leave until the stretch pass is released.',
    ],
    coachingPoints: [
      'The winger leaves on the D-to-D pass, not before - time it to stay onside.',
      'Lead the winger: pass to where they will be at the red line.',
      'On the breakaway, take the middle of the ice away from the chasing defender.',
      'The centre follows for the rebound; nobody watches a breakaway.',
    ],
    progressions: ['Start the defender level with the winger so the breakaway becomes a race.'],
    variations: ['The winger bumps it back to the centre, who carries it in.'],
  }),

  // --------------------------------------------------------------------------
  // 8. Enter wide, leave it for the trailer.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-drop-pass-entry',
    title: 'Drop Pass Zone Entry',
    summary:
      'The carrier drives wide and takes a defender deep, leaves the puck for the trailer, and the trailer shoots from the high slot.',
    categories: ['rush', 'transition', 'passing', 'shooting'],
    tags: ['drop pass', 'zone entry', 'trailer', '3v2'],
    ageBands: ['u13', 'u15', 'u18', 'adult'],
    skillLevel: 'advanced',
    rinkArea: 'half',
    durationMinutes: 10,
    durationSeconds: 8,
    actors: [
      skater('f1', 'home', '17', { x: 480, y: 305 }, 'RW'),
      skater('f2', 'home', '9', { x: 420, y: 255 }, 'C'),
      skater('f3', 'home', '11', { x: 500, y: 150 }, 'LW'),
      skater('x1', 'away', '3', { x: 665, y: 290 }, 'D'),
      skater('x2', 'away', '2', { x: 665, y: 165 }, 'D'),
      keeper,
    ],
    routes: [
      route('f1', [{ x: 480, y: 305 }, { x: 640, y: 335 }, { x: 730, y: 320 }, { x: 800, y: 345 }]),
      route('f2', [{ x: 420, y: 255 }, { x: 600, y: 292 }, { x: 700, y: 272 }, { x: 765, y: 222 }], { startAt: 1.4 }),
      route('f3', [{ x: 500, y: 150 }, { x: 700, y: 160 }, { x: 885, y: 185 }], { startAt: 0.4 }),
      route('x1', [{ x: 665, y: 290 }, { x: 790, y: 305 }], { startAt: 0.6, movement: 'backward' }),
      route('x2', [{ x: 665, y: 165 }, { x: 850, y: 195 }], { startAt: 0.8, movement: 'backward' }),
    ],
    puck: {
      from: 'f1',
      actions: [
        pass('f1', 'f2', { at: 3.3, flightSeconds: 0.7 }),
        shot('f2', { at: 5.9 }),
      ],
    },
    setupNotes: [
      'Three forwards start in the neutral zone against two defenders at the blue line.',
      'The trailer stays a stick-length inside and two strides behind the carrier.',
    ],
    coachingPoints: [
      'The carrier attacks with speed so the defender has to keep backing up.',
      'Leave the puck still - a drop pass is placed, not passed.',
      'The middle forward drives the net and pulls the second defender out of the slot.',
      'The trailer shoots in stride through the screen the driver has made.',
    ],
    progressions: ['Add a backchecker who takes the trailer away, so the carrier must read it.'],
    variations: ['The carrier fakes the drop and takes it to the net themselves.'],
  }),

  // --------------------------------------------------------------------------
  // 9. Drive wide, find the back door.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-wide-drive-backdoor',
    title: 'Wide Drive & Backdoor Pass',
    summary:
      'The carrier beats a defender wide and slides the puck across the top of the crease to a teammate arriving at the far post.',
    categories: ['rush', 'passing', 'shooting', 'skating'],
    tags: ['wide drive', 'backdoor', 'far post', '2v1'],
    skillLevel: 'developing',
    rinkArea: 'half',
    durationMinutes: 8,
    durationSeconds: 7,
    actors: [
      skater('f1', 'home', '11', { x: 650, y: 95 }, 'LW'),
      skater('f2', 'home', '17', { x: 650, y: 330 }, 'RW'),
      skater('f3', 'home', '9', { x: 620, y: 212 }, 'C'),
      skater('x1', 'away', '2', { x: 720, y: 150 }, 'D'),
      keeper,
    ],
    routes: [
      route('f1', [{ x: 650, y: 95 }, { x: 800, y: 62 }, { x: 880, y: 100 }]),
      route('f2', [{ x: 650, y: 330 }, { x: 790, y: 305 }, { x: 898, y: 262 }], { startAt: 0.9 }),
      route('f3', [{ x: 620, y: 212 }, { x: 790, y: 212 }], { startAt: 1.4 }),
      route('x1', [{ x: 720, y: 150 }, { x: 840, y: 140 }], { startAt: 0.3, movement: 'backward' }),
    ],
    puck: {
      from: 'f1',
      actions: [
        pass('f1', 'f2', { at: 3.6 }),
        shot('f2', { at: 4.9 }),
      ],
    },
    setupNotes: [
      'Three forwards at the blue line, one defender a stride inside it on the puck side.',
      'Run it down both wings so every skater drives on their forehand and backhand side.',
    ],
    coachingPoints: [
      'Drive wide with the puck on the outside, away from the defender’s stick.',
      'The far-side forward goes to the far post with the stick down - that stick is the target.',
      'Pass it flat and hard across the top of the crease, behind the defender’s heels.',
    ],
    progressions: ['Add a second defender who takes the back door, so the high forward becomes the option.'],
    variations: ['The carrier cuts back and hits the centre trailing into the slot.'],
  }),

  // --------------------------------------------------------------------------
  // 10. High cycle to a D-to-D one-timer.
  // --------------------------------------------------------------------------
  scoringDrill({
    id: 'tpl-top10-d-to-d-one-timer',
    title: 'D-to-D One-Timer',
    summary:
      'The puck goes up the wall to the point and across the blue line, and the far defenceman one-times it through a screen.',
    categories: ['passing', 'shooting'],
    tags: ['d-to-d', 'one-timer', 'point shot', 'screen'],
    ageBands: ['u13', 'u15', 'u18', 'adult'],
    skillLevel: 'advanced',
    rinkArea: 'half',
    durationMinutes: 8,
    durationSeconds: 6,
    actors: [
      skater('f1', 'home', '17', { x: 800, y: 358 }, 'RW'),
      skater('f2', 'home', '9', { x: 880, y: 265 }, 'C'),
      skater('f3', 'home', '11', { x: 850, y: 110 }, 'LW'),
      skater('d1', 'home', '4', { x: 655, y: 330 }, 'D'),
      skater('d2', 'home', '5', { x: 655, y: 115 }, 'D'),
      skater('x1', 'away', '14', { x: 735, y: 255 }, 'F'),
      keeper,
    ],
    routes: [
      route('d2', [{ x: 655, y: 115 }, { x: 690, y: 150 }], { startAt: 1.6 }),
      route('f2', [{ x: 880, y: 265 }, { x: 898, y: 225 }], { startAt: 0.6 }),
      route('f3', [{ x: 850, y: 110 }, { x: 885, y: 165 }], { startAt: 2.4 }),
      // The high forward pressures the first point, which is what frees the second.
      route('x1', [{ x: 735, y: 255 }, { x: 690, y: 300 }], { startAt: 0.8 }),
    ],
    puck: {
      from: 'f1',
      actions: [
        pass('f1', 'd1', { at: 0.6 }),
        pass('d1', 'd2', { at: 2.2, passType: 'one-touch' }),
        shot('d2', { at: 3.5 }),
      ],
    },
    setupNotes: [
      'Three forwards low, two defencemen at the points, one opposing forward covering high.',
      'Forwards rotate through wall, net-front and weak side.',
    ],
    coachingPoints: [
      'The first defenceman moves it before the pressure arrives - one touch if possible.',
      'The second defenceman opens the hips to the net and is loaded before the pass.',
      'Net-front screen takes away the goalie’s eyes; weak-side forward plays the rebound.',
    ],
    progressions: ['Add a second high forward so the pass across has to be disguised.'],
    variations: ['The far defenceman walks to the middle and wrists it instead of one-timing.'],
  }),
];
