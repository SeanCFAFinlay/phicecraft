// ============================================================================
// DRILL PIPELINE - pure, total functions for untrusted drill documents
//
//   parseDrillCandidate   unknown  -> a plain object, or a reason it is not one
//   normalizeDrillCandidate        -> every required field present, junk dropped
//   migrateDrillCandidate          -> current schema version
//   validateDrillDocument          -> domain reference errors, no mutation
//   repairDrillDocument            -> smallest fix that makes it valid
//   remapImportedDrill             -> fresh identity, every reference rewritten
//
// None of these throw. Every one of them accepts arbitrary JSON-compatible
// input, including `null`, primitives, and deeply malformed arrays. That is the
// whole point: validation must never be the thing that crashes on bad data.
// ============================================================================

import type {
  CoachMarker,
  Drill,
  DrillEvent,
  DrillSettings,
  ID,
  PassEvent,
  Player,
  PlayerRole,
  Point,
  SkatePath,
  Team,
} from '@/core/types';
import { DEFAULT_JERSEYS } from '@/core/types';
import { IMPORT_LIMITS } from './schema';

export const CURRENT_DRILL_SCHEMA_VERSION = 2 as const;

// ----------------------------------------------------------------------------
// Small total helpers
// ----------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asTeam(value: unknown, fallback: Team = 'home'): Team {
  return value === 'home' || value === 'away' ? value : fallback;
}

const ROLES: ReadonlySet<string> = new Set(['C', 'LW', 'RW', 'D', 'G', 'F']);

function asRole(value: unknown): PlayerRole {
  return typeof value === 'string' && ROLES.has(value) ? (value as PlayerRole) : 'F';
}

function asPoint(value: unknown): Point | null {
  if (!isPlainObject(value)) return null;
  const x = value.x;
  const y = value.y;
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (typeof y !== 'number' || !Number.isFinite(y)) return null;
  return { x, y };
}

// ----------------------------------------------------------------------------
// parseDrillCandidate
// ----------------------------------------------------------------------------

export type CandidateParse =
  | { ok: true; candidate: Record<string, unknown> }
  | { ok: false; code: 'not-an-object'; message: string };

export function parseDrillCandidate(input: unknown): CandidateParse {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      code: 'not-an-object',
      message: `Expected a drill object, received ${Array.isArray(input) ? 'an array' : typeof input}.`,
    };
  }
  return { ok: true, candidate: input };
}

// ----------------------------------------------------------------------------
// normalizeDrillCandidate
// ----------------------------------------------------------------------------

export interface NormalizedDrill {
  /** A structurally complete drill. Domain references are not checked here. */
  drill: Drill;
  /** Human-readable notes about anything dropped or defaulted. */
  warnings: string[];
}

function normalizePlayer(value: unknown, index: number, warnings: string[]): Player | null {
  if (!isPlainObject(value)) {
    warnings.push(`Player ${index} was not an object and was dropped.`);
    return null;
  }
  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : null;
  if (!id) {
    warnings.push(`Player ${index} had no id and was dropped.`);
    return null;
  }
  const point = asPoint(value);
  if (!point) {
    warnings.push(`Player ${index} had non-finite coordinates and was dropped.`);
    return null;
  }
  const team = asTeam(value.team);
  const role = asRole(value.role);
  const visualSource = isPlainObject(value.visual) ? value.visual : null;

  return {
    id,
    x: point.x,
    y: point.y,
    team,
    number: asNonEmptyString(value.number, String(index + 1)).slice(0, 8),
    role,
    hasPuck: asBoolean(value.hasPuck, false),
    visual: {
      handedness: visualSource?.handedness === 'left' ? 'left' : 'right',
      visor: asBoolean(visualSource?.visor, role !== 'G'),
      ...(typeof visualSource?.jerseyTrim === 'string'
        ? { jerseyTrim: visualSource.jerseyTrim.slice(0, 64) }
        : {}),
    },
  };
}

function normalizeRoute(value: unknown, index: number, warnings: string[]): SkatePath | null {
  if (!isPlainObject(value)) {
    warnings.push(`Route ${index} was not an object and was dropped.`);
    return null;
  }
  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : null;
  const ownerId = typeof value.ownerId === 'string' && value.ownerId.length > 0 ? value.ownerId : null;
  if (!id || !ownerId) {
    warnings.push(`Route ${index} was missing an id or owner and was dropped.`);
    return null;
  }

  const rawPoints = asArray(value.points);
  if (rawPoints.length > IMPORT_LIMITS.maxPointsPerRoute) {
    warnings.push(
      `Route ${index} had ${rawPoints.length} points, above the ${IMPORT_LIMITS.maxPointsPerRoute} limit, and was dropped.`
    );
    return null;
  }
  const points = rawPoints.map(asPoint).filter((point): point is Point => point !== null);
  if (points.length !== rawPoints.length) {
    warnings.push(`Route ${index} had ${rawPoints.length - points.length} invalid point(s), which were dropped.`);
  }
  if (points.length < 1) {
    warnings.push(`Route ${index} had no usable points and was dropped.`);
    return null;
  }

  // Preserve any field a newer version of the app may have written.
  const { id: _id, ownerId: _owner, team: _team, points: _points, mode, finish, ...rest } = value;
  void _id;
  void _owner;
  void _team;
  void _points;

  return {
    ...rest,
    id,
    ownerId,
    team: asTeam(value.team),
    points,
    mode: mode === 'glide' || mode === 'backward' ? mode : 'skate',
    finish: finish === 'coast' ? 'coast' : 'stop',
  } as SkatePath;
}

const EVENT_TYPES: ReadonlySet<string> = new Set(['pass', 'shot', 'dump', 'pickup']);

function normalizeEvent(value: unknown, index: number, warnings: string[]): DrillEvent | null {
  if (!isPlainObject(value)) {
    warnings.push(`Event ${index} was not an object and was dropped.`);
    return null;
  }
  const type = value.type;
  if (typeof type !== 'string' || !EVENT_TYPES.has(type)) {
    warnings.push(`Event ${index} had unsupported type ${JSON.stringify(type)} and was dropped.`);
    return null;
  }
  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : null;
  const fromPlayerId =
    typeof value.fromPlayerId === 'string' && value.fromPlayerId.length > 0 ? value.fromPlayerId : null;
  if (!id || !fromPlayerId) {
    warnings.push(`Event ${index} was missing an id or source player and was dropped.`);
    return null;
  }
  const fromPoint = asPoint(value.fromPoint);
  const toPoint = asPoint(value.toPoint);
  if (!fromPoint || !toPoint) {
    warnings.push(`Event ${index} had non-finite endpoints and was dropped.`);
    return null;
  }

  const base = {
    id,
    fromPlayerId,
    fromPoint,
    toPoint,
    team: asTeam(value.team),
    ...(typeof value.at === 'number' && Number.isFinite(value.at) ? { at: value.at } : {}),
    ...(typeof value.arrivalAt === 'number' && Number.isFinite(value.arrivalAt)
      ? { arrivalAt: value.arrivalAt }
      : {}),
    ...(asPoint(value.via) ? { via: asPoint(value.via)! } : {}),
  };

  if (type === 'pass') {
    const toPlayerId =
      typeof value.toPlayerId === 'string' && value.toPlayerId.length > 0 ? value.toPlayerId : null;
    if (!toPlayerId) {
      warnings.push(`Pass ${index} had no receiver and was dropped.`);
      return null;
    }
    return {
      ...base,
      type: 'pass',
      toPlayerId,
      ...(value.catchResult === 'caught' || value.catchResult === 'missed'
        ? { catchResult: value.catchResult }
        : {}),
      ...(value.catchQuality === 'good' || value.catchQuality === 'assisted' || value.catchQuality === 'unreachable'
        ? { catchQuality: value.catchQuality }
        : {}),
    } as PassEvent;
  }

  if (type === 'shot') {
    const results = ['goal', 'save', 'rebound', 'wide', 'post'];
    return {
      ...base,
      type: 'shot',
      targetNet: value.targetNet === 'L' ? 'L' : 'R',
      ...(typeof value.result === 'string' && results.includes(value.result)
        ? { result: value.result as 'goal' | 'save' | 'rebound' | 'wide' | 'post' }
        : {}),
    } as DrillEvent;
  }

  if (type === 'dump') {
    return { ...base, type: 'dump', targetNet: 'dump' } as DrillEvent;
  }

  return { ...base, type: 'pickup' } as DrillEvent;
}

function normalizeCoach(value: unknown, index: number, warnings: string[]): CoachMarker | null {
  if (!isPlainObject(value)) {
    warnings.push(`Coach ${index} was not an object and was dropped.`);
    return null;
  }
  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : null;
  const point = asPoint(value);
  if (!id || !point) {
    warnings.push(`Coach ${index} was missing an id or had non-finite coordinates and was dropped.`);
    return null;
  }
  return {
    id,
    x: point.x,
    y: point.y,
    name: typeof value.name === 'string' ? value.name.slice(0, 80) : 'Coach',
  };
}

function normalizeSettings(value: unknown): DrillSettings {
  const source = isPlainObject(value) ? value : {};
  const assistance = source.assistance;
  const recovery = source.recovery;
  const jerseys = isPlainObject(source.jerseys) ? source.jerseys : null;

  const settings: DrillSettings = {
    assistance: assistance === 'off' || assistance === 'high' ? assistance : 'standard',
    recovery: recovery === 'authored' ? 'authored' : 'nearest-teammate',
    timeLimitSeconds: Math.min(600, Math.max(2, asFiniteNumber(source.timeLimitSeconds, 8))),
    reducedEffects: asBoolean(source.reducedEffects, false),
  };

  if (jerseys) {
    settings.jerseys = {
      home: asNonEmptyString(jerseys.home, DEFAULT_JERSEYS.home).slice(0, 32),
      away: asNonEmptyString(jerseys.away, DEFAULT_JERSEYS.away).slice(0, 32),
    };
  }

  return settings;
}

/**
 * Fill in every required field and drop anything unusable. The result is
 * always structurally complete; it may still have dangling references, which
 * is what `validateDrillDocument` and `repairDrillDocument` are for.
 *
 * `now` is injected so tests and migrations get deterministic timestamps.
 */
export function normalizeDrillCandidate(
  candidate: Record<string, unknown>,
  options: { now?: number; fallbackId?: ID; fallbackName?: string } = {}
): NormalizedDrill {
  const warnings: string[] = [];
  const now = options.now ?? Date.now();

  const rawPlayers = asArray(candidate.players);
  const rawRoutes = asArray(candidate.skatePaths);
  const rawEvents = asArray(candidate.events);
  const rawCoaches = asArray(candidate.coaches);

  if (!Array.isArray(candidate.players) && candidate.players != null) {
    warnings.push('players was not an array and was replaced with an empty list.');
  }
  if (!Array.isArray(candidate.events) && candidate.events != null) {
    warnings.push('events was not an array and was replaced with an empty list.');
  }
  if (!Array.isArray(candidate.skatePaths) && candidate.skatePaths != null) {
    warnings.push('skatePaths was not an array and was replaced with an empty list.');
  }

  const players = rawPlayers
    .slice(0, IMPORT_LIMITS.maxPlayersPerDrill)
    .map((value, index) => normalizePlayer(value, index, warnings))
    .filter((player): player is Player => player !== null);
  if (rawPlayers.length > IMPORT_LIMITS.maxPlayersPerDrill) {
    warnings.push(`Only the first ${IMPORT_LIMITS.maxPlayersPerDrill} players were kept.`);
  }

  const skatePaths = rawRoutes
    .slice(0, IMPORT_LIMITS.maxRoutesPerDrill)
    .map((value, index) => normalizeRoute(value, index, warnings))
    .filter((route): route is SkatePath => route !== null);
  if (rawRoutes.length > IMPORT_LIMITS.maxRoutesPerDrill) {
    warnings.push(`Only the first ${IMPORT_LIMITS.maxRoutesPerDrill} routes were kept.`);
  }

  const events = rawEvents
    .slice(0, IMPORT_LIMITS.maxEventsPerDrill)
    .map((value, index) => normalizeEvent(value, index, warnings))
    .filter((event): event is DrillEvent => event !== null);
  if (rawEvents.length > IMPORT_LIMITS.maxEventsPerDrill) {
    warnings.push(`Only the first ${IMPORT_LIMITS.maxEventsPerDrill} events were kept.`);
  }

  const coaches = rawCoaches
    .slice(0, IMPORT_LIMITS.maxCoachesPerDrill)
    .map((value, index) => normalizeCoach(value, index, warnings))
    .filter((coach): coach is CoachMarker => coach !== null);

  const createdAt = asFiniteNumber(candidate.createdAt, now);

  const drill: Drill = {
    schemaVersion: CURRENT_DRILL_SCHEMA_VERSION,
    id: asNonEmptyString(candidate.id, options.fallbackId ?? ''),
    name: asNonEmptyString(candidate.name, options.fallbackName ?? 'Untitled Drill').slice(
      0,
      IMPORT_LIMITS.maxNameLength
    ),
    createdAt,
    updatedAt: asFiniteNumber(candidate.updatedAt, createdAt),
    players,
    skatePaths,
    events,
    coaches,
    settings: normalizeSettings(candidate.settings),
  };

  return { drill, warnings };
}

// ----------------------------------------------------------------------------
// migrateDrillCandidate
// ----------------------------------------------------------------------------

/**
 * Bring a stored document up to the current schema version. Normalization
 * already applies every v1 -> v2 default (visual profiles, route mode/finish,
 * coaches, settings), so this is the single place a future v3 step would hook
 * in, and it stays total for any input.
 */
export function migrateDrillCandidate(
  input: unknown,
  options: { now?: number; fallbackId?: ID; fallbackName?: string } = {}
): NormalizedDrill {
  const parsed = parseDrillCandidate(input);
  if (!parsed.ok) {
    const { drill, warnings } = normalizeDrillCandidate({}, options);
    return { drill, warnings: [parsed.message, ...warnings] };
  }

  const version = parsed.candidate.schemaVersion;
  const warnings: string[] = [];
  if (typeof version === 'number' && version > CURRENT_DRILL_SCHEMA_VERSION) {
    warnings.push(
      `Document reports schema version ${version}, newer than this app's ${CURRENT_DRILL_SCHEMA_VERSION}. Unknown fields were preserved where possible.`
    );
  }

  const normalized = normalizeDrillCandidate(parsed.candidate, options);
  return { drill: normalized.drill, warnings: [...warnings, ...normalized.warnings] };
}

// ----------------------------------------------------------------------------
// validateDrillDocument
// ----------------------------------------------------------------------------

export interface DocumentValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Domain-level checks on a structurally complete drill. Safe to call on any
 * value: a non-drill simply reports every error.
 */
export function validateDrillDocument(drill: unknown): DocumentValidation {
  const errors: string[] = [];

  if (!isPlainObject(drill)) {
    return { valid: false, errors: ['Drill is not an object'] };
  }

  if (typeof drill.id !== 'string' || drill.id.length === 0) errors.push('Drill missing ID');
  if (typeof drill.name !== 'string' || drill.name.length === 0) errors.push('Drill missing name');
  if (!Array.isArray(drill.players)) errors.push('Drill missing players array');
  if (!Array.isArray(drill.skatePaths)) errors.push('Drill missing skatePaths array');
  if (!Array.isArray(drill.events)) errors.push('Drill missing events array');

  const players = asArray(drill.players).filter(isPlainObject);
  const events = asArray(drill.events).filter(isPlainObject);
  const routes = asArray(drill.skatePaths).filter(isPlainObject);

  // A drill with no players yet is a legitimate empty board, not an error.
  // Once anyone is on the ice, exactly one of them starts with the puck.
  const carriers = players.filter(player => player.hasPuck === true);
  if (players.length > 0 && carriers.length === 0) {
    errors.push('No initial puck carrier');
  } else if (carriers.length > 1) {
    errors.push('Multiple initial puck carriers');
  }

  const playerIds = new Set<unknown>(
    players.map(player => player.id).filter(id => typeof id === 'string')
  );
  if (playerIds.size !== players.length) {
    errors.push('Duplicate player IDs');
  }

  const seenEventIds = new Set<unknown>();
  events.forEach((event, index) => {
    if (seenEventIds.has(event.id)) errors.push(`Event ${index}: duplicate event ID`);
    seenEventIds.add(event.id);
    if (!playerIds.has(event.fromPlayerId)) {
      errors.push(`Event ${index}: fromPlayerId references non-existent player`);
    }
    if (event.type === 'pass' && !playerIds.has(event.toPlayerId)) {
      errors.push(`Event ${index}: toPlayerId references non-existent player`);
    }
  });

  const seenRouteIds = new Set<unknown>();
  routes.forEach((route, index) => {
    if (seenRouteIds.has(route.id)) errors.push(`SkatePath ${index}: duplicate route ID`);
    seenRouteIds.add(route.id);
    if (!playerIds.has(route.ownerId)) {
      errors.push(`SkatePath ${index}: ownerId references non-existent player`);
    }
  });

  return { valid: errors.length === 0, errors };
}

// ----------------------------------------------------------------------------
// repairDrillDocument
// ----------------------------------------------------------------------------

/**
 * Make a normalized drill valid with the smallest possible change: drop
 * dangling references, deduplicate IDs, and guarantee exactly one initial
 * puck carrier. Content is never invented beyond that.
 */
export function repairDrillDocument(drill: Drill, generateId: () => ID): Drill {
  const seenPlayerIds = new Set<ID>();
  const players = drill.players.filter(player => {
    if (seenPlayerIds.has(player.id)) return false;
    seenPlayerIds.add(player.id);
    return true;
  });

  const carriers = players.filter(player => player.hasPuck);
  let withCarrier = players;
  if (carriers.length === 0 && players.length > 0) {
    withCarrier = players.map((player, index) => ({ ...player, hasPuck: index === 0 }));
  } else if (carriers.length > 1) {
    let assigned = false;
    withCarrier = players.map(player => {
      if (!player.hasPuck) return player;
      if (assigned) return { ...player, hasPuck: false };
      assigned = true;
      return player;
    });
  }

  const playerIds = new Set(withCarrier.map(player => player.id));

  const seenRouteIds = new Set<ID>();
  const skatePaths = drill.skatePaths
    .filter(route => playerIds.has(route.ownerId))
    .map(route => {
      if (!seenRouteIds.has(route.id)) {
        seenRouteIds.add(route.id);
        return route;
      }
      const fresh = { ...route, id: generateId() };
      seenRouteIds.add(fresh.id);
      return fresh;
    });

  const seenEventIds = new Set<ID>();
  const events = drill.events
    .filter(event => {
      if (!playerIds.has(event.fromPlayerId)) return false;
      if (event.type === 'pass' && !playerIds.has(event.toPlayerId)) return false;
      return true;
    })
    .map(event => {
      if (!seenEventIds.has(event.id)) {
        seenEventIds.add(event.id);
        return event;
      }
      const fresh = { ...event, id: generateId() };
      seenEventIds.add(fresh.id);
      return fresh;
    });

  return {
    ...drill,
    schemaVersion: CURRENT_DRILL_SCHEMA_VERSION,
    players: withCarrier,
    skatePaths,
    events,
    coaches: drill.coaches ?? [],
  };
}

// ----------------------------------------------------------------------------
// remapImportedDrill
// ----------------------------------------------------------------------------

/**
 * Give an imported drill a completely fresh identity. Every internal reference
 * is rewritten through explicit maps so an import can never collide with, or
 * quietly alias, a local drill.
 */
export function remapImportedDrill(
  drill: Drill,
  generateId: () => ID,
  now: number = Date.now()
): Drill {
  const playerIds = new Map<ID, ID>();
  const coachIds = new Map<ID, ID>();

  const players = drill.players.map(player => {
    const id = generateId();
    playerIds.set(player.id, id);
    return { ...player, id };
  });

  const coaches = (drill.coaches ?? []).map(coach => {
    const id = generateId();
    coachIds.set(coach.id, id);
    return { ...coach, id };
  });

  const skatePaths = drill.skatePaths
    .filter(route => playerIds.has(route.ownerId))
    .map(route => ({
      ...route,
      id: generateId(),
      ownerId: playerIds.get(route.ownerId)!,
      points: route.points.map(point => ({ ...point })),
    }));

  const events = drill.events
    .filter(event => {
      if (!playerIds.has(event.fromPlayerId)) return false;
      if (event.type === 'pass' && !playerIds.has(event.toPlayerId)) return false;
      return true;
    })
    .map(event => {
      const remapped = {
        ...event,
        id: generateId(),
        fromPlayerId: playerIds.get(event.fromPlayerId)!,
        fromPoint: { ...event.fromPoint },
        toPoint: { ...event.toPoint },
        ...(event.via ? { via: { ...event.via } } : {}),
      } as DrillEvent;

      if (remapped.type === 'pass' && event.type === 'pass') {
        remapped.toPlayerId = playerIds.get(event.toPlayerId)!;
      }
      return remapped;
    });

  return {
    ...drill,
    schemaVersion: CURRENT_DRILL_SCHEMA_VERSION,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    players,
    coaches,
    skatePaths,
    events,
    settings: structuredClone(drill.settings ?? normalizeSettings(undefined)),
  };
}
