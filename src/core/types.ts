// ============================================================================
// CORE TYPES - Hockey Drill Designer Data Model
// ============================================================================

// Unique identifier type
export type ID = string;

// Team designation
export type Team = 'home' | 'away';

// Player role/position
export type PlayerRole = 'C' | 'LW' | 'RW' | 'D' | 'G' | 'F';

// Tool selection for editor
export type Tool =
  | 'select'
  | 'skate'
  | 'pass'
  | 'shoot'
  | 'home'
  | 'away'
  | 'goalie'
  | 'erase';

// Net designation
export type NetSide = 'L' | 'R';

// Event types for drill sequence
export type EventType = 'pass' | 'shot' | 'dump';

// ============================================================================
// GEOMETRY TYPES
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// PLAYER
// ============================================================================

export interface Player {
  id: ID;
  x: number;
  y: number;
  team: Team;
  number: string;
  role: PlayerRole;
  hasPuck: boolean; // Initial puck carrier flag (before any events)
}

// ============================================================================
// SKATE PATH
// ============================================================================

export interface SkatePath {
  id: ID;
  ownerId: ID; // Player who owns this path
  team: Team;
  points: Point[];
}

// ============================================================================
// DRILL EVENTS
// ============================================================================

// Base event interface
interface BaseEvent {
  id: ID;
  type: EventType;
  fromPlayerId: ID;
  fromPoint: Point; // World position where action originates
  toPoint: Point;   // World position where action ends
  team: Team;
}

// Pass event - puck goes from one player to another
export interface PassEvent extends BaseEvent {
  type: 'pass';
  toPlayerId: ID;
}

// Shot event - puck goes toward a net
export interface ShotEvent extends BaseEvent {
  type: 'shot';
  targetNet: NetSide;
}

// Dump event - puck dumped into zone (variation of shot, but not terminal)
export interface DumpEvent extends BaseEvent {
  type: 'dump';
  targetNet: 'dump'; // Special marker
}

// Union type for all events
export type DrillEvent = PassEvent | ShotEvent | DumpEvent;

// ============================================================================
// PUCK CHAIN - Derived state showing sequence of puck possession
// ============================================================================

export interface PuckChainNode {
  player: Player | null;
  action: EventType | null; // How puck got to this player
  eventIndex: number | null; // Index of the event that caused this
}

// ============================================================================
// DRILL
// ============================================================================

export interface Drill {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  players: Player[];
  skatePaths: SkatePath[];
  events: DrillEvent[];
}

// ============================================================================
// CAMERA / VIEWPORT
// ============================================================================

export interface Camera {
  x: number;      // Translation X
  y: number;      // Translation Y
  zoom: number;   // Scale factor
}

// ============================================================================
// PLAYBACK STATE
// ============================================================================

export interface PlaybackState {
  isPlaying: boolean;
  progress: number;     // 0 to 1
  speed: number;        // Multiplier (0.5, 1, 2)
  duration: number;     // Total duration in seconds
  firedEvents: number[]; // Indices of events that have fired
}

// ============================================================================
// ANIMATION STATE
// ============================================================================

export interface AnimatedPuck {
  x: number;
  y: number;
  visible: boolean;
}

export interface GhostTrail {
  playerId: ID;
  points: Point[];
}

// ============================================================================
// SELECTION STATE
// ============================================================================

export interface SelectionState {
  selectedPlayerId: ID | null;
  passFromPlayerId: ID | null; // For two-tap pass mode
}

// ============================================================================
// INTERACTION STATE
// ============================================================================

export type DragType = 'none' | 'pass' | 'shoot' | 'move' | 'skate' | 'node';

export interface InteractionState {
  isPointerDown: boolean;
  pointerMoved: boolean;
  pointerDownPosition: Point | null;
  dragType: DragType;
  dragFromPlayer: Player | null;
  dragCurrentPosition: Point | null;
  holdActive: boolean;
  holdTarget: Player | null;
  movingPlayer: Player | null;
  drawingSkate: boolean;
  skateOwner: Player | null;
  skateRawPoints: Point[];
  // Node drag (tap on path to create pass)
  nodeActive: boolean;
  nodePath: SkatePath | null;
  nodeWorldPoint: Point | null;
  nodeDragPosition: Point | null;
  // Pinch zoom
  pinchState: PinchState | null;
}

export interface PinchState {
  initialDistance: number;
  initialMidpoint: Point;
  initialCameraX: number;
  initialCameraY: number;
  initialCameraZoom: number;
}

// ============================================================================
// UI STATE
// ============================================================================

export interface Toast {
  id: ID;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration: number;
}

export interface UIState {
  currentTool: Tool;
  showMenu: boolean;
  showContextMenu: boolean;
  contextMenuPosition: Point | null;
  contextMenuPlayerId: ID | null;
  showRenameModal: boolean;
  showPlayerInfo: boolean;
  toasts: Toast[];
  modeBanner: string | null;
  playBanner: string | null;
}

// ============================================================================
// UNDO STATE
// ============================================================================

export interface UndoSnapshot {
  players: Player[];
  skatePaths: SkatePath[];
  events: DrillEvent[];
}

// ============================================================================
// APPLICATION STATE
// ============================================================================

export interface AppState {
  // Drill data
  drill: Drill;

  // Camera
  camera: Camera;

  // Canvas dimensions
  canvasWidth: number;
  canvasHeight: number;

  // Selection
  selection: SelectionState;

  // Interaction
  interaction: InteractionState;

  // Playback
  playback: PlaybackState;

  // Animation
  animatedPuck: AnimatedPuck | null;
  ghostTrails: Map<ID, Point[]>;

  // Player start positions (for playback reset)
  startSnapshot: { id: ID; x: number; y: number; hasPuck: boolean }[];

  // UI
  ui: UIState;

  // Undo
  undoStack: UndoSnapshot[];

  // Drill list (for management)
  drillList: { id: ID; name: string; updatedAt: number }[];
  currentDrillId: ID | null;
}

// ============================================================================
// RINK CONSTANTS
// ============================================================================

export interface RinkDimensions {
  width: number;
  height: number;
  x: number;
  y: number;
  cornerRadius: number;
  blueLineOffset: number; // Distance from center as fraction of width
  goalLineOffset: number; // Distance from edge as fraction of width
  netLeftX: number;
  netLeftY: number;
  netRightX: number;
  netRightY: number;
}

// ============================================================================
// ACTION TYPES
// ============================================================================

export type AppAction =
  // Drill management
  | { type: 'NEW_DRILL' }
  | { type: 'LOAD_DRILL'; drill: Drill }
  | { type: 'RENAME_DRILL'; name: string }
  | { type: 'DELETE_DRILL'; id: ID }
  | { type: 'SET_DRILL_LIST'; drills: { id: ID; name: string; updatedAt: number }[] }

  // Player actions
  | { type: 'ADD_PLAYER'; player: Player }
  | { type: 'REMOVE_PLAYER'; id: ID }
  | { type: 'MOVE_PLAYER'; id: ID; x: number; y: number }
  | { type: 'SET_PUCK_CARRIER'; id: ID }

  // Path actions
  | { type: 'ADD_SKATE_PATH'; path: SkatePath }
  | { type: 'REMOVE_SKATE_PATH'; id: ID }

  // Event actions
  | { type: 'ADD_PASS'; event: PassEvent }
  | { type: 'ADD_SHOT'; event: ShotEvent }
  | { type: 'ADD_DUMP'; event: DumpEvent }
  | { type: 'REMOVE_EVENT'; id: ID }
  | { type: 'CLEAR_ALL_EVENTS' }

  // Camera
  | { type: 'SET_CAMERA'; camera: Camera }
  | { type: 'FIT_CAMERA' }
  | { type: 'ZOOM_TO_ZONE'; zone: 'full' | 'offensive' | 'defensive' }

  // Canvas
  | { type: 'SET_CANVAS_SIZE'; width: number; height: number }

  // Selection
  | { type: 'SELECT_PLAYER'; id: ID | null }
  | { type: 'SET_PASS_FROM'; id: ID | null }

  // Interaction
  | { type: 'SET_INTERACTION'; interaction: Partial<InteractionState> }
  | { type: 'RESET_INTERACTION' }

  // Playback
  | { type: 'START_PLAYBACK' }
  | { type: 'STOP_PLAYBACK' }
  | { type: 'SET_PLAYBACK_PROGRESS'; progress: number }
  | { type: 'SET_PLAYBACK_SPEED'; speed: number }
  | { type: 'FIRE_EVENT'; index: number }
  | { type: 'RESET_PLAYBACK' }

  // Animation
  | { type: 'SET_ANIMATED_PUCK'; puck: AnimatedPuck | null }
  | { type: 'UPDATE_GHOST_TRAIL'; playerId: ID; point: Point }
  | { type: 'CLEAR_GHOST_TRAILS' }

  // Snapshot
  | { type: 'SAVE_START_SNAPSHOT' }
  | { type: 'RESTORE_START_SNAPSHOT' }

  // UI
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'TOGGLE_MENU' }
  | { type: 'CLOSE_MENU' }
  | { type: 'SHOW_CONTEXT_MENU'; position: Point; playerId: ID }
  | { type: 'HIDE_CONTEXT_MENU' }
  | { type: 'SHOW_RENAME_MODAL' }
  | { type: 'HIDE_RENAME_MODAL' }
  | { type: 'SHOW_PLAYER_INFO' }
  | { type: 'HIDE_PLAYER_INFO' }
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'REMOVE_TOAST'; id: ID }
  | { type: 'SET_MODE_BANNER'; message: string | null }
  | { type: 'SET_PLAY_BANNER'; message: string | null }
  | { type: 'CLEAR_BANNERS' }

  // Undo
  | { type: 'PUSH_UNDO' }
  | { type: 'POP_UNDO' }
  | { type: 'CLEAR_UNDO' };
