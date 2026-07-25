// ============================================================================
// TEST BUILDERS - deterministic drill fixtures
//
// Everything here is explicit and stable: fixed IDs, fixed timestamps, fixed
// coordinates. Tests that need randomness generate it themselves.
// ============================================================================

import type {
  CoachMarker,
  Drill,
  DrillEvent,
  DrillSettings,
  PassEvent,
  Player,
  PlayerRole,
  ShotEvent,
  SkatePath,
  Team,
} from '@/core/types';
import { RINK } from '@/core/constants';

/** A fixed instant, so `createdAt`/`updatedAt` never vary between runs. */
export const FIXED_NOW = 1_700_000_000_000;

export function buildPlayer(overrides: Partial<Player> & { id: string }): Player {
  return {
    x: RINK.centerX,
    y: RINK.centerY,
    team: 'home',
    number: '11',
    role: 'C' as PlayerRole,
    hasPuck: false,
    visual: { handedness: 'right', visor: true },
    ...overrides,
  };
}

export function buildRoute(overrides: Partial<SkatePath> & { id: string; ownerId: string }): SkatePath {
  return {
    team: 'home',
    points: [
      { x: RINK.centerX, y: RINK.centerY },
      { x: RINK.centerX + 100, y: RINK.centerY },
      { x: RINK.centerX + 200, y: RINK.centerY - 40 },
    ],
    mode: 'skate',
    finish: 'stop',
    ...overrides,
  };
}

export function buildPass(overrides: Partial<PassEvent> & { id: string; fromPlayerId: string; toPlayerId: string }): PassEvent {
  return {
    type: 'pass',
    fromPoint: { x: RINK.centerX, y: RINK.centerY },
    toPoint: { x: RINK.centerX + 120, y: RINK.centerY },
    team: 'home',
    at: 0.2,
    arrivalAt: 0.35,
    ...overrides,
  };
}

export function buildShot(overrides: Partial<ShotEvent> & { id: string; fromPlayerId: string }): ShotEvent {
  return {
    type: 'shot',
    fromPoint: { x: RINK.centerX + 120, y: RINK.centerY },
    toPoint: { x: RINK.netRightX, y: RINK.netRightY },
    targetNet: 'R',
    team: 'home',
    at: 0.6,
    arrivalAt: 0.75,
    ...overrides,
  };
}

export function buildCoach(overrides: Partial<CoachMarker> & { id: string }): CoachMarker {
  return { x: RINK.centerX, y: RINK.y + 40, name: 'Coach', ...overrides };
}

export function buildSettings(overrides: Partial<DrillSettings> = {}): DrillSettings {
  return {
    assistance: 'standard',
    recovery: 'nearest-teammate',
    timeLimitSeconds: 8,
    reducedEffects: false,
    ...overrides,
  };
}

export interface BuildDrillOptions {
  id?: string;
  name?: string;
  players?: Player[];
  skatePaths?: SkatePath[];
  events?: DrillEvent[];
  coaches?: CoachMarker[];
  settings?: DrillSettings;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * A minimal but valid drill: two home skaters, the first carrying the puck.
 */
export function buildDrill(options: BuildDrillOptions = {}): Drill {
  const players = options.players ?? [
    buildPlayer({ id: 'p1', number: '11', hasPuck: true }),
    buildPlayer({ id: 'p2', number: '13', x: RINK.centerX + 160, y: RINK.centerY - 60 }),
  ];

  return {
    schemaVersion: 2,
    id: options.id ?? 'drill-1',
    name: options.name ?? 'Test Drill',
    createdAt: options.createdAt ?? FIXED_NOW,
    updatedAt: options.updatedAt ?? FIXED_NOW,
    players,
    skatePaths: options.skatePaths ?? [],
    events: options.events ?? [],
    coaches: options.coaches ?? [],
    settings: options.settings ?? buildSettings(),
  };
}

/** A drill with one player per team, both able to be pass endpoints. */
export function buildTwoTeamDrill(): Drill {
  return buildDrill({
    players: [
      buildPlayer({ id: 'home-1', team: 'home', number: '11', hasPuck: true }),
      buildPlayer({ id: 'home-2', team: 'home', number: '13', x: RINK.centerX + 160 }),
      buildPlayer({ id: 'away-1', team: 'away', number: '87', x: RINK.centerX - 160 }),
    ],
  });
}

/** A route with every semantic field set to a non-default value. */
export function buildDistinctiveRoute(ownerId: string): SkatePath {
  return buildRoute({
    id: 'route-distinct',
    ownerId,
    team: 'away',
    mode: 'backward',
    finish: 'coast',
    points: [
      { x: 100, y: 100 },
      { x: 180, y: 140 },
      { x: 260, y: 90 },
      { x: 340, y: 210 },
    ],
  });
}

/** Deterministic ID generator for tests that need one. */
export function sequentialIds(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** Type helper so a fixture can be handed to a function typed as `Team`. */
export const TEAMS: readonly Team[] = ['home', 'away'];
