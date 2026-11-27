// ============================================================================
// DRILL EFFICIENCY
//
// How much hockey a player actually gets from a drill. The drill is played
// through the engine once to measure a single rep; the rep is then scaled to a
// roster on a sheet of ice:
//
//   - how long one rep takes, at the drill's playback pace;
//   - how many groups can run it at once (both ends, stations);
//   - how long a player waits in line between reps;
//   - how much of a rep each skater spends moving, and how often they touch
//     the puck;
//   - how many shots each goalie faces a minute.
//
// These are estimates for spotting long lines and idle players, not a
// stopwatch. The roster defaults to 15 skaters, the same as the practice check.
// ============================================================================

import { FT } from '@/core/constants';
import type { Point } from '@/core/types';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { isGoalie, isOnIce, isSkater, type DrillCategory, type DrillDocumentV3, type RinkArea } from '@/domain/v3/types';
import { compileDrill } from '@/sim/compileDrill';
import { sampleRawFrame } from '@/sim/sampleFrame';

export type EfficiencyGrade = 'A' | 'B' | 'C' | 'D';

export interface DrillEfficiency {
  /** Seconds one rep takes at the drill's playback pace. */
  repSeconds: number;
  skatersPerRep: number;
  /** Groups running the drill at the same time (both ends, stations). */
  groupsAtOnce: number;
  roster: number;
  /** How many reps each player gets a minute. */
  repsPerPlayerPerMinute: number;
  /** Seconds a player waits in line between their reps. */
  waitSeconds: number;
  /** Share of a rep the average skater spends moving or playing the puck. */
  movingShare: number;
  /** Share of the drill's minutes the average player spends moving. */
  activeShare: number;
  /** Puck touches (pass, catch, shot, pickup) per skater per rep. */
  touchesPerRep: number;
  /** Null when the drill has no goalie. */
  shotsPerGoaliePerMinute: number | null;
  /** Skaters who never move and never touch the puck during a rep. */
  standingStill: string[];
  score: number;
  grade: EfficiencyGrade;
  suggestions: string[];
}

export const DEFAULT_ROSTER = 15;
/** How many groups can run a drill at once on its footprint. */
const GROUPS: Record<RinkArea, number> = { full: 1, half: 2, third: 3, quarter: 4, station: 4 };
/** Coaches send the next small group before the last rep finishes: this many reps overlap. */
const REP_OVERLAP = 1.5;
/** Groups this size or smaller can overlap; a five-man unit cannot start before the last one clears. */
const OVERLAP_GROUP = 4;
/** Seconds between reps to collect pucks, blow the whistle and set the next group. */
export const REP_RESET_SECONDS = 5;
/** A skater counts as busy this long either side of touching the puck. */
const TOUCH_WINDOW = 0.6;
/**
 * A game's diagram shows one moment of it; on the ice everybody is in it the
 * whole time. Games and flow warm-ups are counted at least this busy, the
 * same rule the practice age check uses.
 */
const GAME_BUSY_SHARE = 0.6;
/** Drills where everyone plays at once rather than in turns. */
const EVERYONE_PLAYS: DrillCategory[] = ['small-area-game', 'warm-up'];
const MOVING_SPEED = 1.5 * FT;
const STEP_SECONDS = 0.1;
/** More shots than this a minute and a goalie stops resetting between them. */
export const GOALIE_SHOTS_PER_MINUTE = 6;
/** A wait longer than this between reps is a line, not a breather. */
const LONG_WAIT_SECONDS = 45;
/** Full marks when the average player is busy this share of the drill's minutes... */
const ACTIVE_TARGET = 0.25;
/** ...and touches the puck this often a rep. */
const TOUCH_TARGET = 1.5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function analyzeDrillEfficiency(drill: DrillDocumentV3, options: { roster?: number } = {}): DrillEfficiency {
  const roster = Math.max(1, options.roster ?? DEFAULT_ROSTER);
  const skaters = drill.actors.filter(actor => isSkater(actor) && isOnIce(actor));
  const goalies = drill.actors.filter(isGoalie).length;
  const label = (id: string) => {
    const actor = drill.actors.find(candidate => candidate.id === id);
    return actor ? actor.label || ('number' in actor && actor.number ? `#${actor.number}` : actor.id) : id;
  };

  // One rep, played through the engine.
  let repSeconds = Math.max(1, drill.presentation.durationSeconds);
  let movingShare = 0;
  const touches = new Map<string, number>();
  const touchTimes = new Map<string, number[]>();
  const touch = (id: string, at: number) => {
    touches.set(id, (touches.get(id) ?? 0) + 1);
    touchTimes.set(id, [...(touchTimes.get(id) ?? []), at]);
  };
  const moved = new Set<string>();
  let shotsPerRep = 0;
  try {
    const compiled = compileDrill(projectToV2(drill).drill);
    repSeconds = Math.max(1, compiled.durationSeconds);
    for (const event of compiled.events) {
      touch(event.source.fromPlayerId, event.source.type === 'pickup' ? event.arrivalSeconds : event.departureSeconds);
      if (event.source.type === 'pass') touch(event.source.toPlayerId, event.arrivalSeconds);
      if (event.source.type === 'shot') shotsPerRep++;
    }
    let movingSamples = 0;
    let samples = 0;
    let previous: Record<string, Point> = {};
    for (let t = 0; t <= compiled.durationSeconds + 1e-9; t += STEP_SECONDS) {
      const frame = sampleRawFrame(compiled, t);
      const now: Record<string, Point> = {};
      for (const skater of skaters) {
        const position = frame.players[skater.id]?.position;
        if (!position) continue;
        now[skater.id] = position;
        const before = previous[skater.id];
        if (!before) continue;
        samples++;
        const skating = Math.hypot(position.x - before.x, position.y - before.y) / STEP_SECONDS > MOVING_SPEED;
        if (skating) moved.add(skater.id);
        // Standing still to pass or take a pass is still playing.
        const playing = (touchTimes.get(skater.id) ?? []).some(at => Math.abs(at - t) <= TOUCH_WINDOW);
        if (skating || playing) movingSamples++;
      }
      previous = now;
    }
    movingShare = samples > 0 ? movingSamples / samples : 0;
  } catch {
    // A drill the engine cannot compile is measured from its metadata alone.
  }

  const skatersPerRep = Math.max(1, skaters.length || drill.metadata.skaterCount.max);
  const groupsAtOnce = Math.max(1, Math.min(GROUPS[drill.metadata.rinkArea] ?? 1, Math.floor(roster / skatersPerRep)));
  const everyonePlays =
    drill.metadata.categories.some(category => EVERYONE_PLAYS.includes(category)) ||
    skatersPerRep * groupsAtOnce >= roster;

  // A rep, then the reset before the group's next one starts.
  const cycleSeconds = repSeconds + REP_RESET_SECONDS;
  const overlap = everyonePlays || skatersPerRep > OVERLAP_GROUP ? 1 : REP_OVERLAP;
  const startsPerMinute = (60 / cycleSeconds) * overlap;
  const repsPerPlayerPerMinute = everyonePlays
    ? 60 / cycleSeconds
    : Math.min(60 / cycleSeconds, (startsPerMinute * groupsAtOnce * skatersPerRep) / roster);
  const waitSeconds = everyonePlays ? 0 : Math.max(0, 60 / repsPerPlayerPerMinute - repSeconds - REP_RESET_SECONDS);
  if (drill.metadata.categories.some(category => EVERYONE_PLAYS.includes(category))) movingShare = Math.max(movingShare, GAME_BUSY_SHARE);
  const activeShare = clamp01(movingShare * repsPerPlayerPerMinute * repSeconds / 60);
  const touchCount = [...touches.entries()].filter(([id]) => skaters.some(skater => skater.id === id)).reduce((sum, [, count]) => sum + count, 0);
  const touchesPerRep = touchCount / skatersPerRep;
  const shotsPerGoaliePerMinute = goalies > 0 && shotsPerRep > 0 ? (shotsPerRep * startsPerMinute) / goalies : null;
  const standingStill = skaters.filter(skater => !moved.has(skater.id) && !touches.has(skater.id)).map(skater => label(skater.id));

  // Score: mostly how much each player moves, then puck touches, then whether
  // the goalie can keep up.
  const goalieScore = shotsPerGoaliePerMinute === null || shotsPerGoaliePerMinute <= GOALIE_SHOTS_PER_MINUTE
    ? 1
    : clamp01(1 - (shotsPerGoaliePerMinute - GOALIE_SHOTS_PER_MINUTE) / GOALIE_SHOTS_PER_MINUTE);
  const score = Math.round(60 * clamp01(activeShare / ACTIVE_TARGET) + 25 * clamp01(touchesPerRep / TOUCH_TARGET) + 15 * goalieScore);
  const grade: EfficiencyGrade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';

  const suggestions: string[] = [];
  if (waitSeconds > LONG_WAIT_SECONDS) {
    const groupsPossible = GROUPS[drill.metadata.rinkArea] ?? 1;
    suggestions.push(
      groupsAtOnce < 2 && groupsPossible < 2
        ? `Players wait about ${Math.round(waitSeconds)} s between reps. Send the next group when the first reaches the far blue line, or split the team and run a second drill on the other half.`
        : `Players wait about ${Math.round(waitSeconds)} s between reps. Run it at both ends or in more stations so the lines stay short.`
    );
  }
  if (standingStill.length > 0) {
    suggestions.push(
      `${standingStill.join(', ')} ${standingStill.length === 1 ? 'stands' : 'stand'} still the whole rep without touching the puck. Fine if they are holding a position or waiting their turn; otherwise give them a route or a pass.`
    );
  }
  if (shotsPerGoaliePerMinute !== null && shotsPerGoaliePerMinute > GOALIE_SHOTS_PER_MINUTE) {
    suggestions.push(
      `Each goalie faces about ${shotsPerGoaliePerMinute.toFixed(1)} shots a minute - too many to reset between them. Stagger the shooters or use both nets.`
    );
  }
  if (touchesPerRep < 0.5 && skatersPerRep > 1) {
    suggestions.push('Few players touch the puck. Add a pass so more of them handle it each rep.');
  }
  if (movingShare < 0.4 && skaters.length > 0) {
    suggestions.push('Skaters spend most of the rep standing. Start the next skater sooner or give the waiting players a job.');
  }

  return {
    repSeconds,
    skatersPerRep,
    groupsAtOnce,
    roster,
    repsPerPlayerPerMinute,
    waitSeconds,
    movingShare,
    activeShare,
    touchesPerRep,
    shotsPerGoaliePerMinute,
    standingStill,
    score,
    grade,
    suggestions,
  };
}
