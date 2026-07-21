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
 * Generate a random player number
 */
export function randomPlayerNumber(): string {
  return String(10 + Math.floor(Math.random() * 80));
}

/**
 * Generate a random goalie number (1-39)
 */
export function randomGoalieNumber(): string {
  return String(Math.floor(Math.random() * 39) + 1);
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

  // Goalies stand in their crease, a few feet off the goal line.
  const goalieOffsetFt = 3;

  return [
    // Home team, attacking right, breaking out of their own end
    home(28, 0, '11', 'C', true),
    home(44, -18, '13', 'LW'),
    home(44, 18, '44', 'RW'),
    home(62, -11, '5', 'D'),
    home(62, 11, '7', 'D'),
    createPlayer(goalLineLeftX + goalieOffsetFt * FT, centerY, 'home', '31', 'G'),

    // Away team, attacking left
    away(28, 0, '87', 'C'),
    away(44, -18, '19', 'LW'),
    away(44, 18, '71', 'RW'),
    away(62, -11, '6', 'D'),
    away(62, 11, '8', 'D'),
    createPlayer(goalLineRightX - goalieOffsetFt * FT, centerY, 'away', '1', 'G'),
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

  // Deep clone the drill
  const clone: Drill = {
    schemaVersion: 2,
    id: generateId(),
    name: newName ?? `${drill.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    players: drill.players.map(p => ({ ...p, id: generateId() })),
    skatePaths: [],
    events: [],
    coaches: (drill.coaches ?? []).map(c => ({ ...c, id: generateId() })),
    settings: drill.settings ? { ...drill.settings } : undefined,
  };

  // Rebuild ID mappings
  const playerIdMap = new Map<ID, ID>();
  drill.players.forEach((oldPlayer, index) => {
    playerIdMap.set(oldPlayer.id, clone.players[index].id);
  });

  // Clone skate paths with new IDs
  clone.skatePaths = drill.skatePaths.map(path => ({
    id: generateId(),
    ownerId: playerIdMap.get(path.ownerId) ?? path.ownerId,
    team: path.team,
    points: path.points.map(p => ({ ...p })),
  }));

  // Clone events with new IDs
  clone.events = drill.events.map(event => {
    const newEvent = {
      ...event,
      id: generateId(),
      fromPlayerId: playerIdMap.get(event.fromPlayerId) ?? event.fromPlayerId,
      fromPoint: { ...event.fromPoint },
      toPoint: { ...event.toPoint },
    };

    if (event.type === 'pass') {
      (newEvent as typeof event).toPlayerId =
        playerIdMap.get(event.toPlayerId) ?? event.toPlayerId;
    }

    return newEvent;
  });

  return clone;
}

/**
 * Validate drill data integrity
 */
export interface DrillValidation {
  valid: boolean;
  errors: string[];
}

export function validateDrill(drill: Drill): DrillValidation {
  const errors: string[] = [];

  // Check for required fields
  if (!drill.id) errors.push('Drill missing ID');
  if (!drill.name) errors.push('Drill missing name');
  if (!Array.isArray(drill.players)) errors.push('Drill missing players array');
  if (!Array.isArray(drill.skatePaths)) errors.push('Drill missing skatePaths array');
  if (!Array.isArray(drill.events)) errors.push('Drill missing events array');

  // Check for exactly one initial puck carrier
  const puckCarriers = drill.players.filter(p => p.hasPuck);
  if (puckCarriers.length === 0) {
    errors.push('No initial puck carrier');
  } else if (puckCarriers.length > 1) {
    errors.push('Multiple initial puck carriers');
  }

  // Check event references
  const playerIds = new Set(drill.players.map(p => p.id));

  drill.events.forEach((event, index) => {
    if (!playerIds.has(event.fromPlayerId)) {
      errors.push(`Event ${index}: fromPlayerId references non-existent player`);
    }
    if (event.type === 'pass' && !playerIds.has(event.toPlayerId)) {
      errors.push(`Event ${index}: toPlayerId references non-existent player`);
    }
  });

  // Check skate path references
  drill.skatePaths.forEach((path, index) => {
    if (!playerIds.has(path.ownerId)) {
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
