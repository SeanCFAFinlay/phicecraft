// ============================================================================
// COMMAND TYPES
//
// One command layer sits between every view and the reducer/repository. Views
// call commands; they never implement hockey rules, persistence transitions,
// or confirmation copy themselves.
// ============================================================================

import type {
  AppAction,
  AppState,
  CurveShape,
  FinishPolicy,
  ID,
  PendingEditorAction,
  Point,
  ToastType,
} from '@/core/types';
import type {
  DrillRepository,
  ImportDecision,
  ImportPreview,
  PersistenceError,
  SaveCoordinator,
  UnsavedExportChoice,
} from '@/persistence';
import type { CameraStore } from '@/camera/CameraStore';
import type { PlaybackStore } from '@/playback/PlaybackStore';

// ----------------------------------------------------------------------------
// Results
// ----------------------------------------------------------------------------

/**
 * What a command did. `rejected` means a rule said no (and the user was told
 * why); `failed` means the operation was legal but could not be completed.
 */
export type CommandResult<T = void> =
  | { status: 'done'; value: T }
  | { status: 'rejected'; reason: string }
  | { status: 'cancelled' }
  | { status: 'failed'; error: PersistenceError };

export function done(): CommandResult<void>;
export function done<T>(value: T): CommandResult<T>;
export function done<T>(value?: T): CommandResult<T | void> {
  return { status: 'done', value: value as T };
}

export function rejected(reason: string): CommandResult<never> {
  return { status: 'rejected', reason };
}

export function cancelled(): CommandResult<never> {
  return { status: 'cancelled' };
}

export function failed(error: PersistenceError): CommandResult<never> {
  return { status: 'failed', error };
}

// ----------------------------------------------------------------------------
// Notifications
// ----------------------------------------------------------------------------

export interface ToastInput {
  message: string;
  type?: ToastType;
  /** 0 keeps the toast until it is explicitly dismissed. */
  duration?: number;
  /** Defaults from `type`. Failures outrank routine messages. */
  priority?: number;
  /** Defaults to `alert` for errors, `status` for everything else. */
  role?: 'status' | 'alert';
  /** Repeats of the same key are collapsed while queued. */
  dedupeKey?: string;
}

export interface Notifier {
  toast(input: ToastInput): void;
  dismiss(id: ID): void;
}

// ----------------------------------------------------------------------------
// Confirmation
// ----------------------------------------------------------------------------

export interface ConfirmationRequest {
  /** Stable identifier, so the same decision reads identically everywhere. */
  id: string;
  title: string;
  /** What will happen. Always states what is removed AND what remains. */
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
}

export type Confirm = (request: ConfirmationRequest) => Promise<boolean>;

/** Asks for a value, e.g. a new play name. Resolves null when cancelled. */
export type PromptForText = (request: {
  id: string;
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  maxLength?: number;
}) => Promise<string | null>;

/** Triggers a browser download. Returns false if no file was produced. */
export type DownloadFile = (filename: string, contents: string) => boolean;

// ----------------------------------------------------------------------------
// Host
// ----------------------------------------------------------------------------

export interface CommandHost {
  getState(): AppState;
  dispatch(action: AppAction): void;
  repository: DrillRepository;
  coordinator: SaveCoordinator;
  /** High-frequency stores the commands need to read or seek. */
  camera: CameraStore;
  playback: PlaybackStore;
  notify: Notifier;
  confirm: Confirm;
  promptForText: PromptForText;
  download: DownloadFile;
  /** Asked only when a pre-export flush fails. */
  confirmUnsavedExport: (error: PersistenceError) => Promise<UnsavedExportChoice>;
  /** Announce something to assistive tech without a visible toast. */
  announce: (message: string) => void;
  /** Hand a parsed-but-unwritten import to the preview surface. */
  publishImportPreview: (preview: ImportPreview | null) => void;
  now: () => number;
}

// ----------------------------------------------------------------------------
// Service surface
// ----------------------------------------------------------------------------

export interface AuthoringCommands {
  setTool(tool: AppState['ui']['currentTool']): void;
  setEditorStep(step: AppState['ui']['editorStep']): void;
  selectPlayer(id: ID | null): void;
  selectEvent(id: ID | null): void;
  openPlayerInspector(id: ID): void;
  openEventInspector(id: ID): void;
  closeInspector(): void;
  setPendingAction(action: PendingEditorAction): void;
  cancelPendingAction(): void;

  addPlayer(point: Point, kind: 'home' | 'away' | 'goalie'): CommandResult<ID>;
  removePlayer(id: ID): Promise<CommandResult>;
  beginPlayerMove(id: ID): CommandResult;
  movePlayerTo(id: ID, x: number, y: number): CommandResult;
  setPuckCarrier(id: ID): Promise<CommandResult>;
  updatePlayerVisual(id: ID, visual: { handedness?: 'left' | 'right'; visor?: boolean }): void;
  setJersey(team: 'home' | 'away', hex: string): void;
  swapJerseys(): void;
  /** How this drill is meant to end. Only `finish-with-shot` derives a shot. */
  setFinishPolicy(policy: FinishPolicy): void;

  /**
   * Tell the coach what to do next, without changing the drill.
   *
   * Used when an authoring gesture did not land: a pass that missed every
   * eligible teammate, or one aimed at an opponent. The action stays armed, so
   * this is guidance rather than a failure - and it is a command rather than a
   * direct toast so that views keep out of the notification plumbing.
   */
  guide(message: string): void;

  addCoach(point: Point): CommandResult<ID>;
  moveCoach(id: ID, x: number, y: number): void;
  removeCoach(id: ID): CommandResult;

  commitRoute(ownerId: ID, rawPoints: Point[]): CommandResult<ID>;
  updateRouteStyle(pathId: ID, updates: { mode?: 'skate' | 'glide' | 'backward'; finish?: 'coast' | 'stop' }): void;
  removeRoute(pathId: ID): CommandResult;

  // Reshaping a route after it is drawn. `points` is the stored control
  // polygon, so these move exactly the point the author grabbed.
  moveRouteControl(pathId: ID, index: number, to: Point): CommandResult;
  insertRouteControl(pathId: ID, index: number, at: Point): CommandResult;
  removeRouteControl(pathId: ID, index: number): CommandResult;
  setRouteShape(pathId: ID, shape: CurveShape): CommandResult;
  /** Reduce a legacy dense route to a handful of editable control points. */
  simplifyRoute(pathId: ID): CommandResult;

  requestPass(fromPlayerId: ID, toPlayerId: ID, options?: { fromPoint?: Point }): CommandResult;
  requestShot(fromPlayerId: ID, target: Point): CommandResult;
  requestDump(fromPlayerId: ID, target: Point, fromPoint?: Point): CommandResult;
  requestPickup(playerId: ID): CommandResult;
  retargetPass(eventId: ID, receiverId: ID): CommandResult;
  convertDumpToPass(eventId: ID, receiverId: ID): CommandResult;
  removeEvent(eventId: ID): CommandResult;
  updatePassResult(eventId: ID, result: 'caught' | 'missed' | undefined): void;
  updateShotResult(eventId: ID, result: 'goal' | 'save' | 'rebound' | 'wide' | 'post' | undefined): void;
  // Reshaping a puck line. Every one of these re-times the event's arrival
  // from the new arc length, because the puck follows the drawn curve.
  moveEventWaypoint(eventId: ID, index: number, to: Point): CommandResult;
  insertEventWaypoint(eventId: ID, index: number, at: Point): CommandResult;
  removeEventWaypoint(eventId: ID, index: number): CommandResult;
  setEventTarget(eventId: ID, to: Point): CommandResult;
  setEventShape(eventId: ID, shape: CurveShape): CommandResult;

  recoverOffRinkObjects(): CommandResult<number>;

  clearPuckActions(): Promise<CommandResult>;
  clearMovementRoutes(): Promise<CommandResult>;
  resetBoard(): Promise<CommandResult>;

  undo(): void;
  redo(): void;
  pushUndo(): void;
}

export interface PlaybackCommands {
  /** The single entry point for starting playback, from any surface. */
  requestPlaybackStart(): CommandResult;
  stopPlayback(): void;
  setPlaybackProgress(progress: number): void;
  setPlaybackSpeed(speed: number): void;
  resetPlayback(): void;
  stepPlayback(): void;
  /** Called when playback reaches the end, and by the explicit Review action. */
  completeReview(options?: { announce?: boolean }): void;
}

export interface DocumentCommands {
  initialize(): Promise<void>;
  newDrill(): Promise<CommandResult>;
  loadDrill(id: ID): Promise<CommandResult>;
  loadFixture(name: 'give-and-go' | 'corner-retrieval' | 'cross-corner' | 'low-high'): Promise<CommandResult>;
  /**
   * Open a library template as a NEW drill of the coach's own.
   *
   * Templates are immutable: this takes a copy with fresh ids for every player,
   * route and puck action, so editing "Gates Passing Game" cannot change what
   * the next coach finds in the library.
   */
  useTemplate(templateId: string): Promise<CommandResult>;
  renameDrill(name: string): void;
  requestRename(): Promise<CommandResult>;
  saveDrill(): Promise<CommandResult>;
  saveAsNewPlay(name?: string): Promise<CommandResult<ID>>;
  deleteDrill(id: ID): Promise<CommandResult>;
  exportDrills(): Promise<CommandResult>;
  prepareImport(text: string): Promise<CommandResult<ImportPreview>>;
  commitImport(preview: ImportPreview, decisions: ImportDecision[]): Promise<CommandResult<ID[]>>;
  retrySave(): Promise<CommandResult>;
  exportUnsavedData(): Promise<CommandResult>;
  downloadRecoveryBundle(): Promise<CommandResult>;
  dismissPersistenceError(): void;
}

export type DrillCommandService = AuthoringCommands & PlaybackCommands & DocumentCommands;
