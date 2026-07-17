// ============================================================================
// CONSTANTS - Fixed values for the hockey drill designer
// ============================================================================

import type { RinkDimensions, Camera, PlaybackState, InteractionState, UIState, SelectionState } from './types';

// ============================================================================
// RINK DIMENSIONS
//
// The rink is modelled at true NHL scale: one foot of real ice = FT world
// units, so every measurement below can be read straight off the rulebook.
// The official sheet is 200 ft x 85 ft with a 28 ft corner radius.
// ============================================================================

/** World units per foot of real ice */
export const FT = 5;

const LENGTH_FT = 200;
const WIDTH_FT = 85;

export const RINK: RinkDimensions = {
  x: 0,
  y: 0,
  width: LENGTH_FT * FT, // 1000
  height: WIDTH_FT * FT, // 425
  centerX: (LENGTH_FT / 2) * FT, // 500
  centerY: (WIDTH_FT / 2) * FT, // 212.5
  cornerRadius: 28 * FT,

  // Goal lines sit 11 ft from the end boards.
  goalLineLeftX: 11 * FT,
  goalLineRightX: (LENGTH_FT - 11) * FT,

  // Blue lines are 25 ft either side of centre (a 50 ft neutral zone).
  blueLineLeftX: (LENGTH_FT / 2 - 25) * FT,
  blueLineRightX: (LENGTH_FT / 2 + 25) * FT,

  // Shots are aimed at the centre of the goal mouth, on the goal line.
  netLeftX: 11 * FT,
  netLeftY: (WIDTH_FT / 2) * FT,
  netRightX: (LENGTH_FT - 11) * FT,
  netRightY: (WIDTH_FT / 2) * FT,
};

// Net objects for easy reference
export const NET_LEFT = { x: RINK.netLeftX, y: RINK.netLeftY };
export const NET_RIGHT = { x: RINK.netRightX, y: RINK.netRightY };

// Centre line - the x that divides the two halves of the rink
export const RINK_CENTER_X = RINK.centerX;

/**
 * Every other rink marking, straight from the NHL rulebook.
 */
export const RINK_MARKS = {
  /** Blue lines and the centre line are 12 in wide */
  lineWidthMajor: 1 * FT,
  /** Goal lines, circles and creases are 2 in wide */
  lineWidthMinor: (2 / 12) * FT,

  /** All faceoff circles - centre and end zone - are 30 ft across */
  faceoffCircleRadius: 15 * FT,
  /** End zone and neutral zone spots are 2 ft across */
  faceoffSpotRadius: 1 * FT,
  /** The centre spot is smaller, at 12 in */
  centerSpotRadius: 0.5 * FT,

  /** End zone faceoff spots: 20 ft out from the goal line... */
  endZoneSpotFromGoalLine: 20 * FT,
  /** ...and 22 ft either side of the rink's long axis */
  spotOffsetFromCenterY: 22 * FT,
  /** Neutral zone spots sit 5 ft off the blue line */
  neutralSpotFromBlueLine: 5 * FT,

  /** Circle hash marks: 2 ft long, 5 ft 7 in apart */
  hashLength: 2 * FT,
  hashSeparation: (5 + 7 / 12) * FT,

  /** The L-shaped alignment marks inside each faceoff circle */
  markLongArm: 4 * FT,
  markShortArm: 3 * FT,
  markGapX: 2 * FT,

  /** Goal crease: a 6 ft radius arc, 8 ft wide at the goal line */
  creaseRadius: 6 * FT,
  creaseHalfWidth: 4 * FT,

  /** The goal itself is 6 ft wide and 4 ft deep */
  goalHalfWidth: 3 * FT,
  goalDepth: 4 * FT,

  /** Trapezoid: 22 ft across at the goal line, 28 ft at the end boards */
  trapezoidGoalLineHalfWidth: 11 * FT,
  trapezoidBoardsHalfWidth: 14 * FT,

  /** The referee's crease is a 10 ft semicircle at centre ice */
  refereeCreaseRadius: 10 * FT,
};

// ============================================================================
// PLAYER DIMENSIONS
// ============================================================================

// Deliberately larger than a real player: these are diagram tokens that have to
// stay legible with a number inside them.
export const PLAYER_RADIUS = 3.6 * FT; // 18 world units
export const PLAYER_HIT_RADIUS = PLAYER_RADIUS * 1.6; // Larger for touch
export const GOALIE_RING_OFFSET = 5.5;
export const ROUTE_HANDLE_OFFSET = 38;
export const ROUTE_HANDLE_RADIUS = 13;

// ============================================================================
// INTERACTION THRESHOLDS
// ============================================================================

export const MOVE_THRESHOLD = 9; // Pixels before considered a drag
export const HOLD_DURATION = 720; // ms for hold-to-move
export const PATH_HIT_DISTANCE = 22; // Screen pixels

// ============================================================================
// CAMERA
// ============================================================================

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
export const WHEEL_ZOOM_SENSITIVITY = 0.0015;
export const FIT_PADDING = 16; // Screen pixels of margin around the rink

// ============================================================================
// PLAYBACK
// ============================================================================

export const DEFAULT_DRILL_DURATION = 8; // seconds
export const PLAYBACK_SPEEDS = [0.5, 1, 2];
export const GHOST_TRAIL_MAX_LENGTH = 55;

/** Deterministic mechanics configuration. Distances are converted to world units. */
export const SIMULATION = {
  fixedStepSeconds: 1 / 120,
  maxForwardSpeed: 22 * FT,
  maxBackwardSpeed: 13 * FT,
  acceleration: 14 * FT,
  braking: 19 * FT,
  puckFriction: 17 * FT,
  boardRestitution: 0.72,
  boardTangentialFriction: 0.08,
  passSpeed: 55 * FT,
  shotSpeed: 78 * FT,
  catchRadius: 3.25 * FT,
  pickupRadius: 3.75 * FT,
  catchSpeed: 70 * FT,
  puckRadius: 0.5 * FT,
} as const;

// Fraction of an event's timeline slot the puck spends in flight. Below 1 so
// the puck lands on the receiver before the next event fires.
export const PUCK_FLIGHT_FRACTION = 0.45;

// ============================================================================
// UNDO
// ============================================================================

export const MAX_UNDO_STACK = 40;

// ============================================================================
// PERSISTENCE
// ============================================================================

export const AUTOSAVE_DELAY = 1000; // ms of idle before writing to localStorage

// ============================================================================
// PATH SMOOTHING
// ============================================================================

export const PATH_DECIMATE_TARGET = 50; // Max points after decimation
export const PATH_CHAIKIN_ITERATIONS = 2; // Smoothing passes

// ============================================================================
// COLORS
// ============================================================================

export const COLORS = {
  // App
  background: '#06101a',
  surface: '#0c1d2d',
  border: 'rgba(0, 185, 230, 0.16)',
  text: '#daf0f8',
  dim: 'rgba(150, 210, 230, 0.42)',

  // Accent
  cyan: '#00c8f0',
  cyanDark: '#007fa8',
  gold: '#ffd60a',
  red: '#e63946',
  blue: '#3a86ff',
  green: '#00e676',
  orange: '#ff6b0f',

  // Teams
  home: {
    primary: '#e63946',
    light: '#ff8090',
    dark: '#bc1f2a',
    fill: 'rgba(215, 48, 58, 0.82)',
    bg: 'rgba(230, 57, 70, 0.25)',
  },
  away: {
    primary: '#3a86ff',
    light: '#70b6ec',
    dark: '#16469e',
    fill: 'rgba(48, 128, 255, 0.82)',
    bg: 'rgba(58, 134, 255, 0.25)',
  },

  // Rink. Ice is near-white with a faint blue cast, as it reads on TV.
  ice: {
    light: '#ffffff',
    mid: '#f4f9fd',
    dark: '#e8f1f9',
  },
  // Official NHL line colours
  redLine: '#c8102e',
  blueLine: '#0033a0',
  crease: {
    fill: 'rgba(120, 190, 235, 0.45)',
    stroke: '#c8102e',
  },
  boards: '#1e293b',
  goalPost: '#c8102e',
  goalMesh: 'rgba(255, 255, 255, 0.55)',

  // Paths
  pass: {
    home: 'rgba(255, 210, 10, 0.95)',
    away: 'rgba(110, 215, 255, 0.95)',
  },
  shot: 'rgba(255, 107, 15, 0.95)',

  // Puck
  puck: {
    fill: '#111',
    stroke: 'rgba(255, 255, 255, 0.4)',
  },
};

// ============================================================================
// DEFAULT STATES
// ============================================================================

export const DEFAULT_CAMERA: Camera = {
  x: 0,
  y: 0,
  zoom: 1,
};

export const DEFAULT_PLAYBACK: PlaybackState = {
  isPlaying: false,
  progress: 0,
  speed: 1,
  duration: DEFAULT_DRILL_DURATION,
  firedEvents: [],
  lifecycle: 'ready',
};

export const DEFAULT_INTERACTION: InteractionState = {
  isPointerDown: false,
  pointerMoved: false,
  pointerDownPosition: null,
  dragType: 'none',
  dragFromPlayer: null,
  dragCurrentPosition: null,
  holdActive: false,
  holdTarget: null,
  movingPlayer: null,
  drawingSkate: false,
  skateOwner: null,
  skateRawPoints: [],
  nodeActive: false,
  nodePath: null,
  nodeWorldPoint: null,
  nodeDragPosition: null,
  pinchState: null,
};

export const DEFAULT_SELECTION: SelectionState = {
  selectedPlayerId: null,
  passFromPlayerId: null,
  selectedEventId: null,
};

export const DEFAULT_UI: UIState = {
  editorStep: 'setup',
  currentTool: 'select',
  showMenu: false,
  showContextMenu: false,
  contextMenuPosition: null,
  contextMenuPlayerId: null,
  showRenameModal: false,
  showPlayerInfo: false,
  toasts: [],
  modeBanner: null,
  playBanner: null,
  showDiagnostics: false,
};

// ============================================================================
// PLAYER ROLES
// ============================================================================

export const ROLE_NAMES: Record<string, string> = {
  C: 'Center',
  LW: 'Left Wing',
  RW: 'Right Wing',
  D: 'Defenseman',
  G: 'Goalie',
  F: 'Forward',
};

// ============================================================================
// TOOL HINTS
// ============================================================================

export const TOOL_HINTS: Record<string, string> = {
  select: 'Tap player for actions - drag player = skate path - tap path = pass',
  skate: 'Drag from any player to draw their skate route',
  pass: 'Drag from the puck carrier or any point on their route to a teammate or open ice',
  shoot: 'Drag toward the net — the shot starts at the carrier’s final route position',
  home: 'Tap empty ice to place a Home player',
  away: 'Tap empty ice to place an Away player',
  goalie: 'Tap to place a Goalie',
  erase: 'Tap a player or path to remove it',
};

// ============================================================================
// STORAGE KEYS
// ============================================================================

export const STORAGE_KEYS = {
  DRILLS: 'phicecraft_drills',
  CURRENT_DRILL: 'phicecraft_current_drill',
  SETTINGS: 'phicecraft_settings',
};
