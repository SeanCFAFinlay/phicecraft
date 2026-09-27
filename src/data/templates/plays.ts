// ============================================================================
// TACTICAL PLAYS AND SYSTEMS TEMPLATES
//
// Full-ice and half-ice tactical plays: power play, penalty kill, breakouts,
// rush entries, forechecking systems, and offensive zone set plays.
// Original first-party tactical content.
// ============================================================================

import { RINK_LANDMARKS as L, pass, route, shot, dump, skater, goalie, template } from './builder';
import type { DrillTemplate } from './builder';

const awayGoalieRight = goalie('gkr', 'away', '1', { x: 920, y: L.centreY });
const homeGoalieLeft = goalie('gkl', 'home', '30', { x: 80, y: L.centreY });

// ----------------------------------------------------------------------------
// 1. 1-3-1 Power Play: Flank Seam & Bumper One-Timer
// ----------------------------------------------------------------------------

export const powerPlay131: DrillTemplate = template({
  id: 'tpl-play-131-power-play',
  title: '1-3-1 Power Play: Flank & Bumper Shot',
  summary:
    'Classic 1-3-1 umbrella offensive zone setup. Point QB walks the line to open passing seams, working through the half-wall and bumper for a backdoor one-timer.',
  categories: ['power-play', 'shooting', 'passing'],
  tags: ['power-play', '1-3-1', 'one-timer', 'special-teams', 'o-zone'],
  ageBands: ['u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Set up in the offensive zone (attacking the right net).',
    'Point QB (#5) at the center blue line, two flanks (#8, #88) on the half-boards.',
    'Bumper (#19) active in high slot, Net-Front (#97) creating a screen on the goalie.',
  ],
  coachingPoints: [
    'Point QB must walk the line with head up to draw the high penalty killers.',
    'Flank player catches puck in triple-threat position: shoot, bumper dish, or royal road seam.',
    'Bumper player opens up body toward the passer to redirect or quick-dish.',
    'Net-front player times the screen so the goalie cannot track the release.',
  ],
  progressions: [
    'Add an active penalty-kill diamond that pressures the flanks aggressively.',
    'Bumper player fakes one-touch pass and takes a quick turnaround snapshot.',
  ],
  variations: [
    'Switch to 2-3 spread formation with two defensemen exchanging at the blue line.',
  ],
  actors: [
    skater('qb', 'home', '5', { x: 650, y: L.centreY }, 'D'),
    skater('lw', 'home', '8', { x: 740, y: 110 }, 'LW'),
    skater('rw', 'home', '88', { x: 740, y: 315 }, 'RW'),
    skater('bump', 'home', '19', { x: 765, y: L.centreY }, 'C'),
    skater('net', 'home', '97', { x: 890, y: 200 }, 'F'),
    // Penalty killers in defensive box
    skater('pk_ld', 'away', '2', { x: 830, y: 160 }, 'D'),
    skater('pk_rd', 'away', '4', { x: 830, y: 265 }, 'D'),
    skater('pk_lw', 'away', '12', { x: 710, y: 165 }, 'F'),
    skater('pk_rw', 'away', '14', { x: 710, y: 260 }, 'F'),
    awayGoalieRight,
  ],
  routes: [
    route('qb', [
      { x: 650, y: L.centreY },
      { x: 670, y: 185 },
      { x: 655, y: 210 },
    ]),
    route('lw', [
      { x: 740, y: 110 },
      { x: 755, y: 125 },
      { x: 745, y: 135 },
    ]),
    route('bump', [
      { x: 765, y: L.centreY },
      { x: 780, y: 205 },
    ]),
    route('rw', [
      { x: 740, y: 315 },
      { x: 755, y: 300 },
    ]),
    route('net', [
      { x: 890, y: 200 },
      { x: 885, y: 220 },
    ]),
    // PK movement
    route('pk_lw', [
      { x: 710, y: 165 },
      { x: 725, y: 145 },
    ]),
    route('pk_ld', [
      { x: 830, y: 160 },
      { x: 835, y: 180 },
    ]),
  ],
  puck: {
    from: 'qb',
    actions: [
      pass('qb', 'lw', { at: 1.0 }),
      pass('lw', 'bump', { at: 2.6 }),
      pass('bump', 'rw', { at: 3.9 }),
      shot('rw', { at: 5.2 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
  durationSeconds: 7,
});

// ----------------------------------------------------------------------------
// 2. 5v5 D-Zone Breakout: Over / Wheel Options
// ----------------------------------------------------------------------------

export const dZoneBreakout: DrillTemplate = template({
  id: 'tpl-play-dzone-breakout',
  title: 'D-Zone Breakout: Over & Wheel Option',
  summary:
    'Full 5v5 defensive zone breakout system. Defenseman retrieves behind the net, reads forecheck pressure, reverses to D-partner, and hits the curling center with speed.',
  categories: ['breakout', 'transition', 'passing'],
  tags: ['breakout', 'd-zone', 'wheel', 'reverse', '5v5', 'systems'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'full',
  durationMinutes: 15,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Puck is dumped into the corner behind the home net.',
    'D1 (#5) retrieves with shoulder checks; D2 (#7) provides net-front and weak-side outlet.',
    'Wingers (#13, #17) establish half-wall board presence.',
    'Center (#11) curls low in the crease to provide deep middle support.',
  ],
  coachingPoints: [
    'D1 must check over both shoulders before reaching the puck to identify F1 angle.',
    'D2 loudly calls the play ("Over!", "Wheel!", or "Reverse!").',
    'Center must stay below the puck and match speed with the defensemen.',
    'Strong-side winger presents flat stick on the ice along the boards for the outlet.',
  ],
  progressions: [
    'F1 applies aggressive stick pressure to force an instant quick-up to the strong-side wall.',
    'Add an active opposing D pinching down the boards.',
  ],
  variations: [
    'Wheel option: D1 takes the puck around the net and skates up ice when lane is open.',
  ],
  actors: [
    skater('d1', 'home', '5', { x: 105, y: 115 }, 'D'),
    skater('d2', 'home', '7', { x: 130, y: 310 }, 'D'),
    skater('c', 'home', '11', { x: 195, y: L.centreY }, 'C'),
    skater('lw', 'home', '13', { x: 260, y: 95 }, 'LW'),
    skater('rw', 'home', '17', { x: 320, y: 320 }, 'RW'),
    homeGoalieLeft,
    // Forecheckers
    skater('f1', 'away', '21', { x: 165, y: 135 }, 'F'),
    skater('f2', 'away', '23', { x: 295, y: 110 }, 'F'),
  ],
  routes: [
    route('d1', [
      { x: 105, y: 115 },
      { x: 75, y: 190 },
      { x: 95, y: 275 },
    ]),
    route('d2', [
      { x: 130, y: 310 },
      { x: 145, y: 325 },
      { x: 180, y: 310 },
    ]),
    route('c', [
      { x: 195, y: L.centreY },
      { x: 160, y: 245 },
      { x: 230, y: 225 },
      { x: 380, y: 215 },
    ]),
    route('rw', [
      { x: 320, y: 320 },
      { x: 440, y: 330 },
      { x: 570, y: 315 },
    ]),
    route('lw', [
      { x: 260, y: 95 },
      { x: 360, y: 110 },
    ]),
    route('f1', [
      { x: 165, y: 135 },
      { x: 115, y: 130 },
    ]),
  ],
  puck: {
    from: 'd1',
    actions: [
      pass('d1', 'd2', { at: 1.6 }),
      pass('d2', 'c', { at: 3.3 }),
      pass('c', 'rw', { at: 5.0 }),
    ],
  },
  finishPolicy: 'finish-with-zone-entry',
  durationSeconds: 8,
});

// ----------------------------------------------------------------------------
// 3. 3-on-2 Rush Attack: Middle Lane Drive & Delay
// ----------------------------------------------------------------------------

export const threeOnTwoRush: DrillTemplate = template({
  id: 'tpl-play-3v2-rush-attack',
  title: '3-on-2 Rush: Mid-Lane Drive & Delay',
  summary:
    'High-tempo 3v2 attack through the neutral zone. Puck carrier attacks wide, center drives hard to the net to back off both defensemen, creating an open high-slot seam for the trailing winger.',
  categories: ['rush', 'transition', 'shooting'],
  tags: ['3v2', 'rush', 'middle-drive', 'delay', 'scoring', 'full-ice'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'full',
  durationMinutes: 10,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Three forwards attack from the red line.',
    'Two defensemen gap up at the defensive blue line.',
    'Left winger carries puck wide with speed to challenge outside shoulder.',
  ],
  coachingPoints: [
    'Center must sprint straight through the dots to the net to force defenders to collapse.',
    'Puck carrier delays (curls toward boards or stops) just inside blue line to buy time.',
    'Trailing winger identifies the open pocket behind the collapsing defense.',
    'Drive lane creates secondary rebound and deflection screens.',
  ],
  progressions: [
    'Defenseman actively steps up and forces the carrier to chip into space.',
    'Center stops in the low slot for a quick tip instead of full drive through crease.',
  ],
  variations: [
    'Direct attack: Carrier shoots off defenseman screen; center searches for immediate rebound.',
  ],
  actors: [
    skater('lw', 'home', '13', { x: 420, y: 110 }, 'LW'),
    skater('c', 'home', '11', { x: 380, y: L.centreY }, 'C'),
    skater('rw', 'home', '44', { x: 360, y: 310 }, 'RW'),
    skater('d1', 'away', '2', { x: 670, y: 175 }, 'D'),
    skater('d2', 'away', '4', { x: 670, y: 250 }, 'D'),
    awayGoalieRight,
  ],
  routes: [
    route('lw', [
      { x: 420, y: 110 },
      { x: 630, y: 95 },
      { x: 730, y: 115 },
    ]),
    route('c', [
      { x: 380, y: L.centreY },
      { x: 590, y: 205 },
      { x: 840, y: 205 },
    ]),
    route('rw', [
      { x: 360, y: 310 },
      { x: 570, y: 290 },
      { x: 715, y: 225 },
    ]),
    route('d1', [
      { x: 670, y: 175 },
      { x: 770, y: 185 },
      { x: 825, y: 195 },
    ]),
    route('d2', [
      { x: 670, y: 250 },
      { x: 770, y: 235 },
      { x: 825, y: 220 },
    ]),
  ],
  puck: {
    from: 'lw',
    actions: [
      pass('lw', 'rw', { at: 3.7 }),
      shot('rw', { at: 5.2 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
  durationSeconds: 7,
});

// ----------------------------------------------------------------------------
// 4. Offensive Zone Faceoff: Tie-Up & Point Blast
// ----------------------------------------------------------------------------

export const offensiveZoneFaceoff: DrillTemplate = template({
  id: 'tpl-play-ozone-faceoff',
  title: 'O-Zone Faceoff: Tie-Up & Point Blast',
  summary:
    'Set play off an offensive zone right-circle faceoff. Center ties up opposing stick, inside winger swoops in for clean possession and feeds the walking point defenseman for a screened one-timer.',
  categories: ['power-play', 'shooting', 'passing'],
  tags: ['faceoff', 'set-play', 'o-zone', 'point-shot', 'special-teams'],
  ageBands: ['u13', 'u15', 'u18', 'adult'],
  skillLevel: 'developing',
  rinkArea: 'half',
  durationMinutes: 10,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Right offensive zone faceoff circle (x: 845, y: 322.5).',
    'Center (#9) lines up for tie-up.',
    'LW (#17) lines up inside hash marks ready to swoop behind the dot.',
    'RD (#27) walks into the shooting lane; LD (#5) holds the middle line.',
  ],
  coachingPoints: [
    'Center’s primary duty is tying up the opposing stick, not trying to win it clean.',
    'Inside winger must anticipate the puck and explode onto it before opposing winger reacts.',
    'Weak-side winger cuts directly in front of the netminder to take away sightlines.',
    'Shooter keeps shot knee-high toward the far post for tip and deflection chances.',
  ],
  progressions: [
    'Opposing center wins draw clean; defensive forwards must immediately lock down passing lanes.',
  ],
  variations: [
    'Direct one-timer: Winger passes back to RD, RD touches across to LD for the one-timer.',
  ],
  actors: [
    skater('c', 'home', '9', { x: L.faceoffRightX, y: L.faceoffBottomY }, 'C'),
    skater('lw', 'home', '17', { x: 790, y: 280 }, 'LW'),
    skater('rw', 'home', '88', { x: 880, y: 375 }, 'RW'),
    skater('ld', 'home', '5', { x: 645, y: 240 }, 'D'),
    skater('rd', 'home', '27', { x: 645, y: 340 }, 'D'),
    // Opposing defense
    skater('ac', 'away', '11', { x: L.faceoffRightX + 1, y: L.faceoffBottomY }, 'C'),
    skater('ad1', 'away', '2', { x: 870, y: 290 }, 'D'),
    skater('ad2', 'away', '4', { x: 800, y: 360 }, 'D'),
    awayGoalieRight,
  ],
  routes: [
    route('c', [
      { x: L.faceoffRightX, y: L.faceoffBottomY },
      { x: 848, y: 320 },
    ]),
    route('lw', [
      { x: 790, y: 280 },
      { x: 835, y: 320 },
      { x: 810, y: 310 },
    ]),
    route('rw', [
      { x: 880, y: 375 },
      { x: 890, y: 230 },
    ]),
    route('rd', [
      { x: 645, y: 340 },
      { x: 685, y: 315 },
    ]),
    route('ld', [
      { x: 645, y: 240 },
      { x: 655, y: 250 },
    ]),
  ],
  puck: {
    from: 'lw',
    actions: [
      pass('lw', 'rd', { at: 1.4 }),
      shot('rd', { at: 3.5 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
  durationSeconds: 5,
});

// ----------------------------------------------------------------------------
// 5. 4v5 Penalty Kill: Active Box & Interception Clear
// ----------------------------------------------------------------------------

export const penaltyKillBox: DrillTemplate = template({
  id: 'tpl-play-4v5-pk-box',
  title: '4v5 Penalty Kill: Active Box & Clear',
  summary:
    'Coordinated four-player defensive box penalty kill. Shifting tandem pressure forces perimeter passing, intercepts cross-ice seam dish, and launches a 200-foot clearing ice.',
  categories: ['penalty-kill', 'defensive-zone'],
  tags: ['penalty-kill', 'box', 'shorthanded', 'clear', '4v5', 'special-teams'],
  ageBands: ['u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'half',
  durationMinutes: 12,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Home team is shorthanded, defending left net.',
    '4 PKers form an active box in the defensive zone.',
    'Opposing power play circulates puck on the perimeter.',
  ],
  coachingPoints: [
    'Sticks must remain in passing lanes at all times — stick on ice, blades angled.',
    'High forward attacks the point only when the puck is traveling toward them, not on the stick.',
    'Low defensemen protect the house first; never chase behind the net.',
    'When possession is secured, clear the puck high off the glass or hard off the boards.',
  ],
  progressions: [
    'Shorthanded forward breaks on a shorthanded 2v1 counterattack after intercepting.',
  ],
  variations: [
    'Diamond penalty kill: One high point forward, two mid flanks, one low net-front anchor.',
  ],
  actors: [
    // Shorthanded defending box
    skater('f1', 'home', '11', { x: 260, y: 160 }, 'F'),
    skater('f2', 'home', '14', { x: 260, y: 265 }, 'F'),
    skater('d1', 'home', '4', { x: 170, y: 150 }, 'D'),
    skater('d2', 'home', '6', { x: 170, y: 275 }, 'D'),
    homeGoalieLeft,
    // Opposing power play attackers
    skater('qb', 'away', '8', { x: 360, y: L.centreY }, 'D'),
    skater('flank1', 'away', '19', { x: 280, y: 90 }, 'LW'),
    skater('flank2', 'away', '88', { x: 280, y: 335 }, 'RW'),
  ],
  routes: [
    route('f1', [
      { x: 260, y: 160 },
      { x: 320, y: 185 },
      { x: 280, y: 160 },
    ]),
    route('f2', [
      { x: 260, y: 265 },
      { x: 235, y: 225 },
    ]),
    route('d1', [
      { x: 170, y: 150 },
      { x: 190, y: 160 },
    ]),
    route('d2', [
      { x: 170, y: 275 },
      { x: 150, y: 245 },
    ]),
  ],
  puck: {
    from: 'qb',
    actions: [
      pass('qb', 'flank1', { at: 1.1 }),
      pass('flank1', 'd1', { at: 2.7 }),
      dump('d1', { x: 880, y: 120 }, { at: 4.0 }),
    ],
  },
  finishPolicy: 'none',
  durationSeconds: 6,
});

// ----------------------------------------------------------------------------
// 6. 1-2-2 Forecheck System & Neutral Turnover Counter
// ----------------------------------------------------------------------------

export const forecheck122: DrillTemplate = template({
  id: 'tpl-play-122-forecheck',
  title: '1-2-2 Forecheck & Turnover Counter',
  summary:
    'Universal 1-2-2 Torpedo forecheck structure. F1 applies angled pressure toward the strong-side wall, F2 and D1 lock down the boards to pinch the breakout pass, generating an instant turnover and slot chance.',
  categories: ['forecheck', 'defensive-zone', 'transition'],
  tags: ['forecheck', '1-2-2', 'trap', 'turnover', 'systems', 'full-ice'],
  ageBands: ['u15', 'u18', 'adult'],
  skillLevel: 'advanced',
  rinkArea: 'full',
  durationMinutes: 15,
  equipmentSummary: ['pucks', '1 net'],
  setupNotes: [
    'Puck is dumped deep into the away zone.',
    'F1 (#9) initiates with inside-out angled skating to steer opponent left.',
    'F2 (#17) and D1 (#5) read the outlet trajectory and step up aggressively.',
  ],
  coachingPoints: [
    'F1 must NEVER chase behind the net; steer the carrier into the waiting board trap.',
    'F2 reads F1’s angle and commits to the boards before the breakout pass is released.',
    'F3 provides central safety and backs up any missed pinch.',
    'Upon turnover, immediately look for F1 cutting back to the high-danger slot.',
  ],
  progressions: [
    '2-1-2 Aggressive Forecheck: F1 and F2 both penetrate below the goal line.',
  ],
  variations: [
    'Neutral zone 1-3-1 trap if opponent escapes initial D-zone forecheck.',
  ],
  actors: [
    skater('f1', 'home', '9', { x: 730, y: 250 }, 'F'),
    skater('f2', 'home', '17', { x: 580, y: 115 }, 'F'),
    skater('f3', 'home', '21', { x: 560, y: 290 }, 'F'),
    skater('d1', 'home', '5', { x: 440, y: 140 }, 'D'),
    skater('d2', 'home', '7', { x: 410, y: 280 }, 'D'),
    // Opposing breakout players
    skater('ad', 'away', '2', { x: 880, y: 310 }, 'D'),
    skater('aw', 'away', '15', { x: 720, y: 100 }, 'LW'),
    awayGoalieRight,
  ],
  routes: [
    route('f1', [
      { x: 730, y: 250 },
      { x: 830, y: 290 },
      { x: 770, y: 220 },
    ]),
    route('f2', [
      { x: 580, y: 115 },
      { x: 670, y: 110 },
      { x: 720, y: 130 },
    ]),
    route('d1', [
      { x: 440, y: 140 },
      { x: 530, y: 125 },
    ]),
    route('f3', [
      { x: 560, y: 290 },
      { x: 580, y: 240 },
    ]),
  ],
  puck: {
    from: 'ad',
    actions: [
      pass('ad', 'f2', { at: 1.8 }),
      pass('f2', 'f1', { at: 3.5 }),
      shot('f1', { at: 5.0 }),
    ],
  },
  finishPolicy: 'finish-with-shot',
  durationSeconds: 7,
});

export const PLAY_TEMPLATES: DrillTemplate[] = [
  powerPlay131,
  dZoneBreakout,
  threeOnTwoRush,
  offensiveZoneFaceoff,
  penaltyKillBox,
  forecheck122,
];
