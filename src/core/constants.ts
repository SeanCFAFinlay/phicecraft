// ============================================================================
// CONSTANTS - Fixed values for the hockey drill designer
// ============================================================================

import type { RinkDimensions, Camera, PlaybackState, InteractionState, UIState, SelectionState } from './types';

// ============================================================================
// RINK DIMENSIONS (in world units)
// ============================================================================

export const RINK: RinkDimensions = {
  width: 1000,
  height: 500,
  x: 0,
  y: 0,
  cornerRadius: 85, // 17% of height
  blueLineOffset: 0.25, // 25% from center
  goalLineOffset: 0.055, // 5.5% from edge
  // Net positions
  netLeftX: 19, // 1.9% of width
  netLeftY: 250, // Center
  netRightX: 981, // 98.1% of width
  netRightY: 250, // Center
};

// Net objects for easy reference
export const NET_LEFT = { x: RINK.netLeftX, y: RINK.netLeftY };
export const NET_RIGHT = { x: RINK.netRightX, y: RINK.netRightY };

// ============================================================================
// PLAYER DIMENSIONS
// ============================================================================

export const PLAYER_RADIUS = RINK.height * 0.044; // ~22 world units
export const PLAYER_HIT_RADIUS = PLAYER_RADIUS * 1.6; // Larger for touch
export const GOALIE_RING_OFFSET = 5.5;

// ============================================================================
// INTERACTION THRESHOLDS
// ============================================================================

export const MOVE_THRESHOLD = 9; // Pixels before considered a drag
export const HOLD_DURATION = 720; // ms for hold-to-move
export const PATH_HIT_DISTANCE = 22; // Screen pixels

// ============================================================================
// PLAYBACK
// ============================================================================

export const DEFAULT_DRILL_DURATION = 8; // seconds
export const PLAYBACK_SPEEDS = [0.5, 1, 2];
export const GHOST_TRAIL_MAX_LENGTH = 55;

// ============================================================================
// UNDO
// ============================================================================

export const MAX_UNDO_STACK = 40;

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

  // Rink
  ice: {
    light: '#d8eef8',
    mid: '#c6dff0',
    dark: '#b5d0e4',
  },
  redLine: 'rgba(190, 12, 12, 0.68)',
  blueLine: 'rgba(8, 42, 165, 0.72)',
  crease: {
    fill: 'rgba(12, 55, 195, 0.08)',
    stroke: 'rgba(12, 55, 195, 0.38)',
  },

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
};

export const DEFAULT_UI: UIState = {
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
  pass: 'Tap the puck carrier, then tap who receives the pass',
  shoot: 'Drag from the puck carrier toward a net',
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
