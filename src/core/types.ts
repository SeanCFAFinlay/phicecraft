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
/**
 * The persistent modes.
 *
 * There are only three verbs - move, pass, skate - and only ONE of them is a
 * mode. Pass and Skate arm a single action and then finish, so they are
 * `PendingEditorAction`s, not tools; making them sticky modes was how Route,
 * Pass and Shoot used to become invisible states you could get stuck in.
 *
 * `shoot` and `erase` are gone: the finishing shot is derived rather than
 * authored, and deleting is done from the selection chip and from Details,
 * where you can see what you are about to remove.
 */
export type Tool =
  | 'move'
  | 'home'
  | 'away'
  | 'goalie'
  | 'coach';

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

/**
 * How an authored line is drawn between its control points.
 *
 * `spline`   a curve that passes through every control point
 * `polyline` straight segments with sharp corners
 *
 * Absent means `spline`, which is what every route did before the shape was
 * selectable.
 */
export type CurveShape = 'spline' | 'polyline';

export interface SkatePath {
  id: ID;
  ownerId: ID; // Player who owns this path
  team: Team;
  /**
   * The CONTROL POLYGON, not the drawn line. The renderer and the simulation
   * both expand it through `shape`, so what is drawn and what is skated are
   * the same geometry. Each point is a handle the author can drag, insert or
   * delete after the play is set up.
   */
  points: Point[];
  shape?: CurveShape;
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
   * Control points the puck travels through, between `fromPoint` and
   * `toPoint`. Absent or empty is a straight line.
   *
   * These are simulated, not decorative: flight time is measured along the
   * resulting curve, so bending a pass around a defender genuinely makes it
   * take longer to arrive.
   */
  waypoints?: Point[];
  shape?: CurveShape;
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
  /**
   * True for the shot the app maintains at the end of every play.
   *
   * A play finishes with a shot, so rather than make the coach author one, the
   * final one is derived from whoever ends up with the puck and re-sourced
   * whenever the chain changes. Being derived, it is transparent to the rules
   * that ask "can another puck action be added" and "who has the puck" - an
   * authored shot ends the drill, this one does not stop you extending it.
   */
  auto?: boolean;
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

/**
 * How a play is meant to end.
 *
 * A drill is NOT required to finish with a shot. Possession games, passing
 * warm-ups, races, stickhandling stations, neutral-zone timing drills, breakouts
 * that end at a zone exit and small-area games with no goalie all end some other
 * way, and forcing a shot onto them misrepresents the drill.
 *
 * Only `finish-with-shot` derives a shot. The remaining policies record the
 * coach's intent for the timeline and for phase behaviour; they never
 * manufacture a puck action.
 */
export type FinishPolicy =
  | 'none'
  | 'stop-after-sequence'
  | 'loop'
  | 'finish-with-shot'
  | 'finish-with-zone-entry'
  | 'finish-with-possession';

export interface DrillSettings {
  assistance: 'off' | 'standard' | 'high';
  recovery: 'authored' | 'nearest-teammate';
  timeLimitSeconds: number;
  reducedEffects: boolean;
  /**
   * Absent means `none`: no shot is invented for a drill that did not ask for
   * one. A v2 drill that already contained a derived shot migrates to
   * `finish-with-shot`, so no existing play changes shape on load.
   */
  finishPolicy?: FinishPolicy;
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

/**
 * The COARSE playback state React is allowed to see.
 *
 * Progress, sampled positions, the puck and ghost trails are deliberately
 * absent: they change 60 times a second and live in
 * `src/playback/PlaybackStore`, which the canvas subscribes to directly.
 */
export interface PlaybackState {
  isPlaying: boolean;
  speed: number; // Multiplier (0.5, 1, 2)
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
// INTERACTION
//
// Active pointers, drag discrimination, the pinch lifecycle, the hold timer,
// and in-progress route samples are NOT application state. They live in
// `src/editor/input`, outside React, because they change on every pointer
// event and nothing in the DOM renders them directly.
// ============================================================================

// ============================================================================
// UI STATE
// ============================================================================

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: ID;
  message: string;
  type: ToastType;
  duration: number;
  /**
   * `status` is announced politely by screen readers; `alert` interrupts.
   * Blocking failures use `alert`, everything else uses `status`.
   */
  role: 'status' | 'alert';
  /**
   * Higher priority may replace a lower-priority toast that is on screen. A
   * routine success can never displace a failure.
   */
  priority: number;
  /** Identical keys are collapsed while queued, so repeated hints don't stack. */
  dedupeKey: string;
}

/**
 * A hockey action the editor has started and is waiting for input to finish.
 *
 * This replaces the old invisible tool modes: every non-`none` value has a
 * visible chip, a "what to do next" line, and a Cancel control.
 */
export type PendingEditorAction =
  | { kind: 'none' }
  | { kind: 'move-player'; playerId: ID }
  | { kind: 'draw-route'; playerId: ID }
  | { kind: 'pass'; playerId: ID }
  | { kind: 'shoot'; playerId: ID }
  | { kind: 'move-coach'; coachId: ID }
  | { kind: 'edit-route'; pathId: ID }
  | { kind: 'edit-event'; eventId: ID };

/** Which inspector, if any, is open. Selection alone never opens one. */
export type InspectorTarget =
  | { kind: 'none' }
  | { kind: 'player'; playerId: ID }
  | { kind: 'event'; eventId: ID };

/** A disclosure sheet on the responsive shell. */
export type SheetKind =
  | 'none'
  | 'menu'
  | 'more'
  | 'add'
  | 'library'
  | 'possession'
  | 'workflow'
  | 'mode'
  | 'playback'
  | 'help'
  | 'diagnostics'
  | 'import-preview';

/** The three product states. Only 'build' may mutate the document. */
export type AppMode = 'build' | 'preview' | 'present';

/**
 * Which BoardRenderer implementation draws the two canvases (Phase 3).
 *
 * A device capability, not a drill property - it lives in localStorage
 * (`RENDERER_PREFERENCE_STORAGE_KEY` in constants.ts), never in the document.
 * `'webgl'` is best-effort: `selectRenderer` falls back to `'canvas2d'` at
 * runtime whenever the GPU chunk fails to load or the browser has no
 * `webgl2` context, regardless of which preference is stored here.
 */
export type RendererPreference = 'canvas2d' | 'webgl';

export interface UIState {
  mode: AppMode;
  editorStep: 'setup' | 'movement' | 'puck' | 'review';
  currentTool: Tool;
  showMenu: boolean;
  showRenameModal: boolean;
  /** The open inspector. Never set implicitly by selecting something. */
  inspector: InspectorTarget;
  openSheet: SheetKind;
  /** The toast currently on screen. Stays until dismissed or timed out. */
  activeToast: Toast | null;
  /** Toasts waiting their turn, in order. */
  toastQueue: Toast[];
  modeBanner: string | null;
  playBanner: string | null;
  showDiagnostics: boolean;
}

// ============================================================================
// UNDO STATE
// ============================================================================

/**
 * A deep copy of every mutable drill field that is meant to be undoable.
 *
 * `settings` is in here because jerseys live inside it: without it, "set home
 * jersey" and "swap jerseys" pushed an undo entry that restored everything
 * except the colours the user had just changed.
 */
export interface UndoSnapshot {
  players: Player[];
  skatePaths: SkatePath[];
  events: DrillEvent[];
  coaches: CoachMarker[];
  settings: DrillSettings | undefined;
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

  /**
   * Increments on every change to `drill`. Validation, event-outcome caches,
   * and review completion are keyed to this, so none of them recompute on a
   * playback tick or a camera move.
   */
  documentRevision: number;

  /**
   * The document revision the user has actually reviewed. Review is complete
   * only when this equals `documentRevision` - so any edit reopens it.
   */
  reviewedRevision: number | null;

  /** The hockey action awaiting input, if any. Always visible when set. */
  pendingAction: PendingEditorAction;

  // Selection
  selection: SelectionState;

  /**
   * Coarse playback lifecycle only. The frame itself - progress, interpolated
   * positions, the puck, ghost trails - is owned by
   * `src/playback/PlaybackStore`, and the drill is never mutated by playback,
   * so an interrupted play can't persist animation frames as the real drill.
   */
  playback: PlaybackState;

  // UI
  ui: UIState;

  // Undo / redo
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];

  // Drill list (for management)
  drillList: DrillMeta[];
  currentDrillId: ID | null;
  /**
   * The id `NEW_DRILL` last stamped, so a phone can recognize "this drill was
   * just created" without waiting for the player count to reach zero - a
   * brand-new drill starts with the full default lineup, not an empty board.
   * `LOAD_DRILL` leaves this alone: opening an existing drill is not creating
   * one, however many players it happens to have.
   */
  lastCreatedDrillId: ID | null;
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
  | { type: 'SET_FINISH_POLICY'; policy: FinishPolicy }
  | { type: 'SWAP_JERSEYS' }

  // Coach actions
  | { type: 'ADD_COACH'; coach: CoachMarker }
  | { type: 'MOVE_COACH'; id: ID; x: number; y: number }
  | { type: 'REMOVE_COACH'; id: ID }

  // Path actions
  | { type: 'ADD_SKATE_PATH'; path: SkatePath }
  | { type: 'REMOVE_SKATE_PATH'; id: ID }
  | { type: 'UPDATE_SKATE_PATH'; id: ID; updates: Partial<Pick<SkatePath, 'mode' | 'finish' | 'shape'>> }
  | { type: 'UPDATE_SKATE_POINTS'; id: ID; points: Point[] }
  /** Re-aim a puck line's end, reshape its waypoints, or change its shape. */
  | {
      type: 'UPDATE_EVENT_GEOMETRY';
      id: ID;
      toPoint?: Point;
      waypoints?: Point[];
      shape?: CurveShape;
      /** Re-timed from the new arc length by the command layer. */
      arrivalAt?: number;
    }

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

  // Destructive clears. Three separate commands with exact, non-overlapping
  // semantics - the single "Clear all events" used to remove routes too.
  /** Removes puck events only. Routes, players, coaches and settings remain. */
  | { type: 'CLEAR_PUCK_ACTIONS' }
  /** Removes skating routes only. Puck events and everything else remain. */
  | { type: 'CLEAR_MOVEMENT_ROUTES' }
  /** Restores the default lineup. Keeps the drill's ID, name and settings. */
  | { type: 'RESET_BOARD' }

  // Selection
  | { type: 'SELECT_PLAYER'; id: ID | null }
  | { type: 'SET_PASS_FROM'; id: ID | null }
  | { type: 'SELECT_EVENT'; id: ID | null }

  // Playback lifecycle. Per-frame progress is NOT an action - it is written
  // straight into the frame store by the requestAnimationFrame clock.
  | { type: 'START_PLAYBACK' }
  | { type: 'STOP_PLAYBACK' }
  | { type: 'SET_PLAYBACK_SPEED'; speed: number }
  | { type: 'RESET_PLAYBACK' }
  | { type: 'SET_PLAYBACK_LIFECYCLE'; lifecycle: DrillLifecycleState }
  /** The user has reviewed the current document revision. */
  | { type: 'MARK_REVIEWED' }

  // Pending action
  | { type: 'SET_PENDING_ACTION'; action: PendingEditorAction }
  | { type: 'CANCEL_PENDING_ACTION' }

  // UI
  | { type: 'SET_MODE'; mode: AppMode }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_EDITOR_STEP'; step: UIState['editorStep'] }
  | { type: 'TOGGLE_MENU' }
  | { type: 'CLOSE_MENU' }
  | { type: 'SHOW_RENAME_MODAL' }
  | { type: 'HIDE_RENAME_MODAL' }
  | { type: 'OPEN_INSPECTOR'; target: InspectorTarget }
  | { type: 'CLOSE_INSPECTOR' }
  | { type: 'OPEN_SHEET'; sheet: SheetKind }
  | { type: 'CLOSE_SHEET' }
  | { type: 'ENQUEUE_TOAST'; toast: Toast }
  | { type: 'DISMISS_TOAST'; id: ID }
  | { type: 'CLEAR_TOASTS' }
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
