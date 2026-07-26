// ============================================================================
// GESTURE TYPES
// ============================================================================

import type { Camera, ID, Point } from '@/core/types';

export interface PointerSample {
  pointerId: number;
  position: Point;
  pointerType: 'mouse' | 'touch' | 'pen';
}

/** What the state machine is currently doing. Exactly one at a time. */
export type Gesture =
  | { kind: 'idle' }
  | { kind: 'pinch'; startDistance: number; startMidpoint: Point; startCamera: Camera }
  | { kind: 'pan'; startPointer: Point; startCamera: Camera }
  | { kind: 'orbit'; startPointer: Point; startCamera: Camera }
  | { kind: 'press'; target: PressTarget; startPointer: Point; moved: boolean }
  | { kind: 'move-player'; playerId: ID }
  | { kind: 'move-coach'; coachId: ID }
  | { kind: 'draw-route'; ownerId: ID }
  | { kind: 'drag-puck'; playerId: ID; from: Point }
  | { kind: 'drag-route-handle'; pathId: ID; index: number }
  | { kind: 'drag-event-handle'; eventId: ID; part: EventHandlePart; index: number };

/** What was under the pointer when it went down. */
export type PressTarget =
  | { kind: 'empty' }
  | { kind: 'player'; playerId: ID; isCarrier: boolean }
  | { kind: 'coach'; coachId: ID }
  | { kind: 'route'; pathId: ID; ownerId: ID; point: Point }
  | { kind: 'event'; eventId: ID }
  | { kind: 'route-handle'; pathId: ID; index: number }
  | { kind: 'event-handle'; eventId: ID; part: EventHandlePart; index: number }
  /** The "+" between two controls: tap to insert a point there. */
  | { kind: 'route-add'; pathId: ID; index: number; point: Point }
  | { kind: 'event-add'; eventId: ID; index: number; point: Point }
  | { kind: 'route-affordance'; playerId: ID };

/** Which part of a puck line a handle belongs to. */
export type EventHandlePart = 'waypoint' | 'end';

/** Hit-testing the canvas provides, in screen coordinates. */
export interface HitTester {
  playerAt(point: Point): { id: ID; isCarrier: boolean } | null;
  coachAt(point: Point): ID | null;
  routeAt(point: Point): { pathId: ID; ownerId: ID; point: Point } | null;
  eventAt(point: Point): ID | null;
  routeHandleAt(point: Point): { pathId: ID; index: number } | null;
  routeAddHandleAt(point: Point): { pathId: ID; index: number; point: Point } | null;
  eventHandleAt(point: Point): { eventId: ID; part: EventHandlePart; index: number } | null;
  eventAddHandleAt(point: Point): { eventId: ID; index: number; point: Point } | null;
  routeAffordanceAt(point: Point): ID | null;
  passReceiverAt(point: Point, excludePlayerId?: ID): ID | null;
  toWorld(point: Point): Point;
}

/** The intents the state machine emits. The canvas turns these into commands. */
export interface GestureHandlers {
  onTap(screen: Point, target: PressTarget): void;
  onSecondTap(screen: Point, target: PressTarget): void;

  onHoldStart(playerId: ID): void;
  onHoldProgress(fraction: number): void;
  onHoldCancel(): void;

  onPlayerMove(playerId: ID, world: Point): void;
  onPlayerMoveEnd(playerId: ID): void;

  onCoachMove(coachId: ID, world: Point): void;

  onRouteSampling(ownerId: ID, points: Point[]): void;
  onRouteCommit(ownerId: ID, points: Point[]): void;

  onPuckDragPreview(playerId: ID, from: Point, to: Point, receiverId: ID | null): void;
  onPuckDragRelease(playerId: ID, from: Point, releaseScreen: Point, receiverId: ID | null): void;

  onRouteHandleDrag(pathId: ID, index: number, world: Point): void;
  onEventHandleDrag(eventId: ID, part: EventHandlePart, index: number, world: Point): void;
  onEditGestureEnd(): void;

  onPanOrOrbit(camera: Camera): void;
  onPinch(camera: Camera): void;

  onGestureCancel(): void;
}

export interface GestureContext {
  camera: Camera;
  /** True while the play is running; authoring gestures are suspended. */
  isPlaying: boolean;
  /** The tabletop view orbits instead of panning on empty ice. */
  isTabletop: boolean;
  /** Hold-to-move is an expert shortcut and can be switched off. */
  holdToMoveEnabled: boolean;
  /** The id currently selected, for second-tap detection. */
  selectedId: ID | null;
  /**
   * The player the Move button has armed, if any.
   *
   * Without this the button was decorative: it set a pending action nothing in
   * here could see, so moving a player still meant holding it for 0.7s and the
   * button appeared to do nothing at all.
   */
  armedMovePlayerId: ID | null;
  /**
   * The player the Skate button has armed, if any.
   *
   * Dragging a player normally draws their route - unless they are carrying,
   * where the drag is read as a pass. That left the carrier as the one player
   * who could not be given a route by dragging, which is the exact drill of
   * skating in and shooting. Arming Skate says "this drag is a route".
   */
  armedRoutePlayerId: ID | null;
}
