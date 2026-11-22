// ============================================================================
// AGE-APPROPRIATE PRACTICE CHECK
//
// Reads a practice plan the way an association coach-mentor would, using the
// principles behind USA Hockey's American Development Model and Hockey
// Canada's long-term player development:
//
//   - kids learn by touching the puck: stations and small-area games beat
//     full-ice drills with long lines, especially at U7-U11;
//   - attention spans are short: no single drill runs on and on;
//   - team systems wait until players have the skills (not before U11);
//   - every practice warms up first and has players compete;
//   - young players condition with the puck, in games, not by bag skates.
//
// Activity is an estimate from each drill's group size and ice footprint:
// it is a guide for spotting long lines, not a stopwatch.
// ============================================================================

import type { AgeBand, DrillCategory, DrillDocumentV3, RinkArea } from '@/domain/v3/types';
import { findTemplate } from '@/data/templates/registry';
import { calculatePracticeMetrics } from './practiceStore';
import type { PracticeBlock, PracticeSession } from './types';
import { AGE_LABELS, MAX_BLOCK_MINUTES, SYSTEM_CATEGORIES, isPucklessConditioning } from './practiceGenerator';

export type FindingLevel = 'good' | 'warn' | 'issue';

export interface AgeFinding {
  level: FindingLevel;
  title: string;
  detail: string;
}

export interface AgeAssessment {
  ageBand: AgeBand;
  score: number;
  grade: 'Great' | 'Good' | 'Needs work';
  findings: AgeFinding[];
  /** Estimated minutes an average skater is moving, out of the plan length. */
  activeMinutes: number;
  totalMinutes: number;
  /** Share of time in stations and small-area games. */
  smallAreaShare: number;
}

/** Minimum share of ice time in stations and small-area games. */
const MIN_SMALL_AREA: Record<AgeBand, number> = { u7: 0.6, u9: 0.5, u11: 0.35, u13: 0.25, u15: 0.15, u18: 0, adult: 0 };
const AGE_ORDER: AgeBand[] = ['u7', 'u9', 'u11', 'u13', 'u15', 'u18', 'adult'];
/** How many groups can run a drill at once on its footprint. */
const GROUPS: Partial<Record<RinkArea, number>> = { full: 1, half: 2, third: 3, quarter: 4, station: 4 };
/** Groups on the ice at once while a drill cycles through its reps. */
const REP_OVERLAP = 1.5;

function documentFor(block: PracticeBlock): DrillDocumentV3 | null {
  if (block.pinnedRevision) return block.pinnedRevision;
  return block.drillId ? findTemplate(block.drillId)?.document ?? null : null;
}

function categoriesOf(block: PracticeBlock): DrillCategory[] {
  const document = documentFor(block);
  if (document) return document.metadata.categories;
  const text = `${block.title} ${block.objective ?? ''}`.toLowerCase();
  const found: DrillCategory[] = [];
  if (/game|small.?area|scrimmage|3v3|2v2/.test(text)) found.push('small-area-game');
  if (/warm/.test(text)) found.push('warm-up');
  if (/station/.test(text)) found.push('puck-handling');
  return found;
}

function isStation(block: PracticeBlock): boolean {
  return Boolean(block.stationSplit && block.stationSplit !== 'full');
}

function isSmallArea(block: PracticeBlock): boolean {
  if (isStation(block)) return true;
  const area = documentFor(block)?.metadata.rinkArea ?? block.rinkArea;
  return area === 'quarter' || area === 'third' || area === 'station' || categoriesOf(block).includes('small-area-game');
}

/** Minutes the block takes on the clock (a station cluster runs side by side). */
function clockMinutes(session: PracticeSession): Map<string, number> {
  const minutes = new Map<string, number>();
  let cluster: PracticeBlock[] = [];
  const flush = () => {
    if (cluster.length === 0) return;
    const rotations = cluster[0].rotations ?? (cluster.length > 1 ? cluster.length : 1);
    const changeover = cluster[0].changeoverMinutes ?? (rotations > 1 ? rotations - 1 : 0);
    const total = Math.max(...cluster.map(block => block.durationMinutes)) * rotations + changeover;
    for (const block of cluster) minutes.set(block.id, total / cluster.length);
    cluster = [];
  };
  for (const block of session.blocks) {
    if (isStation(block)) cluster.push(block);
    else {
      flush();
      minutes.set(block.id, block.durationMinutes);
    }
  }
  flush();
  return minutes;
}

/** Fraction of the block an average skater spends moving. */
function activeShare(block: PracticeBlock, skaters: number, stationCount: number): number {
  const document = documentFor(block);
  const perRep = document?.metadata.skaterCount.max ?? 4;
  const area = document?.metadata.rinkArea ?? block.rinkArea;
  const groups = GROUPS[area] ?? 2;
  if (isStation(block)) {
    const atStation = Math.max(1, skaters / Math.max(1, stationCount));
    return Math.min(1, (perRep * Math.max(1, groups / Math.max(1, stationCount)) * REP_OVERLAP) / atStation);
  }
  // Coaches send the next group before the last rep finishes: reps overlap.
  const share = Math.min(1, (perRep * groups * REP_OVERLAP) / Math.max(1, skaters));
  // Games and flow warm-ups keep everyone moving at once.
  const categories = categoriesOf(block);
  return categories.includes('small-area-game') || categories[0] === 'warm-up' ? Math.max(share, 0.6) : share;
}

export function assessPractice(session: PracticeSession, ageBand: AgeBand, skaters = 15): AgeAssessment {
  const findings: AgeFinding[] = [];
  const label = AGE_LABELS[ageBand];
  const metrics = calculatePracticeMetrics(session);
  const clock = clockMinutes(session);
  const total = Math.max(1, metrics.totalMinutes);
  const blocks = session.blocks;
  const minutesWhere = (test: (block: PracticeBlock) => boolean) =>
    blocks.filter(test).reduce((sum, block) => sum + (clock.get(block.id) ?? block.durationMinutes), 0);

  if (blocks.length === 0) {
    return {
      ageBand, score: 0, grade: 'Needs work', activeMinutes: 0, totalMinutes: 0, smallAreaShare: 0,
      findings: [{ level: 'issue', title: 'No drills yet', detail: 'Add drills or generate a practice to check it.' }],
    };
  }

  // Length.
  if (metrics.status === 'over') {
    findings.push({ level: 'warn', title: `${Math.abs(metrics.remainingMinutes)} min over your ice time`, detail: 'Trim a block or shorten the longest drill so the plan fits the ice slot.' });
  } else if (metrics.remainingMinutes > 5) {
    findings.push({ level: 'warn', title: `${metrics.remainingMinutes} min of ice unplanned`, detail: 'Unplanned ice turns into standing around. Add a game or extend the compete block.' });
  }

  // Warm-up first.
  const first = categoriesOf(blocks[0]);
  if (first.includes('warm-up') || first.includes('skating')) {
    findings.push({ level: 'good', title: 'Starts with a warm-up', detail: 'Players get moving and touching pucks before the harder work.' });
  } else {
    findings.push({ level: 'warn', title: 'No warm-up to start', detail: 'Open with a 5-8 minute skating or passing warm-up.' });
  }

  // Attention span.
  const limit = MAX_BLOCK_MINUTES[ageBand];
  const long = blocks.filter(block => block.durationMinutes > limit);
  if (long.length) {
    findings.push({ level: 'warn', title: `${long.length === 1 ? 'A drill runs' : `${long.length} drills run`} longer than ${limit} min`, detail: `${long.map(block => block.title).join(', ')}. ${label} players lose focus; split it or add a progression partway through.` });
  }

  // Stations and small-area games.
  const smallAreaShare = minutesWhere(isSmallArea) / total;
  const minShare = MIN_SMALL_AREA[ageBand];
  if (minShare > 0) {
    if (smallAreaShare >= minShare) {
      findings.push({ level: 'good', title: `${Math.round(smallAreaShare * 100)}% in stations and small-area games`, detail: `Good for ${label}: more puck touches and decisions per minute.` });
    } else {
      findings.push({
        level: smallAreaShare < minShare / 2 ? 'issue' : 'warn',
        title: `Only ${Math.round(smallAreaShare * 100)}% in stations and small-area games`,
        detail: `Aim for at least ${Math.round(minShare * 100)}% at ${label}. Split the ice into stations or swap a full-ice drill for a cross-ice game.`,
      });
    }
  }

  // Team systems.
  const systemMinutes = minutesWhere(block => categoriesOf(block).some(category => SYSTEM_CATEGORIES.includes(category)) && !categoriesOf(block).includes('small-area-game'));
  if (ageBand === 'u7' || ageBand === 'u9') {
    if (systemMinutes > 0) findings.push({ level: 'issue', title: 'Team systems are too early', detail: `${label} players are still building skating and puck skills. Replace breakouts, forechecks and special teams with skill stations and games.` });
  } else if (ageBand === 'u11' && systemMinutes / total > 0.15) {
    findings.push({ level: 'warn', title: `${Math.round((systemMinutes / total) * 100)}% on team systems`, detail: 'Keep systems under about 15% at U11; skills and games come first.' });
  }

  // Drills meant for older players.
  const older = blocks.filter(block => {
    const bands = documentFor(block)?.metadata.ageBands;
    return bands && bands.length > 0 && !bands.includes(ageBand) && AGE_ORDER.indexOf(bands[0]) > AGE_ORDER.indexOf(ageBand);
  });
  if (older.length) {
    findings.push({ level: 'warn', title: `${older.length} drill${older.length > 1 ? 's are' : ' is'} aimed at older players`, detail: older.map(block => `${block.title} (${AGE_LABELS[documentFor(block)!.metadata.ageBands[0]]}+)`).join(', ') });
  }

  // Compete.
  if (blocks.some(block => categoriesOf(block).some(category => category === 'small-area-game' || category === 'battle'))) {
    findings.push({ level: 'good', title: 'Players compete', detail: 'A battle or small-area game makes the skills work under pressure.' });
  } else {
    findings.push({ level: 'warn', title: 'Nobody competes', detail: 'Add a battle drill or small-area game - it is where skills get tested.' });
  }

  // Conditioning without the puck.
  if (AGE_ORDER.indexOf(ageBand) <= AGE_ORDER.indexOf('u13') && blocks.some(block => isPucklessConditioning(categoriesOf(block)))) {
    findings.push({ level: 'warn', title: 'Conditioning without a puck', detail: `At ${label}, get the work rate from games and races with pucks rather than skating lines.` });
  }

  // Activity.
  const stationCount = Math.max(1, blocks.filter(isStation).length);
  const activeMinutes = blocks.reduce((sum, block) => sum + (clock.get(block.id) ?? block.durationMinutes) * activeShare(block, skaters, stationCount), 0);
  const activeShareTotal = activeMinutes / total;
  findings.push({
    level: activeShareTotal >= 0.5 ? 'good' : activeShareTotal >= 0.35 ? 'warn' : 'issue',
    title: `About ${Math.round(activeMinutes)} of ${Math.round(total)} min moving per player`,
    detail: activeShareTotal >= 0.5
      ? 'Plenty of reps - lines stay short.'
      : `With ${skaters} skaters, lines get long. Run drills at both ends, use stations, or split into smaller groups.`,
  });

  const penalty = findings.reduce((sum, finding) => sum + (finding.level === 'issue' ? 18 : finding.level === 'warn' ? 8 : 0), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  // Problems first, then praise.
  const order: Record<FindingLevel, number> = { issue: 0, warn: 1, good: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  return {
    ageBand,
    score,
    grade: score >= 85 ? 'Great' : score >= 65 ? 'Good' : 'Needs work',
    findings,
    activeMinutes: Math.round(activeMinutes),
    totalMinutes: Math.round(total),
    smallAreaShare,
  };
}

/** A best guess at the age band from the plan's team text ("U11 Blue"). */
export function guessAgeBand(session: PracticeSession): AgeBand {
  if (session.ageBand) return session.ageBand;
  const match = `${session.team} ${session.title}`.toLowerCase().match(/\bu\s?-?(7|8|9|10|11|12|13|14|15|16|17|18)\b/);
  if (!match) return /adult|senior/.test(session.team.toLowerCase()) ? 'adult' : 'u13';
  const n = Number(match[1]);
  return n <= 8 ? 'u7' : n <= 10 ? 'u9' : n <= 12 ? 'u11' : n <= 14 ? 'u13' : n <= 16 ? 'u15' : 'u18';
}
