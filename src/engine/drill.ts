// ============================================================================
// DRILL ENGINE - Drill creation and management
// ============================================================================

import type {
  Drill,
  Player,
  SkatePath,
  DrillEvent,
  Team,
  PlayerRole,
  ID,
} from '@/core/types';
import { generateId } from '@/utils/id';
import { RINK } from '@/core/constants';

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
  const cx = RINK.x + RINK.width / 2;
  const cy = RINK.y + RINK.height / 2;
  const w = RINK.width;
  const h = RINK.height;

  const players: Player[] = [
    // Home team (attacking right)
    createPlayer(cx - w * 0.14, cy, 'home', '11', 'C', true), // Center - has puck
    createPlayer(cx - w * 0.22, cy - h * 0.22, 'home', '13', 'LW'),
    createPlayer(cx - w * 0.22, cy + h * 0.22, 'home', '44', 'RW'),
    createPlayer(cx - w * 0.31, cy - h * 0.13, 'home', '5', 'D'),
    createPlayer(cx - w * 0.31, cy + h * 0.13, 'home', '7', 'D'),
    createPlayer(RINK.x + w * 0.04, cy, 'home', '31', 'G'),

    // Away team (attacking left)
    createPlayer(cx + w * 0.14, cy, 'away', '87', 'C'),
    createPlayer(cx + w * 0.22, cy - h * 0.22, 'away', '19', 'LW'),
    createPlayer(cx + w * 0.22, cy + h * 0.22, 'away', '71', 'RW'),
    createPlayer(cx + w * 0.31, cy - h * 0.13, 'away', '6', 'D'),
    createPlayer(cx + w * 0.31, cy + h * 0.13, 'away', '8', 'D'),
    createPlayer(RINK.x + w * 0.96, cy, 'away', '1', 'G'),
  ];

  return players;
}

/**
 * Create a new empty drill
 */
export function createNewDrill(name: string = 'Neutral Zone Entry'): Drill {
  const now = Date.now();

  return {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    players: createDefaultPlayers(),
    skatePaths: [],
    events: [],
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
  };
}

/**
 * Duplicate a drill
 */
export function duplicateDrill(drill: Drill, newName?: string): Drill {
  const now = Date.now();

  // Deep clone the drill
  const clone: Drill = {
    id: generateId(),
    name: newName ?? `${drill.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    players: drill.players.map(p => ({ ...p, id: generateId() })),
    skatePaths: [],
    events: [],
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
  const repaired = { ...drill };

  // Ensure arrays exist
  if (!Array.isArray(repaired.players)) repaired.players = [];
  if (!Array.isArray(repaired.skatePaths)) repaired.skatePaths = [];
  if (!Array.isArray(repaired.events)) repaired.events = [];

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
      id: generateId(),
      name: data.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players: data.players ?? [],
      skatePaths: data.skatePaths ?? [],
      events: data.events ?? [],
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
