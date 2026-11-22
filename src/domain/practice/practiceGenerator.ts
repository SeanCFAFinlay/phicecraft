// ============================================================================
// PRACTICE GENERATOR
//
// "60 minutes, U11, work on passing and breakouts, one goalie" -> a complete,
// timed practice built from the drill library. Offline and deterministic:
// the same request gives the same plan, and every drill in it is one the
// library already validates and animates.
//
// The shape follows how good practices are run (and USA Hockey's American
// Development Model for the youngest ages):
//
//   warm-up -> focus skill work -> compete game -> team play -> finish
//
// U7-U11 do their skill work as rotating stations on a split sheet - more
// puck touches, less standing in line - and get no team systems.
// ============================================================================

import type { AgeBand, DrillCategory, DrillDocumentV3 } from '@/domain/v3/types';
import { DRILL_TEMPLATES } from '@/data/templates/registry';
import { recommendDrills } from '@/domain/recommendation/recommendationEngine';
import { createBlankPracticeSession, createBlockFromDrill, createCustomBlock } from './practiceStore';
import type { PracticeBlock, PracticeSession, StationSplit } from './types';

export interface PracticeRequest {
  minutes: number;
  ageBand: AgeBand;
  /** What the practice is about. Empty: a balanced skills practice. */
  focus: DrillCategory[];
  goalies: number;
  skaters: number;
  team?: string;
}

export const AGE_LABELS: Record<AgeBand, string> = {
  u7: 'U7',
  u9: 'U9',
  u11: 'U11',
  u13: 'U13',
  u15: 'U15',
  u18: 'U18',
  adult: 'Adult',
};

export const FOCUS_OPTIONS: { category: DrillCategory; label: string }[] = [
  { category: 'skating', label: 'Skating' },
  { category: 'puck-handling', label: 'Puck handling' },
  { category: 'passing', label: 'Passing' },
  { category: 'shooting', label: 'Shooting' },
  { category: 'battle', label: 'Battles' },
  { category: 'breakout', label: 'Breakouts' },
  { category: 'rush', label: 'Rush / odd-man' },
  { category: 'transition', label: 'Transition' },
  { category: 'forecheck', label: 'Forecheck' },
  { category: 'defensive-zone', label: 'D-zone' },
  { category: 'power-play', label: 'Power play' },
  { category: 'penalty-kill', label: 'Penalty kill' },
  { category: 'goalie', label: 'Goalies' },
];

/** Longest one drill should run before attention fades. */
export const MAX_BLOCK_MINUTES: Record<AgeBand, number> = { u7: 8, u9: 10, u11: 12, u13: 15, u15: 15, u18: 20, adult: 20 };

/** Team tactics: not for the youngest ages (ADM). */
export const SYSTEM_CATEGORIES: DrillCategory[] = ['power-play', 'penalty-kill', 'forecheck', 'defensive-zone', 'breakout'];
const YOUNG: AgeBand[] = ['u7', 'u9', 'u11'];
const CONDITION_WITH_PUCK: AgeBand[] = ['u7', 'u9', 'u11', 'u13'];

/** Skating for fitness with no puck: the kind of drill young players should not get. */
export function isPucklessConditioning(categories: DrillCategory[]): boolean {
  return categories[0] === 'conditioning' || (categories.includes('conditioning') && categories.includes('skating') && !categories.includes('puck-handling'));
}

const KEYWORDS: [RegExp, DrillCategory][] = [
  [/skat|edge|stride|crossover/, 'skating'],
  [/puck.?handl|stick.?handl|dangl/, 'puck-handling'],
  [/pass/, 'passing'],
  [/shoot|shot|scor|finish/, 'shooting'],
  [/battle|compete|1.?v.?1|one.on.one|physical/, 'battle'],
  [/break.?out/, 'breakout'],
  [/rush|odd.?man|2.?(on|v).?1|3.?(on|v).?2/, 'rush'],
  [/transition|regroup|counter/, 'transition'],
  [/fore.?check/, 'forecheck'],
  [/d.?zone|defen[cs]ive|coverage/, 'defensive-zone'],
  [/power.?play|\bpp\b|man.?advantage|cycl/, 'power-play'],
  [/penalty.?kill|\bpk\b|short.?hand/, 'penalty-kill'],
  [/goalie|goaltend/, 'goalie'],
];

/**
 * Reads a plain-language request: minutes, age, focus, goalies, skaters.
 * Anything it cannot find keeps the default.
 */
export function parsePracticeRequest(text: string, defaults: PracticeRequest): PracticeRequest {
  const lower = text.toLowerCase();
  const request: PracticeRequest = { ...defaults, focus: [...defaults.focus] };

  const minutes = lower.match(/(\d{2,3})\s*(?:-\s*)?(?:min|minute|m\b)/) ?? lower.match(/(\d)\s*(?:hour|hr)/);
  if (minutes) {
    const value = Number(minutes[1]);
    request.minutes = /hour|hr/.test(minutes[0]) ? value * 60 : value;
  }
  const age = lower.match(/\bu\s?-?(7|8|9|10|11|12|13|14|15|16|17|18)\b/);
  if (age) {
    const n = Number(age[1]);
    request.ageBand = n <= 8 ? 'u7' : n <= 10 ? 'u9' : n <= 12 ? 'u11' : n <= 14 ? 'u13' : n <= 16 ? 'u15' : 'u18';
  } else if (/adult|senior|beer league|men'?s|women'?s/.test(lower)) {
    request.ageBand = 'adult';
  }
  if (/no goalie|without (a )?goalie|0 goalie/.test(lower)) request.goalies = 0;
  else {
    const goalies = lower.match(/(\d|one|two)\s*goalie/);
    if (goalies) request.goalies = goalies[1] === 'one' ? 1 : goalies[1] === 'two' ? 2 : Number(goalies[1]);
  }
  const skaters = lower.match(/(\d{1,2})\s*(?:skaters|players|kids)/);
  if (skaters) request.skaters = Number(skaters[1]);

  // "1 goalie" is attendance, not a goalie-training focus.
  const topics = lower.replace(/\b(\d+|one|two|no|without( a)?)\s*goalies?\b/g, ' ').replace(/\d+\s*(skaters|players|kids)/g, ' ');
  const focus = KEYWORDS.filter(([pattern]) => pattern.test(topics)).map(([, category]) => category);
  if (focus.length) request.focus = [...new Set(focus)];
  return request;
}

interface Slot {
  role: 'warm-up' | 'focus' | 'compete' | 'team' | 'finish';
  categories: DrillCategory[];
  share: number;
  stations?: number;
}

function planSlots(request: PracticeRequest): Slot[] {
  const young = YOUNG.includes(request.ageBand);
  const focus = request.focus.length
    ? request.focus.filter(category => !(young && request.ageBand !== 'u11' && SYSTEM_CATEGORIES.includes(category)))
    : [];
  const skills: DrillCategory[] = focus.length ? focus : young ? ['skating', 'puck-handling', 'passing'] : ['passing', 'shooting'];
  const teamFocus = focus.filter(category => SYSTEM_CATEGORIES.includes(category) || category === 'rush' || category === 'transition');

  if (young) {
    // ADM: stations for skills, small-area games to compete, a fun finish.
    // At U11 a system the coach asked for gets one short block (under 15%).
    const systems = focus.filter(category => SYSTEM_CATEGORIES.includes(category));
    const stationSkills = skills.filter(category => !SYSTEM_CATEGORIES.includes(category));
    const slots: Slot[] = [
      { role: 'warm-up', categories: ['warm-up', 'skating'], share: 0.12 },
      { role: 'focus', categories: stationSkills.length ? stationSkills : ['skating', 'puck-handling', 'passing'], share: 0.45, stations: 3 },
      { role: 'compete', categories: ['small-area-game', 'battle'], share: 0.3 },
      { role: 'finish', categories: ['shooting', 'small-area-game'], share: 0.13 },
    ];
    if (systems.length) {
      slots[2].share = 0.2;
      slots.splice(3, 0, { role: 'team', categories: systems, share: 0.1 });
    }
    return slots;
  }
  const slots: Slot[] = [
    { role: 'warm-up', categories: ['warm-up', 'passing', 'skating'], share: 0.13 },
    { role: 'focus', categories: skills, share: 0.2 },
    { role: 'focus', categories: skills.length > 1 ? [...skills.slice(1), skills[0]] : skills, share: 0.2 },
    { role: 'compete', categories: ['small-area-game', 'battle'], share: 0.27 },
    { role: 'team', categories: teamFocus.length ? teamFocus : ['rush', 'transition'], share: 0.2 },
  ];
  if (request.minutes >= 75) {
    slots[4].share = 0.12;
    slots.push({ role: 'finish', categories: ['conditioning', 'transition'], share: 0.08 });
  }
  return slots;
}

/** Whole minutes per slot that add up exactly to the practice length. */
function allocate(minutes: number, slots: Slot[]): number[] {
  const raw = slots.map(slot => Math.max(4, Math.round(minutes * slot.share)));
  let diff = minutes - raw.reduce((sum, value) => sum + value, 0);
  // Push the rounding into the biggest blocks first.
  const order = raw.map((_, index) => index).sort((a, b) => raw[b] - raw[a]);
  for (let i = 0; diff !== 0 && i < 200; i += 1) {
    const index = order[i % order.length];
    if (diff > 0) { raw[index] += 1; diff -= 1; }
    else if (raw[index] > 4) { raw[index] -= 1; diff += 1; }
  }
  return raw;
}

const STATION_SPLITS: StationSplit[] = ['station_a', 'station_b', 'station_c'];

export function generatePractice(
  request: PracticeRequest,
  library: DrillDocumentV3[] = DRILL_TEMPLATES.map(template => template.document)
): PracticeSession {
  const slots = planSlots(request);
  const minutes = allocate(request.minutes, slots);
  const used = new Set<string>();

  const pick = (categories: DrillCategory[], maxMinutes: number, smallIce: boolean): DrillDocumentV3 | null => {
    for (const category of categories) {
      const results = recommendDrills(
        library,
        {
          ageBand: request.ageBand,
          categories: [category],
          goalieCount: request.goalies,
          strictGoalies: true,
          skaterCount: request.skaters,
          maxMinutes,
        },
        30
      ).filter(result => {
        const meta = result.drill.metadata;
        if (used.has(result.drill.id)) return false;
        if (!meta.ageBands.includes(request.ageBand)) return false;
        if (meta.goalieCount > request.goalies) return false;
        if (smallIce && meta.rinkArea === 'full') return false;
        // Young players condition with a puck, in games - not skating lines.
        if (CONDITION_WITH_PUCK.includes(request.ageBand) && isPucklessConditioning(meta.categories)) return false;
        return true;
      });
      // Prefer drills whose primary category is the one asked for.
      const best = results.find(result => result.drill.metadata.categories[0] === category) ?? results[0];
      if (best) {
        used.add(best.drill.id);
        return best.drill;
      }
    }
    return null;
  };

  const blocks: PracticeBlock[] = [];
  slots.forEach((slot, index) => {
    const length = minutes[index];
    if (slot.stations) {
      // Station rotations come in whole minutes; hand what is left over on.
      const count = slot.stations;
      const stationMinutes = Math.max(3, Math.floor((length - (count - 1)) / count)) * count + (count - 1);
      if (index + 1 < minutes.length) minutes[index + 1] += length - stationMinutes;
    }
    if (slot.stations) {
      // Rotating stations: each group visits every station.
      const count = slot.stations;
      const changeover = count - 1;
      const perStation = Math.max(3, Math.floor((length - changeover) / count));
      for (let s = 0; s < count; s += 1) {
        const category = slot.categories[s % slot.categories.length];
        const drill = pick([category, ...slot.categories, 'puck-handling', 'skating', 'passing'], perStation + 6, true);
        const block = drill
          ? createBlockFromDrill(drill, perStation)
          : createCustomBlock(`Station: ${category.replace(/-/g, ' ')}`, perStation, { rinkArea: 'station' });
        blocks.push({ ...block, id: `${block.id}-${blocks.length}`, stationSplit: STATION_SPLITS[s], rotations: count, changeoverMinutes: changeover });
      }
      return;
    }
    // Long slots become two drills rather than one that outlasts attention.
    const parts = Math.ceil(length / MAX_BLOCK_MINUTES[request.ageBand]);
    for (let part = 0; part < parts; part += 1) {
      const partLength = Math.floor(length / parts) + (part < length % parts ? 1 : 0);
      const drill = pick(slot.categories, partLength + 4, slot.role === 'compete');
      const block = drill
        ? createBlockFromDrill(drill, partLength)
        : createCustomBlock(slot.role === 'compete' ? 'Small-area game' : 'Coach-led block', partLength);
      blocks.push({ ...block, id: `${block.id}-${blocks.length}`, stationSplit: 'full' });
    }
  });

  const focusLabel = request.focus.length
    ? FOCUS_OPTIONS.filter(option => request.focus.includes(option.category)).map(option => option.label).join(', ')
    : 'Balanced skills';
  const session = createBlankPracticeSession(request.minutes, `${AGE_LABELS[request.ageBand]} ${focusLabel} (${request.minutes} min)`);
  return {
    ...session,
    team: request.team || `${AGE_LABELS[request.ageBand]} team`,
    ageBand: request.ageBand,
    focus: focusLabel,
    blocks,
    notes: `Built for ${request.skaters} skaters and ${request.goalies} goalie${request.goalies === 1 ? '' : 's'}.`,
  };
}
