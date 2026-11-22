// ============================================================================
// DRILL STORY
//
// Reads a drill the way a coach explains it at the whiteboard, from the same
// simulation the board animates - never from guesses about what the lines
// might mean:
//
//   - SETUP: who starts where, and where the puck is.
//   - STEPS: the drill cut into numbered moments (one per puck action, plus
//     the skating that leads into the first one), each with a time window so
//     playback can highlight the step that is on the ice right now.
//   - PLAYER CARDS: "what does #17 do" - every player's own job, in order,
//     with the spots named in hockey terms (half-wall, slot, point...).
//   - COACHING POINTS and COMMON MISTAKES that match what the drill actually
//     contains (a drill with no backward skating gets no backward cues).
// ============================================================================

import type { Drill, DrillEvent, Player, Point, Team } from '@/core/types';
import { FT, RINK } from '@/core/constants';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame } from '@/sim/sampleFrame';
import type { CompiledDrill, SimulationFrame } from '@/sim/types';

const STEP_SECONDS = 0.1;
/** Slower than this (units/s) is standing still. */
const MOVING_SPEED = 6;
/** Movement shorter than this is a shuffle, not a route. */
const MIN_ROUTE_DISTANCE = 4 * FT;
/** Pauses shorter than this do not split one skate into two. */
const MERGE_GAP_SECONDS = 0.35;

export interface StoryStep {
  /** 1-based, as shown to players. */
  number: number;
  startSeconds: number;
  endSeconds: number;
  title: string;
  detail: string;
  /** Everyone who has a part in this step. */
  playerIds: string[];
  eventId?: string;
}

export interface PlayerDuty {
  atSeconds: number;
  text: string;
}

export interface PlayerCard {
  playerId: string;
  team: Team;
  teamName: string;
  number: string;
  name?: string;
  role: string;
  /** "#17 Smith · Left wing". */
  label: string;
  start: string;
  duties: PlayerDuty[];
  cues: string[];
}

export interface DrillStory {
  title: string;
  overview: string;
  setup: string[];
  steps: StoryStep[];
  players: PlayerCard[];
  coachingPoints: string[];
  mistakes: string[];
  durationSeconds: number;
}

// ----------------------------------------------------------------------------
// Naming places on the ice
// ----------------------------------------------------------------------------

const ROLE_NAMES: Record<string, string> = {
  C: 'Centre',
  LW: 'Left wing',
  RW: 'Right wing',
  D: 'Defence',
  G: 'Goalie',
  F: 'Forward',
};

/**
 * Where a point is, in the words a player hears on the bench - from that
 * player's own team's point of view (home attacks the right net).
 */
export function describeSpot(point: Point, team: Team): string {
  const direction = team === 'home' ? 1 : -1;
  const attackGoal = team === 'home' ? RINK.goalLineRightX : RINK.goalLineLeftX;
  const ownGoal = team === 'home' ? RINK.goalLineLeftX : RINK.goalLineRightX;
  const attackBlue = team === 'home' ? RINK.blueLineRightX : RINK.blueLineLeftX;
  const ownBlue = team === 'home' ? RINK.blueLineLeftX : RINK.blueLineRightX;

  // Positive = the player's left as they face the net they attack.
  const lateral = (RINK.centerY - point.y) * direction;
  const side = lateral >= 0 ? 'left' : 'right';
  const wide = Math.abs(lateral) / FT;

  if ((point.x - attackBlue) * direction >= 0) {
    return zoneSpot((attackGoal - point.x) * direction / FT, wide, side, false);
  }
  if ((point.x - ownBlue) * direction <= 0) {
    return zoneSpot((point.x - ownGoal) * direction / FT, wide, side, true);
  }
  // Neutral zone.
  if (Math.abs(point.x - RINK.centerX) < 8 * FT && wide < 15) return 'centre ice';
  const nearAttackBlue = Math.abs(point.x - attackBlue) < 10 * FT;
  const nearOwnBlue = Math.abs(point.x - ownBlue) < 10 * FT;
  const lane = wide < 12 ? 'the middle lane' : wide > 30 ? `the ${side} wall` : `the ${side} lane`;
  if (nearAttackBlue) return `${lane} at the offensive blue line`;
  if (nearOwnBlue) return `${lane} at your own blue line`;
  return `${lane} of the neutral zone`;
}

/** `depth` is feet out from the goal line toward the blue line (negative: behind it). */
function zoneSpot(depth: number, wide: number, side: string, own: boolean): string {
  const ofZone = own ? ' of your zone' : '';
  if (depth < 0) return wide < 10 ? `behind ${own ? 'your own' : 'the'} net` : `the ${side} corner${ofZone}`;
  if (depth < 15 && wide < 12) return own ? 'the front of your net' : 'the net front';
  if (depth < 22 && wide > 30) return `the ${side} corner${ofZone}`;
  if (depth < 35 && wide < 20) return own ? 'your slot' : 'the slot';
  if (depth < 52 && wide < 20) return own ? 'the high slot of your zone' : 'the high slot';
  if (depth < 52 && wide >= 30) return `the ${side} half-wall${ofZone}`;
  if (depth < 52) return `the ${side} faceoff circle${ofZone}`;
  if (own) return wide < 15 ? 'the middle of your blue line' : `the ${side} side of your blue line`;
  return wide < 15 ? 'the top of the zone' : `the ${side} point`;
}

// ----------------------------------------------------------------------------
// Reading the simulation
// ----------------------------------------------------------------------------

interface Movement {
  start: number;
  end: number;
  from: Point;
  to: Point;
  via: Point;
  /** The point furthest from where the skate began (the turnaround). */
  far: Point;
  backward: boolean;
  /** Came to a stop before the drill ended. */
  stops: boolean;
  distance: number;
}

function sampleTimeline(compiled: CompiledDrill): { times: number[]; frames: SimulationFrame[] } {
  const times: number[] = [];
  const frames: SimulationFrame[] = [];
  for (let t = 0; t <= compiled.durationSeconds + 1e-6; t += STEP_SECONDS) {
    times.push(t);
    frames.push(sampleFrame(compiled, t));
  }
  return { times, frames };
}

function movementsFor(playerId: string, times: number[], frames: SimulationFrame[]): Movement[] {
  type Raw = { start: number; end: number; startIndex: number; endIndex: number; backwardVotes: number; samples: number };
  const raw: Raw[] = [];
  let open: Raw | null = null;

  frames.forEach((frame, index) => {
    const p = frame.players[playerId];
    if (!p) return;
    const moving = p.speed > MOVING_SPEED;
    if (moving) {
      const facing = { x: Math.cos(p.heading), y: Math.sin(p.heading) };
      const v = Math.hypot(p.velocity.x, p.velocity.y) || 1;
      const backward = (facing.x * p.velocity.x + facing.y * p.velocity.y) / v < -0.3;
      if (open && times[index] - open.end <= MERGE_GAP_SECONDS) {
        open.end = times[index];
        open.endIndex = index;
      } else {
        if (open) raw.push(open);
        open = { start: times[index], end: times[index], startIndex: index, endIndex: index, backwardVotes: 0, samples: 0 };
      }
      open.samples += 1;
      if (backward) open.backwardVotes += 1;
    }
  });
  if (open) raw.push(open);

  const last = times.length - 1;
  return raw
    .map(item => {
      const startIndex = Math.max(0, item.startIndex - 1);
      const endIndex = Math.min(last, item.endIndex + 1);
      const from = frames[startIndex].players[playerId].position;
      const to = frames[endIndex].players[playerId].position;
      const via = frames[Math.round((startIndex + endIndex) / 2)].players[playerId].position;
      let distance = 0;
      let far = from;
      let farDistance = 0;
      for (let i = startIndex + 1; i <= endIndex; i += 1) {
        const a = frames[i - 1].players[playerId].position;
        const b = frames[i].players[playerId].position;
        distance += Math.hypot(b.x - a.x, b.y - a.y);
        const out = Math.hypot(b.x - from.x, b.y - from.y);
        if (out > farDistance) { farDistance = out; far = b; }
      }
      return {
        start: times[startIndex],
        end: times[endIndex],
        from: { ...from },
        to: { ...to },
        via: { ...via },
        far: { ...far },
        backward: item.backwardVotes > item.samples / 2,
        stops: endIndex < last,
        distance,
      };
    })
    .filter(move => move.distance >= MIN_ROUTE_DISTANCE);
}

function seconds(value: number): string {
  return `${value.toFixed(1)}s`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

// ----------------------------------------------------------------------------
// The story
// ----------------------------------------------------------------------------

export function buildDrillStory(drill: Drill): DrillStory {
  const coaching = drill.settings?.coaching;
  const teamName = (team: Team) => coaching?.teams[team]?.trim() || (team === 'home' ? 'Home' : 'Away');
  const byId = new Map(drill.players.map(player => [player.id, player]));
  const short = (id: string) => {
    const player = byId.get(id);
    return player ? `#${player.number}` : 'a teammate';
  };
  const spotOf = (point: Point, playerId: string) => describeSpot(point, byId.get(playerId)?.team ?? 'home');

  let compiled: CompiledDrill;
  let timeline: { times: number[]; frames: SimulationFrame[] };
  try {
    compiled = compileDrill(drill);
    timeline = sampleTimeline(compiled);
  } catch {
    return emptyStory(drill);
  }
  const duration = compiled.durationSeconds;
  const finalFrame = timeline.frames.at(-1);
  const executions = new Map(finalFrame?.eventExecutions.map(item => [item.eventId, item]) ?? []);
  const blocked = (event: DrillEvent) => executions.get(event.id)?.status === 'blocked';

  const movements = new Map(drill.players.map(player => [player.id, movementsFor(player.id, timeline.times, timeline.frames)]));
  const events = compiled.events.filter(item => !blocked(item.source));
  // Where each player stands when they receive: the real catch point.
  const positionAt = (playerId: string, time: number): Point => {
    const index = Math.min(timeline.frames.length - 1, Math.max(0, Math.round(time / STEP_SECONDS)));
    return timeline.frames[index].players[playerId]?.position ?? byId.get(playerId) ?? { x: RINK.centerX, y: RINK.centerY };
  };

  // --- Setup ---------------------------------------------------------------
  const setup: string[] = [];
  for (const team of ['home', 'away'] as Team[]) {
    const players = drill.players.filter(player => player.team === team);
    if (players.length === 0) continue;
    const spots = players.map(player => `#${player.number} ${ROLE_NAMES[player.role] ?? player.role} ${player.role === 'G' ? 'in the crease' : `at ${describeSpot(player, team)}`}`);
    setup.push(`${teamName(team)}: ${spots.join('; ')}.`);
  }
  const carrier = drill.players.find(player => player.hasPuck);
  if (carrier) setup.push(`The puck starts with #${carrier.number}.`);
  else if (drill.initialPuck) setup.push(`The puck starts loose at ${describeSpot(drill.initialPuck, 'home')}.`);
  if (drill.equipment?.length) {
    const counts = new Map<string, number>();
    for (const item of drill.equipment) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    setup.push(`Equipment: ${[...counts].map(([kind, count]) => `${count} ${kind.replace(/-/g, ' ')}${count > 1 && !kind.endsWith('s') ? 's' : ''}`).join(', ')}.`);
  }

  // --- Steps ---------------------------------------------------------------
  const steps: StoryStep[] = [];
  const meanwhile = (start: number, end: number, exclude: Set<string>): string => {
    const notes: string[] = [];
    for (const player of drill.players) {
      if (exclude.has(player.id) || player.role === 'G') continue;
      const move = movements.get(player.id)?.find(item => item.start < end - 0.05 && item.end > start + 0.05);
      if (!move) continue;
      const destination = spotOf(move.to, player.id);
      notes.push(`#${player.number} ${move.backward ? 'skates backward to' : 'skates to'} ${destination}`);
      if (notes.length === 3) break;
    }
    return notes.length ? ` Meanwhile ${list(notes)}.` : '';
  };

  const firstDeparture = events[0]?.departureSeconds ?? duration;
  if (events.length === 0) {
    // A skating drill: one step per wave of players who start together.
    const starts = new Map<number, { playerIds: string[]; moves: Movement[] }>();
    for (const player of drill.players) {
      for (const move of movements.get(player.id) ?? []) {
        const key = Math.round(move.start * 2) / 2;
        const wave = starts.get(key) ?? { playerIds: [], moves: [] };
        wave.playerIds.push(player.id);
        wave.moves.push(move);
        starts.set(key, wave);
      }
    }
    const waves = [...starts].sort((a, b) => a[0] - b[0]);
    waves.forEach(([start, wave], index) => {
      const end = waves[index + 1]?.[0] ?? duration;
      const who = list([...new Set(wave.playerIds)].map(short));
      const first = wave.moves[0];
      const firstOwner = wave.playerIds[0];
      steps.push({
        number: index + 1,
        startSeconds: start,
        endSeconds: Math.max(end, start + 0.1),
        title: `${who} ${first.backward ? 'skate backward' : 'skate'}`,
        detail: `${who} ${first.backward ? 'skates backward' : 'skates'} from ${spotOf(first.from, firstOwner)} to ${spotOf(first.to, firstOwner)}${first.stops ? ', then stops' : ''}.`,
        playerIds: [...new Set(wave.playerIds)],
      });
    });
  } else {
    if (firstDeparture > 0.8) {
      const movers = drill.players.filter(player => movements.get(player.id)?.some(move => move.start < firstDeparture));
      steps.push({
        number: 1,
        startSeconds: 0,
        endSeconds: firstDeparture,
        title: movers.length ? 'Get into position' : 'Set up',
        detail: movers.length
          ? `Players move into their starting lanes before the first puck action.${meanwhile(0, firstDeparture, new Set())}`
          : 'Players hold their starting spots.',
        playerIds: movers.map(player => player.id),
      });
    }
    events.forEach((item, index) => {
      const event = item.source;
      const end = events[index + 1]?.departureSeconds ?? duration;
      const start = item.departureSeconds;
      const from = short(event.fromPlayerId);
      const involved = new Set<string>([event.fromPlayerId]);
      let title: string;
      let detail: string;
      if (event.type === 'pass') {
        involved.add(event.toPlayerId);
        const catchAt = spotOf(positionAt(event.toPlayerId, item.arrivalSeconds), event.toPlayerId);
        title = `${from} passes to ${short(event.toPlayerId)}`;
        detail = `${from} passes from ${spotOf(positionAt(event.fromPlayerId, start), event.fromPlayerId)} to ${short(event.toPlayerId)}, who takes it at ${catchAt}.`;
      } else if (event.type === 'shot') {
        title = `${from} shoots`;
        detail = `${from} shoots on net from ${spotOf(positionAt(event.fromPlayerId, start), event.fromPlayerId)}${event.result ? ` (planned result: ${event.result})` : ''}.`;
      } else if (event.type === 'dump') {
        title = `${from} dumps the puck in`;
        detail = `${from} chips the puck into ${spotOf(event.toPoint, event.fromPlayerId)} for a teammate to retrieve.`;
      } else {
        title = `${from} picks up the puck`;
        detail = `${from} collects the puck at ${spotOf(event.toPoint ?? event.fromPoint, event.fromPlayerId)}.`;
      }
      steps.push({
        number: steps.length + 1,
        startSeconds: start,
        endSeconds: Math.max(end, start + 0.1),
        title,
        detail: detail + meanwhile(start, end, involved),
        playerIds: [...involved],
        eventId: event.id,
      });
    });
  }

  // --- Player cards --------------------------------------------------------
  const roleOf = (player: Player) => ROLE_NAMES[player.role] ?? player.role;
  const players: PlayerCard[] = drill.players.map(player => {
    const duties: PlayerDuty[] = [];
    const moves = movements.get(player.id) ?? [];
    const flags = { receives: false, passes: false, shoots: false, backward: false, stops: false, carries: player.hasPuck };

    if (player.role !== 'G') {
      for (const move of moves) {
        const from = describeSpot(move.from, player.team);
        const to = describeSpot(move.to, player.team);
        const via = describeSpot(move.via, player.team);
        const far = describeSpot(move.far, player.team);
        const skate = move.backward ? 'skate backward' : 'skate';
        let path: string;
        if (from !== to) {
          const apart = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) > 25 * FT;
          const showVia = via !== from && via !== to && apart(move.via, move.from) && apart(move.via, move.to);
          path = `${skate} from ${from}${showVia ? ` through ${via}` : ''} to ${to}`;
        } else if (far !== from) {
          path = `${skate} from ${from} to ${far} and back`;
        } else if (/point|blue line/.test(to)) {
          path = `walk the line at ${to}`;
        } else {
          continue;
        }
        duties.push({ atSeconds: move.start, text: `${path}${move.stops ? ', then stop' : ''}` });
        flags.backward ||= move.backward;
      }
      // Stop-and-go: a hard stop, then going again.
      flags.stops = moves.some((move, index) => move.stops && index < moves.length - 1);
    }

    for (const item of events) {
      const event = item.source;
      if (event.type === 'pass' && event.fromPlayerId === player.id) {
        flags.passes = true;
        duties.push({ atSeconds: item.departureSeconds, text: `pass to ${short(event.toPlayerId)} (${spotOf(positionAt(event.toPlayerId, item.arrivalSeconds), event.toPlayerId)})` });
      } else if (event.type === 'pass' && event.toPlayerId === player.id) {
        flags.receives = true;
        duties.push({ atSeconds: item.arrivalSeconds, text: `receive the pass from ${short(event.fromPlayerId)} at ${describeSpot(positionAt(player.id, item.arrivalSeconds), player.team)}` });
      } else if (event.type === 'shot' && event.fromPlayerId === player.id) {
        flags.shoots = true;
        duties.push({ atSeconds: item.departureSeconds, text: `shoot on net from ${describeSpot(positionAt(player.id, item.departureSeconds), player.team)}` });
      } else if (event.type === 'dump' && event.fromPlayerId === player.id) {
        duties.push({ atSeconds: item.departureSeconds, text: `dump the puck into ${describeSpot(event.toPoint, player.team)}` });
      } else if (event.type === 'pickup' && event.fromPlayerId === player.id) {
        flags.carries = true;
        duties.push({ atSeconds: item.departureSeconds, text: `pick up the puck at ${describeSpot(event.toPoint ?? event.fromPoint, player.team)}` });
      } else if (event.type === 'shot' && player.role === 'G' && (event.targetNet === 'R') === (player.x > RINK.centerX)) {
        duties.push({ atSeconds: item.departureSeconds, text: `set square for the shot from ${short(event.fromPlayerId)}; control the rebound` });
      }
    }
    duties.sort((a, b) => a.atSeconds - b.atSeconds);

    if (player.role === 'G') {
      duties.unshift({ atSeconds: 0, text: 'start on your crease, square to the puck; follow it post to post' });
    } else if (duties.length === 0) {
      duties.push({ atSeconds: 0, text: `hold ${describeSpot(player, player.team)}${player.role === 'D' ? ', stick on the ice, ready to support' : ' and stay ready for the puck'}` });
    }

    const opponents = drill.players.some(other => other.team !== player.team && other.role !== 'G');
    const neverHasPuck = !flags.carries && !flags.receives && !flags.passes && !flags.shoots;
    const cues: string[] = [];
    if (player.role === 'G') cues.push('Beat the pass across: push and set before the shot.', 'Eyes through the screen; find the puck.');
    else if (neverHasPuck && opponents && player.team !== (carrier?.team ?? 'home')) cues.push('Stick on puck, body on body.', 'Keep the attacker to the outside; protect the middle.');
    if (flags.receives) cues.push('Show a target with your stick before the puck comes.');
    if (flags.passes) cues.push('Look first, then pass to the stick - lead your teammate.');
    if (flags.shoots) cues.push('Shoot in stride, then follow your shot for the rebound.');
    if (flags.backward) cues.push('Skating backward: knees bent, weight on the balls of your feet.');
    if (flags.stops) cues.push('Stop hard on both edges, then push out the other way.');
    if (cues.length === 0) cues.push(player.role === 'D' ? 'Stay between your check and your net.' : 'Keep your feet moving and your stick on the ice.');

    return {
      playerId: player.id,
      team: player.team,
      teamName: teamName(player.team),
      number: player.number,
      name: player.name,
      role: roleOf(player),
      label: `#${player.number}${player.name ? ` ${player.name}` : ''} · ${roleOf(player)}`,
      start: `${player.role === 'G' ? 'your crease' : describeSpot(player, player.team)}${player.hasPuck ? ', with the puck' : ''}`,
      duties: duties.map(duty => ({ atSeconds: duty.atSeconds, text: duty.text.charAt(0).toUpperCase() + duty.text.slice(1) })),
      cues: cues.slice(0, 3),
    };
  });

  // --- Coaching points & mistakes -----------------------------------------
  const kinds = new Set(events.map(item => item.source.type));
  const anyBackward = [...movements.values()].some(moves => moves.some(move => move.backward));
  const anyStops = [...movements.values()].some(moves => moves.some((move, index) => move.stops && index < moves.length - 1));
  // Someone carries the attack over a blue line during the drill.
  const crossesLine = drill.players.some(player => {
    if (player.role === 'G') return false;
    const blue = player.team === 'home' ? RINK.blueLineRightX : RINK.blueLineLeftX;
    const direction = player.team === 'home' ? 1 : -1;
    const depths = timeline.frames.map(frame => ((frame.players[player.id]?.position.x ?? player.x) - blue) * direction);
    return depths[0] < 0 && depths.some(depth => depth > 0);
  });
  const authored = (coaching?.cues ?? '').split(/[\n·•;]/).map(cue => cue.trim()).filter(Boolean);
  const coachingPoints = [...authored];
  if (kinds.has('pass')) coachingPoints.push('Passes arrive on the tape, ahead of the receiver - in stride, not behind.');
  if (kinds.has('shot')) coachingPoints.push('Every shot has a player driving the net for the rebound.');
  if (kinds.has('dump')) coachingPoints.push('Dump it to space away from the goalie, then win the race.');
  if (anyStops) coachingPoints.push('Stops are hard stops - no coasting through the turn.');
  if (coachingPoints.length === 0) coachingPoints.push('Full speed, head up, stick on the ice.');

  const mistakes: string[] = [];
  if (kinds.has('pass')) {
    mistakes.push('Passing to where the receiver is, not where they are going.');
    mistakes.push('Receivers gliding or stopping to take the pass - keep the feet moving.');
  }
  if (kinds.has('shot')) mistakes.push('Shooting with nobody at the net - no screen, no rebound.');
  if (anyBackward) mistakes.push('Opening the hips too early when skating backward.');
  if (anyStops) mistakes.push('Rounding the stop instead of stopping and starting.');
  if (crossesLine && drill.players.some(player => player.team === 'away' && player.role !== 'G') && drill.players.some(player => player.team === 'home' && player.role !== 'G')) {
    mistakes.push('Attackers crossing the blue line before the puck (offside).');
  }
  if (mistakes.length === 0) mistakes.push('Going through the motions at half speed.');

  const passes = events.filter(item => item.source.type === 'pass').length;
  const shots = events.filter(item => item.source.type === 'shot').length;
  const homeCount = drill.players.filter(player => player.team === 'home').length;
  const awayCount = drill.players.length - homeCount;
  const counts = [
    `${drill.players.length} players${awayCount ? ` (${homeCount} ${teamName('home')}, ${awayCount} ${teamName('away')})` : ''}`,
    passes ? `${passes} pass${passes > 1 ? 'es' : ''}` : '',
    shots ? `${shots} shot${shots > 1 ? 's' : ''}` : '',
    `${seconds(duration)} per rep`,
  ].filter(Boolean);

  return {
    title: drill.name,
    overview: [coaching?.objective?.trim(), counts.join(' · ')].filter(Boolean).join(' - '),
    setup,
    steps,
    players,
    coachingPoints: coachingPoints.slice(0, 6),
    mistakes: mistakes.slice(0, 5),
    durationSeconds: duration,
  };
}

function emptyStory(drill: Drill): DrillStory {
  return {
    title: drill.name,
    overview: `${drill.players.length} players`,
    setup: [],
    steps: [],
    players: [],
    coachingPoints: [],
    mistakes: [],
    durationSeconds: 0,
  };
}

/** The step on the ice at `seconds` (the last one once the drill has ended). */
export function stepAt(story: DrillStory, timeSeconds: number): StoryStep | null {
  if (story.steps.length === 0) return null;
  for (let i = story.steps.length - 1; i >= 0; i -= 1) {
    if (timeSeconds >= story.steps[i].startSeconds - 1e-6) return story.steps[i];
  }
  return story.steps[0];
}

/** A plain-text handout: overview, setup, steps, every player's job, cues. */
export function storyText(story: DrillStory): string {
  const lines: string[] = [story.title, story.overview, ''];
  if (story.setup.length) lines.push('SETUP', ...story.setup.map(line => `- ${line}`), '');
  if (story.steps.length) {
    lines.push('SEQUENCE');
    for (const step of story.steps) lines.push(`${step.number}. (${seconds(step.startSeconds)}) ${step.title}`, `   ${step.detail}`);
    lines.push('');
  }
  if (story.players.length) {
    lines.push('PLAYER JOBS');
    for (const card of story.players) {
      lines.push(`${card.teamName} ${card.label} - start: ${card.start}`);
      for (const duty of card.duties) lines.push(`   ${seconds(duty.atSeconds)}  ${duty.text}`);
      lines.push(`   Cues: ${card.cues.join(' ')}`);
    }
    lines.push('');
  }
  if (story.coachingPoints.length) lines.push('COACHING POINTS', ...story.coachingPoints.map(point => `- ${point}`), '');
  if (story.mistakes.length) lines.push('WATCH FOR', ...story.mistakes.map(point => `- ${point}`));
  return lines.join('\n').trim() + '\n';
}
