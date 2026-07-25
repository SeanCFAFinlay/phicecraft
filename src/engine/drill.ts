// ============================================================================
// DRILL ENGINE - Drill creation and management
// ============================================================================

import type {
  Drill,
  Player,
  SkatePath,
  CoachMarker,
  Team,
  PlayerRole,
  ID,
} from '@/core/types';
import { generateId } from '@/utils/id';
import { RINK, FT } from '@/core/constants';
import { teamDefendingNet } from './puck';

/**
 * Create a new player
 */
export function createPlayer(
  x: number,
  y: number,
  team: Team,
  number: string,
  role: PlayerRole,
  hasPuck: boolean = false
): Player {
  return {
    id: generateId(),
    x,
    y,
    team,
    number,
    role,
    hasPuck,
    visual: {
      handedness: team === 'home' ? 'right' : 'left',
      visor: role !== 'G',
    },
  };
}

/**
 * Pick a jersey number that no one on `team` is already wearing.
 *
 * Player identity is the immutable `id`, never the number, so a duplicate is
 * not a correctness problem - but two #17s on the same bench is confusing for
 * the coach, so the default we generate avoids it. A user is still free to
 * type a duplicate deliberately.
 */
export function nextPlayerNumber(
  players: Player[],
  team: Team,
  preferred: number[] = SKATER_NUMBER_POOL
): string {
  const taken = new Set(players.filter(player => player.team === team).map(player => player.number));
  for (const candidate of preferred) {
    if (!taken.has(String(candidate))) return String(candidate);
  }
  // Every preferred number is taken; walk upward until something is free.
  for (let candidate = 1; candidate <= 99; candidate++) {
    if (!taken.has(String(candidate))) return String(candidate);
  }
  return String(players.length + 1);
}

/** Skater numbers, in the order a coach would hand them out. */
const SKATER_NUMBER_POOL = [
  9, 10, 12, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 33, 34,
  36, 37, 38, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 52, 53, 55, 56, 57, 58,
  59, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 72, 73, 74, 75, 76, 77, 78, 79, 81,
  82, 83, 84, 85, 86, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
];

/** Goalies traditionally wear 1, 30-39. */
const GOALIE_NUMBER_POOL = [1, 30, 31, 32, 33, 34, 35, 29, 39, 60];

export function nextGoalieNumber(players: Player[], team: Team): string {
  return nextPlayerNumber(players, team, GOALIE_NUMBER_POOL);
}

/**
 * Create the default starting lineup
 */
export function createDefaultPlayers(): Player[] {
  const { centerX, centerY, goalLineLeftX, goalLineRightX } = RINK;

  // Positions are in feet off centre ice, so the lineup reads like a coach's
  // board rather than a set of magic fractions.
  const home = (
    aheadFt: number,
    acrossFt: number,
    number: string,
    role: PlayerRole,
    hasPuck = false
  ) => createPlayer(centerX - aheadFt * FT, centerY + acrossFt * FT, 'home', number, role, hasPuck);

  const away = (aheadFt: number, acrossFt: number, number: string, role: PlayerRole) =>
    createPlayer(centerX + aheadFt * FT, centerY + acrossFt * FT, 'away', number, role);

  // Goalies stand in their crease, a few feet off the goal line, at the end
  // their team defends. `teamDefendingNet` is the single source of that rule.
  const goalieOffsetFt = 3;
  const homeGoalX =
    teamDefendingNet('home') === 'L'
      ? goalLineLeftX + goalieOffsetFt * FT
      : goalLineRightX - goalieOffsetFt * FT;
  const awayGoalX =
    teamDefendingNet('away') === 'L'
      ? goalLineLeftX + goalieOffsetFt * FT
      : goalLineRightX - goalieOffsetFt * FT;

  return [
    // Home team, defending left, breaking out of their own end
    home(28, 0, '11', 'C', true),
    home(44, -18, '13', 'LW'),
    home(44, 18, '44', 'RW'),
    home(62, -11, '5', 'D'),
    home(62, 11, '7', 'D'),
    createPlayer(homeGoalX, centerY, 'home', '31', 'G'),

    // Away team, defending right
    away(28, 0, '87', 'C'),
    away(44, -18, '19', 'LW'),
    away(44, 18, '71', 'RW'),
    away(62, -11, '6', 'D'),
    away(62, 11, '8', 'D'),
    createPlayer(awayGoalX, centerY, 'away', '1', 'G'),
  ];
}

/**
 * Create a new empty drill
 */
export function createNewDrill(name: string = 'Neutral Zone Entry'): Drill {
  const now = Date.now();

  return {
    schemaVersion: 2,
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    players: createDefaultPlayers(),
    skatePaths: [],
    events: [],
    coaches: [],
    settings: {
      assistance: 'standard',
      recovery: 'nearest-teammate',
      timeLimitSeconds: 8,
      reducedEffects: false,
    },
  };
}

/**
 * Create a skate path
 */
export function createSkatePath(
  ownerId: ID,
  team: Team,
  points: { x: number; y: number }[]
): SkatePath {
  return {
    id: generateId(),
    ownerId,
    team,
    points: points.map(p => ({ x: p.x, y: p.y })),
    mode: 'skate',
    finish: 'stop',
  };
}

/**
 * Create a coach marker (the big bearded man on the ice).
 */
export function createCoach(x: number, y: number, name = 'Coach'): CoachMarker {
  return { id: generateId(), x, y, name };
}

/**
 * Duplicate a drill
 */
export function duplicateDrill(drill: Drill, newName?: string): Drill {
  const now = Date.now();

  // Deep clone first, THEN replace identity and reference fields. Rebuilding
  // each route from a hand-picked subset of fields is how `mode` and `finish`
  // used to be silently dropped from every copy - and any field added later
  // would have been dropped the same way.
  const source = structuredClone(drill);

  const playerIdMap = new Map<ID, ID>();
  const players = source.players.map(player => {
    const id = generateId();
    playerIdMap.set(player.id, id);
    return { ...player, id };
  });

  const coaches = (source.coaches ?? []).map(coach => ({ ...coach, id: generateId() }));

  const skatePaths = source.skatePaths.map(path => ({
    ...path,
    id: generateId(),
    ownerId: playerIdMap.get(path.ownerId) ?? path.ownerId,
  }));

  const events = source.events.map(event => {
    const cloned = {
      ...event,
      id: generateId(),
      fromPlayerId: playerIdMap.get(event.fromPlayerId) ?? event.fromPlayerId,
    };
    if (cloned.type === 'pass' && event.type === 'pass') {
      cloned.toPlayerId = playerIdMap.get(event.toPlayerId) ?? event.toPlayerId;
    }
    return cloned;
  });

  return {
    ...source,
    schemaVersion: 2,
    id: generateId(),
    name: newName ?? `${drill.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    players,
    coaches,
    skatePaths,
    events,
  };
}

/**
 * Validate drill data integrity
 */
export interface DrillValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate drill data integrity.
 *
 * Total for any input: a malformed or missing collection is reported, never
 * iterated. Validation crashing on bad data is what used to make a single
 * corrupt record take the whole editor down.
 */
export function validateDrill(drill: Drill): DrillValidation {
  const errors: string[] = [];

  // Check for required fields
  if (!drill?.id) errors.push('Drill missing ID');
  if (!drill?.name) errors.push('Drill missing name');
  if (!Array.isArray(drill?.players)) errors.push('Drill missing players array');
  if (!Array.isArray(drill?.skatePaths)) errors.push('Drill missing skatePaths array');
  if (!Array.isArray(drill?.events)) errors.push('Drill missing events array');

  const players = Array.isArray(drill?.players) ? drill.players : [];
  const events = Array.isArray(drill?.events) ? drill.events : [];
  const skatePaths = Array.isArray(drill?.skatePaths) ? drill.skatePaths : [];

  // Exactly one initial puck carrier, once anyone is on the ice.
  const puckCarriers = players.filter(p => p?.hasPuck);
  if (players.length > 0 && puckCarriers.length === 0) {
    errors.push('No initial puck carrier');
  } else if (puckCarriers.length > 1) {
    errors.push('Multiple initial puck carriers');
  }

  // Check event references
  const playerIds = new Set(players.map(p => p?.id));

  events.forEach((event, index) => {
    if (!playerIds.has(event?.fromPlayerId)) {
      errors.push(`Event ${index}: fromPlayerId references non-existent player`);
    }
    if (event?.type === 'pass' && !playerIds.has(event.toPlayerId)) {
      errors.push(`Event ${index}: toPlayerId references non-existent player`);
    }
  });

  // Check skate path references
  skatePaths.forEach((path, index) => {
    if (!playerIds.has(path?.ownerId)) {
      errors.push(`SkatePath ${index}: ownerId references non-existent player`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Repair drill data (fix common issues)
 */
export function repairDrill(drill: Drill): Drill {
  const repaired = { ...drill, schemaVersion: 2 as const };

  // Ensure arrays exist
  if (!Array.isArray(repaired.players)) repaired.players = [];
  if (!Array.isArray(repaired.skatePaths)) repaired.skatePaths = [];
  if (!Array.isArray(repaired.events)) repaired.events = [];
  if (!Array.isArray(repaired.coaches)) repaired.coaches = [];
  repaired.settings = {
    assistance: repaired.settings?.assistance ?? 'standard',
    recovery: repaired.settings?.recovery ?? 'nearest-teammate',
    timeLimitSeconds: Math.max(2, repaired.settings?.timeLimitSeconds ?? 8),
    reducedEffects: repaired.settings?.reducedEffects ?? false,
    jerseys: repaired.settings?.jerseys,
  };
  repaired.players = repaired.players.map(player => ({
    ...player,
    visual: player.visual ?? {
      handedness: player.team === 'home' ? 'right' : 'left',
      visor: player.role !== 'G',
    },
  }));
  repaired.skatePaths = repaired.skatePaths.map(path => ({
    ...path,
    mode: path.mode ?? 'skate',
    finish: path.finish ?? 'stop',
  }));

  // Ensure exactly one puck carrier
  const carriers = repaired.players.filter(p => p.hasPuck);
  if (carriers.length === 0 && repaired.players.length > 0) {
    repaired.players = repaired.players.map((p, i) =>
      i === 0 ? { ...p, hasPuck: true } : p
    );
  } else if (carriers.length > 1) {
    let foundFirst = false;
    repaired.players = repaired.players.map(p => {
      if (p.hasPuck) {
        if (foundFirst) {
          return { ...p, hasPuck: false };
        }
        foundFirst = true;
      }
      return p;
    });
  }

  // Remove orphaned skate paths
  const playerIds = new Set(repaired.players.map(p => p.id));
  repaired.skatePaths = repaired.skatePaths.filter(path =>
    playerIds.has(path.ownerId)
  );

  // Remove orphaned events
  repaired.events = repaired.events.filter(event => {
    if (!playerIds.has(event.fromPlayerId)) return false;
    if (event.type === 'pass' && !playerIds.has(event.toPlayerId)) return false;
    return true;
  });

  return repaired;
}

/**
 * Export drill to JSON string
 */
export function exportDrillToJson(drill: Drill): string {
  return JSON.stringify(drill, null, 2);
}

/**
 * Import drill from JSON string
 */
export function importDrillFromJson(json: string): Drill | null {
  try {
    const data = JSON.parse(json);

    // Basic validation
    if (!data || typeof data !== 'object') return null;
    if (!data.name || !Array.isArray(data.players)) return null;

    // Assign new ID and timestamps
    const drill: Drill = {
      schemaVersion: 2,
      id: generateId(),
      name: data.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players: data.players ?? [],
      skatePaths: data.skatePaths ?? [],
      events: data.events ?? [],
      settings: data.settings,
    };

    // Repair any issues
    return repairDrill(drill);
  } catch {
    return null;
  }
}

/**
 * Get drill summary for list display
 */
export interface DrillSummary {
  id: ID;
  name: string;
  updatedAt: number;
  playerCount: number;
  eventCount: number;
}

export function getDrillSummary(drill: Drill): DrillSummary {
  return {
    id: drill.id,
    name: drill.name,
    updatedAt: drill.updatedAt,
    playerCount: drill.players.length,
    eventCount: drill.events.length,
  };
}
