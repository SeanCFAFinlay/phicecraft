// ============================================================================
// POSITIONING INTELLIGENCE
//
// The checks a coach on the bench would shout about, read from the drill as
// it actually plays back (the same simulator the board animates):
//
//   - OFFSIDE: an attacker over the offensive blue line before the puck
//     enters the zone. The one rule a hockey diagram most often breaks.
//   - NOBODY AT THE NET: a team-play shot from distance with no one screening
//     the goalie or waiting for the rebound.
//   - POINT LEFT OPEN: an offensive-zone sequence where nobody stays on the
//     blue line, so one bad bounce is an odd-man rush the other way.
//
// Each is deliberately narrow - an individual skill drill with one shooter
// is not a positioning mistake - and each names the player and the moment.
// Where a fix is unambiguous, it comes with one.
// ============================================================================

import type { Player, Point, Team } from '@/core/types';
import { FT, RINK } from '@/core/constants';
import type { DrillDocumentV3 } from '@/domain/v3/types';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { compileDrill } from '@/sim/compileDrill';
import { sampleRawFrame } from '@/sim/sampleFrame';
import type { CompiledDrill, SimulationFrame } from '@/sim/types';
import type { DrillValidationIssue } from './coachIntelligence';

const STEP_SECONDS = 0.1;
/** Both skates over the line: the centre of the player this far past it. */
const OFFSIDE_MARGIN = 1.5 * FT;
/**
 * The blue line belongs to the zone: a puck on it is already in. Only a puck
 * wholly past its outer edge is out (line half-width plus the puck).
 */
const PUCK_OUT_MARGIN = 1.5 * FT;
/** A shot from further out than this wants a screen. */
const SCREEN_SHOT_DISTANCE = 32 * FT;
/** Within this of the top of the crease counts as "at the net". */
const NET_FRONT_REACH = 20 * FT;
/** Within this of the blue line, inside the zone, counts as "on the point". */
const POINT_DEPTH = 22 * FT;
/** How long the zone can be left without anyone high before it matters. */
const POINT_OPEN_SECONDS = 1.2;
/** Team play: fewer attackers than this is a skill drill, not a system. */
const TEAM_PLAY_SKATERS = 3;
const POINT_TEAM_SKATERS = 4;

interface Side {
  /** The offensive blue line this team crosses to enter the zone. */
  blueLine: number;
  /** +1 when the team attacks the right net, -1 the left. */
  direction: 1 | -1;
  net: Point;
}

function sideFor(team: Team): Side {
  return team === 'home'
    ? { blueLine: RINK.blueLineRightX, direction: 1, net: { x: RINK.goalLineRightX, y: RINK.centerY } }
    : { blueLine: RINK.blueLineLeftX, direction: -1, net: { x: RINK.goalLineLeftX, y: RINK.centerY } };
}

/** How far into the attacking zone a point is (negative: outside it). */
function depthInZone(x: number, side: Side): number {
  return (x - side.blueLine) * side.direction;
}

function label(player: Player | undefined): string {
  return player ? `#${player.number}` : 'A player';
}

interface Timeline {
  compiled: CompiledDrill;
  times: number[];
  frames: SimulationFrame[];
}

function buildTimeline(drill: DrillDocumentV3): Timeline | null {
  try {
    const compiled = compileDrill(projectToV2(drill).drill);
    const times: number[] = [];
    const frames: SimulationFrame[] = [];
    for (let t = 0; t <= compiled.durationSeconds + 1e-6; t += STEP_SECONDS) {
      times.push(t);
      frames.push(sampleRawFrame(compiled, t));
    }
    return { compiled, times, frames };
  } catch {
    return null;
  }
}

function skatersOf(compiled: CompiledDrill, team: Team): Player[] {
  return [...compiled.players.values()].filter(player => player.team === team && player.role !== 'G');
}

/** The team in control of the puck at each frame: carrier, or whoever last released it. */
function puckTeams(timeline: Timeline): (Team | null)[] {
  const { compiled, frames, times } = timeline;
  let last: Team | null = null;
  return frames.map((frame, index) => {
    const carrier = frame.puck?.carrierId ? compiled.players.get(frame.puck.carrierId) : undefined;
    if (carrier) {
      last = carrier.team;
      return last;
    }
    const released = compiled.events
      .filter(event => event.departureSeconds <= times[index])
      .sort((a, b) => b.departureSeconds - a.departureSeconds)[0];
    const passer = released ? compiled.players.get(released.source.fromPlayerId) : undefined;
    return passer?.team ?? last;
  });
}

/**
 * Shift every movement of one actor later, so they wait at their start.
 * Used to hold an attacker at the blue line until the puck is in.
 */
function delayActor(drill: DrillDocumentV3, actorId: string, seconds: number): DrillDocumentV3 {
  const clone = structuredClone(drill);
  for (const track of clone.actorTracks) {
    if (track.actorId !== actorId) continue;
    for (const segment of track.segments) segment.startAtSeconds += seconds;
  }
  return clone;
}

function checkOffside(timeline: Timeline, issues: DrillValidationIssue[]): void {
  const { compiled, frames, times } = timeline;
  const teams = puckTeams(timeline);
  const flagged = new Set<string>();

  for (let index = 1; index < frames.length; index++) {
    const team = teams[index];
    const before = frames[index - 1].puck;
    const now = frames[index].puck;
    if (!team || !before || !now) continue;
    const side = sideFor(team);
    // The moment the puck itself crosses the blue line into the zone.
    if (!(depthInZone(before.x, side) < -PUCK_OUT_MARGIN && depthInZone(now.x, side) >= -PUCK_OUT_MARGIN)) continue;
    // Offside only exists against an opponent: a passing loop has no zone to enter.
    const opponents = skatersOf(compiled, team === 'home' ? 'away' : 'home');
    if (opponents.length === 0) continue;

    for (const player of skatersOf(compiled, team)) {
      // Each player is judged a step before the puck crosses.
      const position = frames[index - 1].players[player.id]?.position;
      if (!position || flagged.has(player.id)) continue;
      if (depthInZone(position.x, side) <= OFFSIDE_MARGIN) continue;
      flagged.add(player.id);

      // When they crossed the line: the fix holds them back by that much.
      let crossedAt = times[index - 1];
      for (let back = index - 1; back >= 0; back--) {
        const p = frames[back].players[player.id]?.position;
        if (!p || depthInZone(p.x, side) <= 0) break;
        crossedAt = times[back];
      }
      const hold = Math.max(0.3, times[index] - crossedAt + 0.3);
      const who = label(player);
      issues.push({
        id: `offside-${player.id}-${index}`,
        kind: 'offside',
        severity: 'warning',
        title: 'Offside',
        message: `${who} is over the blue line before the puck enters the zone at ${times[index].toFixed(1)}s. The puck has to cross the line first.`,
        affectedActorIds: [player.id],
        timestamp: times[index],
        proposal: {
          id: `hold-onside-${player.id}`,
          label: 'Hold Onside',
          description: `Holds ${who} back ${hold.toFixed(1)}s so they cross the line after the puck.`,
          apply: document => delayActor(document, player.id, hold),
        },
      });
    }
  }
}

/** Where a screen stands: the top of the crease, in front of the net. */
function netFrontSpot(side: Side): Point {
  return { x: side.net.x - side.direction * 6 * FT, y: side.net.y };
}

/** Drills whose shots are for the goalie or the shooter, not a team play. */
const SOLO_SHOT_CATEGORIES = new Set(['goalie', 'warm-up', 'skating', 'small-area-game', 'conditioning']);

function checkNetFront(drill: DrillDocumentV3, timeline: Timeline, issues: DrillValidationIssue[]): void {
  const { compiled } = timeline;
  if (drill.metadata.categories.some(category => SOLO_SHOT_CATEGORIES.has(category))) return;
  for (const event of compiled.events) {
    if (event.source.type !== 'shot') continue;
    const shooter = compiled.players.get(event.source.fromPlayerId);
    if (!shooter) continue;
    const teammates = skatersOf(compiled, shooter.team).filter(player => player.id !== shooter.id);
    if (teammates.length + 1 < TEAM_PLAY_SKATERS) continue;

    const side = sideFor(shooter.team);
    const frame = sampleRawFrame(compiled, event.departureSeconds);
    const from = frame.players[shooter.id]?.position;
    if (!from || Math.hypot(from.x - side.net.x, from.y - side.net.y) < SCREEN_SHOT_DISTANCE) continue;

    const spot = netFrontSpot(side);
    const nearNet = (player: Player) => {
      const p = frame.players[player.id]?.position;
      return p ? Math.hypot(p.x - spot.x, p.y - spot.y) : Infinity;
    };
    if (teammates.some(player => nearNet(player) <= NET_FRONT_REACH)) continue;

    // The fix sends the closest forward (never a defenceman) to the net.
    const forwards = teammates.filter(player => player.role !== 'D');
    const candidate = [...(forwards.length ? forwards : teammates)].sort((a, b) => nearNet(a) - nearNet(b))[0];
    const who = label(candidate);
    const release = event.departureSeconds;
    issues.push({
      id: `net-front-${event.source.id}`,
      kind: 'positioning',
      severity: 'suggestion',
      title: 'Nobody at the Net',
      message: `${label(shooter)} shoots from ${Math.round(Math.hypot(from.x - side.net.x, from.y - side.net.y) / FT)} ft out with no one screening the goalie or there for the rebound.`,
      affectedActorIds: [shooter.id, candidate.id],
      timestamp: release,
      proposal: {
        id: `screen-${event.source.id}`,
        label: 'Send to Net',
        description: `Sends ${who} to the top of the crease before the shot.`,
        apply: document => sendToNetFront(document, candidate.id, spot, release),
      },
    });
  }
}

/** Add a last leg taking `actorId` to the net front, arriving before `by`. */
function sendToNetFront(drill: DrillDocumentV3, actorId: string, spot: Point, by: number): DrillDocumentV3 {
  const clone = structuredClone(drill);
  const actor = clone.actors.find(item => item.id === actorId);
  if (!actor) return clone;
  let track = clone.actorTracks.find(item => item.actorId === actorId);
  if (!track) {
    track = { actorId, segments: [] };
    clone.actorTracks.push(track);
  }
  const last = [...track.segments].sort((a, b) => a.startAtSeconds - b.startAtSeconds).pop();
  const from = last ? last.points[last.points.length - 1] : actor.position;
  const travel = Math.hypot(spot.x - from.x, spot.y - from.y);
  // Roughly how long the skate takes, so they arrive just before the shot.
  const seconds = Math.max(1, travel / (18 * FT) + 0.8);
  const lastEnd = last ? last.startAtSeconds + last.durationSeconds : 0;
  track.segments.push({
    id: `seg-${actorId}-net-front`,
    phaseId: clone.phases[0]?.id ?? 'main',
    startAtSeconds: Math.max(0, Math.min(by - seconds, lastEnd)),
    durationSeconds: seconds,
    points: [{ ...from }, { x: spot.x, y: spot.y + (from.y < spot.y ? -8 : 8) }],
    curve: 'spline',
    movement: 'forward',
  });
  return clone;
}

function checkPointCoverage(timeline: Timeline, issues: DrillValidationIssue[]): void {
  const { compiled, frames, times } = timeline;
  const teams = puckTeams(timeline);
  for (const team of ['home', 'away'] as const) {
    const skaters = skatersOf(compiled, team);
    if (skaters.length < POINT_TEAM_SKATERS) continue;
    if (!skaters.some(player => player.role === 'D')) continue;
    const side = sideFor(team);

    let openSince: number | null = null;
    for (let index = 0; index < frames.length; index++) {
      const puck = frames[index].puck;
      const inZone = teams[index] === team && puck && depthInZone(puck.x, side) > 0;
      // Covered: somebody on the point, or back behind it - a defenceman
      // trailing a rush in the neutral zone is the safety valve too.
      const someoneHigh = skaters.some(player => {
        const p = frames[index].players[player.id]?.position;
        return p ? depthInZone(p.x, side) <= POINT_DEPTH : false;
      });
      if (!inZone || someoneHigh) {
        openSince = null;
        continue;
      }
      openSince ??= times[index];
      if (times[index] - openSince >= POINT_OPEN_SECONDS) {
        issues.push({
          id: `point-open-${team}`,
          kind: 'positioning',
          severity: 'suggestion',
          title: 'Point Left Open',
          message: `From ${openSince.toFixed(1)}s nobody is covering the blue line. If the puck comes out, it is an odd-man rush the other way - keep a defenceman (or a forward rotating up) on the point.`,
          affectedActorIds: skaters.filter(player => player.role === 'D').map(player => player.id),
          timestamp: openSince,
        });
        break;
      }
    }
  }
}

export function validatePositioning(drill: DrillDocumentV3, issues: DrillValidationIssue[]): void {
  const timeline = buildTimeline(drill);
  if (!timeline) return;
  checkOffside(timeline, issues);
  checkNetFront(drill, timeline, issues);
  checkPointCoverage(timeline, issues);
}
