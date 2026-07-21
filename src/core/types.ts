// ============================================================================
// CORE TYPES - Hockey Drill Designer Data Model
// ============================================================================

// Unique identifier type
export type ID = string;

// Team designation
export type Team = 'home' | 'away';

// Player role/position
export type PlayerRole = 'C' | 'LW' | 'RW' | 'D' | 'G' | 'F';

export type Handedness = 'left' | 'right';

export interface PlayerVisualProfile {
  handedness: Handedness;
  visor: boolean;
  jerseyTrim?: string;
}

// Tool selection for editor
export type Tool =
  | 'select'
  | 'skate'
  | 'pass'
  | 'shoot'
  | 'home'
  | 'away'
  | 'goalie'
  | 'coach'
  | 'erase';

// Net designation
export type NetSide = 'L' | 'R';

// Event types for drill sequence
export type EventType = 'pass' | 'shot' | 'dump' | 'pickup';

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
  /** Optional per-player presentation and stick-side preferences. */
  visual?: PlayerVisualProfile;
}

// ============================================================================
// COACH
//
// A non-playing figure placed on the ice (the big bearded coach). It is never a
// puck carrier, pass target, or simulated skater - purely a marker the drill
// author can reposition.
// ============================================================================

export interface CoachMarker {
  id: ID;
  x: number;
  y: number;
  name?: string;
}

// ============================================================================
// SKATE PATH
// ============================================================================

export interface SkatePath {
  id: ID;
  ownerId: ID; // Player who owns this path
  team: Team;
  points: Point[];
  /** Optional authored route behaviour. Legacy paths default to a forward skate. */
  mode?: 'skate' | 'glide' | 'backward';
  finish?: 'coast' | 'stop';
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
  /** Normalized drill time when the puck leaves the carrier. */
  at?: number;
  /** Normalized drill time when the puck reaches its destination. */
  arrivalAt?: number;
  /**
   * Optional control point the puck curves through. Set when the author drags
   * a puck line's midpoint handle to bend its path; absent = straight line.
   */
  via?: Point;
}

// Pass event - puck goes from one player to another
export interface PassEvent extends BaseEvent {
  type: 'pass';
  toPlayerId: ID;
  catchResult?: 'caught' | 'missed';
  catchQuality?: 'good' | 'assisted' | 'unreachable';
}

// Shot event - puck goes toward a net
export interface ShotEvent extends BaseEvent {
  type: 'shot';
  targetNet: NetSide;
  result?: 'goal' | 'save' | 'rebound' | 'wide' | 'post';
}

// Dump event - puck dumped into zone (variation of shot, but not terminal)
export interface DumpEvent extends BaseEvent {
  type: 'dump';
  targetNet: 'dump'; // Special marker
}

export interface PickupEvent extends BaseEvent {
  type: 'pickup';
}

// Union type for all events
export type DrillEvent = PassEvent | ShotEvent | DumpEvent | PickupEvent;

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
  /** Missing means legacy v1 and is migrated on load. */
  schemaVersion?: 2;
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  players: Player[];
  skatePaths: SkatePath[];
  events: DrillEvent[];
  /** Non-playing coach markers. Optional for backward compatibility. */
  coaches?: CoachMarker[];
  settings?: DrillSettings;
}

export interface DrillSettings {
  assistance: 'off' | 'standard' | 'high';
  recovery: 'authored' | 'nearest-teammate';
  timeLimitSeconds: number;
  reducedEffects: boolean;
  /** Base jersey colours per team (hex). Absent = the classic red/blue. */
  jerseys?: { home: string; away: string };
}

/** Selectable jersey colours, shown in the jersey switcher. */
export const JERSEY_COLORS: { name: string; hex: string }[] = [
  { name: 'Red', hex: '#e63946' },
  { name: 'Blue', hex: '#2f80ed' },
  { name: 'Green', hex: '#129d5a' },
  { name: 'Black', hex: '#2b2f36' },
  { name: 'Gold', hex: '#e6a817' },
  { name: 'Purple', hex: '#7b46c9' },
  { name: 'Teal', hex: '#0fb5b0' },
  { name: 'Orange', hex: '#ef7d1a' },
  { name: 'White', hex: '#e8edf2' },
];

export const DEFAULT_JERSEYS = { home: '#e63946', away: '#2f80ed' };

/** The base jersey colour for a team, honouring any per-drill override. */
export function jerseyColor(team: Team, settings?: DrillSettings): string {
  const j = settings?.jerseys;
  return team === 'home'
    ? j?.home ?? DEFAULT_JERSEYS.home
    : j?.away ?? DEFAULT_JERSEYS.away;
}

// ============================================================================
// CAMERA / VIEWPORT
// ============================================================================

export interface Camera {
  x: number;      // Translation X
  y: number;      // Translation Y
  zoom: number;   // Scale factor
  /**
   * Tabletop view controls. Both default to 0, which reproduces the classic
   * flat top-down diagram exactly. `rotation` spins the rink around its centre
   * (yaw, radians); `tilt` leans it away from the viewer (pitch, radians) so
   * the boards read as raised walls.
   */
  rotation?: number;
  tilt?: number;
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
  lifecycle: DrillLifecycleState;
}

export type DrillLifecycleState =
  | 'ready'
  | 'active'
  | 'success'
  | 'failure'
  | 'review';

export type SkaterAction =
  | 'idle'
  | 'stride'
  | 'glide'
  | 'turn'
  | 'stop'
  | 'receive'
  | 'recover'
  | 'pass'
  | 'shot';

export interface PlaybackPlayerFrame {
  id: ID;
  position: Point;
  velocity: Point;
  heading: number;
  angularVelocity: number;
  speed: number;
  routeProgress: number;
  stridePhase: number;
  action: SkaterAction;
  bladePosition: Point;
}

// ============================================================================
// ANIMATION STATE
// ============================================================================

export interface AnimatedPuck {
  x: number;
  y: number;
  visible: boolean;
  state: 'possessed' | 'in_flight' | 'loose' | 'shot' | 'dead';
  carrierId?: ID;
  intendedReceiverId?: ID;
  velocity?: Point;
  result?: 'caught' | 'missed' | 'goal' | 'save' | 'rebound' | 'wide' | 'post';
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
  selectedEventId: ID | null;
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
  editorStep: 'setup' | 'movement' | 'puck' | 'review';
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
  showDiagnostics: boolean;
}

// ============================================================================
// UNDO STATE
// ============================================================================

export interface UndoSnapshot {
  players: Player[];
  skatePaths: SkatePath[];
  events: DrillEvent[];
  coaches: CoachMarker[];
}

// ============================================================================
// DRILL LIST
// ============================================================================

export interface DrillMeta {
  id: ID;
  name: string;
  updatedAt: number;
}

// ============================================================================
// APPLICATION STATE
// ============================================================================

export interface AppState {
  // Drill data - the only thing that gets persisted
  drill: Drill;

  // Camera
  camera: Camera;
  // Set once the user pans/zooms by hand. Until then the camera re-fits on
  // every resize (the first layout pass reports a stale size, so fitting only
  // once leaves the rink cropped). After it, resizes leave the camera alone
  // rather than throwing away the user's view.
  cameraUserAdjusted: boolean;

  // Canvas dimensions
  canvasWidth: number;
  canvasHeight: number;

  // Selection
  selection: SelectionState;

  // Interaction
  interaction: InteractionState;

  // Playback - all ephemeral, derived from `drill` + `playback.progress`.
  // Player positions during playback live here rather than in `drill`, so an
  // interrupted playback can never persist animation frames as the real drill.
  playback: PlaybackState;
  playbackPositions: Record<ID, Point>;
  playbackPlayerFrames: Record<ID, PlaybackPlayerFrame>;
  animatedPuck: AnimatedPuck | null;
  ghostTrails: Map<ID, Point[]>;

  // UI
  ui: UIState;

  // Undo / redo
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];

  // Drill list (for management)
  drillList: DrillMeta[];
  currentDrillId: ID | null;
}

// ============================================================================
// RINK CONSTANTS
// ============================================================================

/**
 * Rink geometry, in world units. All values are absolute positions rather than
 * fractions, because they come from fixed real-world NHL measurements - a rink
 * is 200x85 feet regardless of how big you draw it.
 */
export interface RinkDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  cornerRadius: number;
  goalLineLeftX: number;
  goalLineRightX: number;
  blueLineLeftX: number;
  blueLineRightX: number;
  /** Centre of the goal mouth - what shots are aimed at */
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
  | { type: 'SET_DRILL_LIST'; drills: DrillMeta[] }

  // Player actions
  | { type: 'ADD_PLAYER'; player: Player }
  | { type: 'REMOVE_PLAYER'; id: ID }
  | { type: 'MOVE_PLAYER'; id: ID; x: number; y: number }
  | { type: 'UPDATE_PLAYER_VISUAL'; id: ID; visual: Partial<PlayerVisualProfile> }
  | { type: 'SET_PUCK_CARRIER'; id: ID }
  | { type: 'SET_JERSEY'; team: Team; hex: string }
  | { type: 'SWAP_JERSEYS' }

  // Coach actions
  | { type: 'ADD_COACH'; coach: CoachMarker }
  | { type: 'MOVE_COACH'; id: ID; x: number; y: number }
  | { type: 'REMOVE_COACH'; id: ID }

  // Path actions
  | { type: 'ADD_SKATE_PATH'; path: SkatePath }
  | { type: 'REMOVE_SKATE_PATH'; id: ID }
  | { type: 'UPDATE_SKATE_PATH'; id: ID; updates: Pick<SkatePath, 'mode' | 'finish'> }
  | { type: 'UPDATE_SKATE_POINTS'; id: ID; points: Point[] }
  | { type: 'UPDATE_EVENT_PATH'; id: ID; toPoint?: Point; via?: Point | null }

  // Event actions
  | { type: 'ADD_PASS'; event: PassEvent }
  | { type: 'ADD_SHOT'; event: ShotEvent }
  | { type: 'ADD_DUMP'; event: DumpEvent }
  | { type: 'ADD_PICKUP'; event: PickupEvent }
  | { type: 'REMOVE_EVENT'; id: ID }
  | { type: 'UPDATE_PASS_RESULT'; id: ID; result: 'caught' | 'missed' | undefined }
  | { type: 'UPDATE_SHOT_RESULT'; id: ID; result: 'goal' | 'save' | 'rebound' | 'wide' | 'post' | undefined }
  | { type: 'CONVERT_DUMP_TO_PASS'; event: PassEvent }
  | { type: 'RETARGET_PASS'; event: PassEvent }
  | { type: 'CLEAR_ALL_EVENTS' }

  // Camera
  | { type: 'SET_CAMERA'; camera: Camera }
  | { type: 'FIT_CAMERA' }
  | { type: 'ZOOM_TO_ZONE'; zone: 'full' | 'offensive' | 'defensive' }
  // Zoom about a fixed screen point (wheel / pinch), keeping it anchored
  | { type: 'ZOOM_AT'; factor: number; screenPoint: Point }

  // Canvas
  | { type: 'SET_CANVAS_SIZE'; width: number; height: number }

  // Selection
  | { type: 'SELECT_PLAYER'; id: ID | null }
  | { type: 'SET_PASS_FROM'; id: ID | null }
  | { type: 'SELECT_EVENT'; id: ID | null }

  // Interaction
  | { type: 'SET_INTERACTION'; interaction: Partial<InteractionState> }
  | { type: 'RESET_INTERACTION' }

  // Playback. SET_PLAYBACK_PROGRESS is the single tick action: it re-derives
  // player positions, fired events and the puck from `progress`, so animating
  // and scrubbing take exactly the same path.
  | { type: 'START_PLAYBACK' }
  | { type: 'STOP_PLAYBACK' }
  | { type: 'SET_PLAYBACK_PROGRESS'; progress: number }
  | { type: 'SET_PLAYBACK_SPEED'; speed: number }
  | { type: 'RESET_PLAYBACK' }
  | { type: 'CLEAR_GHOST_TRAILS' }
  | { type: 'SET_PLAYBACK_LIFECYCLE'; lifecycle: DrillLifecycleState }

  // UI
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_EDITOR_STEP'; step: UIState['editorStep'] }
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
  | { type: 'TOGGLE_DIAGNOSTICS' }

  // Undo. Drill-mutating actions push an undo entry automatically (see
  // UNDOABLE_ACTIONS in state.ts). PUSH_UNDO is the explicit escape hatch for
  // continuous gestures like dragging a player, where the caller wants one
  // undo entry for the whole gesture rather than one per frame.
  | { type: 'PUSH_UNDO' }
  | { type: 'POP_UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR_UNDO' };
