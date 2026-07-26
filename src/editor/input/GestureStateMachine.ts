// ============================================================================
// GESTURE STATE MACHINE
//
// Turns raw pointer events into hockey intents. Everything transient - the
// active gesture, in-progress route samples, the drag preview, the hold timer -
// lives here, outside React, and is coalesced to at most one visual update per
// animation frame.
// ============================================================================

import type { Camera, ID, Point } from '@/core/types';
import { HOLD_DURATION, MOVE_THRESHOLD, TABLETOP_MAX_TILT } from '@/core/constants';
import { distance } from '@/utils/geometry';
import { PointerRegistry } from './PointerRegistry';
import type {
  Gesture,
  GestureContext,
  GestureHandlers,
  HitTester,
  PointerSample,
  PressTarget,
} from './gestureTypes';

export interface GestureStateMachineOptions {
  hitTester: HitTester;
  handlers: GestureHandlers;
  getContext: () => GestureContext;
  /** Injected so tests can drive the clock deterministically. */
  now?: () => number;
  scheduleFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
  setTimer?: (callback: () => void, ms: number) => number;
  clearTimer?: (handle: number) => void;
}

export class GestureStateMachine {
  readonly pointers = new PointerRegistry();

  private gesture: Gesture = { kind: 'idle' };
  private holdTimer: number | null = null;
  private holdProgressFrame: number | null = null;
  private holdStartedAt = 0;

  /** In-progress route samples. Never leave this object until commit. */
  private routeSamples: Point[] = [];
  /** Latest pointer position, applied on the next animation frame. */
  private pendingMove: Point | null = null;
  private frameHandle: number | null = null;

  private readonly now: () => number;
  private readonly scheduleFrame: (callback: () => void) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly setTimer: (callback: () => void, ms: number) => number;
  private readonly clearTimer: (handle: number) => void;

  constructor(private readonly options: GestureStateMachineOptions) {
    this.now = options.now ?? (() => performance.now());
    this.scheduleFrame = options.scheduleFrame ?? (callback => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? (handle => cancelAnimationFrame(handle));
    this.setTimer = options.setTimer ?? ((callback, ms) => window.setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? (handle => window.clearTimeout(handle));
  }

  get current(): Gesture {
    return this.gesture;
  }

  /** The route being drawn right now, for the canvas preview. */
  get transientRoute(): Point[] {
    return this.routeSamples;
  }

  // --------------------------------------------------------------------------
  // Pointer events
  // --------------------------------------------------------------------------

  pointerDown(sample: PointerSample): void {
    const { hitTester, handlers, getContext } = this.options;
    const context = getContext();

    this.pointers.down(sample);

    // A second finger always wins: whatever the first was doing is abandoned.
    if (this.pointers.isMultiTouch) {
      this.beginPinch(context.camera);
      return;
    }

    if (context.isPlaying) return;

    const target = this.classify(sample.position, hitTester);

    if (target.kind === 'route-handle') {
      this.gesture = { kind: 'drag-route-handle', pathId: target.pathId, index: target.index };
      return;
    }

    if (target.kind === 'event-handle') {
      this.gesture = {
        kind: 'drag-event-handle',
        eventId: target.eventId,
        part: target.part,
        index: target.index,
      };
      return;
    }

    // An add-affordance is a TAP target, not a drag: pressing it inserts a
    // control point, and the press stays a press so a stray wobble does not
    // start dragging something that did not exist a moment ago.
    if (target.kind === 'route-add' || target.kind === 'event-add') {
      this.gesture = { kind: 'press', target, startPointer: sample.position, moved: false };
      return;
    }

    if (target.kind === 'route-affordance') {
      this.gesture = { kind: 'draw-route', ownerId: target.playerId };
      this.routeSamples = [hitTester.toWorld(sample.position)];
      return;
    }

    // The Move button arms a player. Pressing that player then drags it
    // straight away, with no 0.7s hold to sit through - and a tap anywhere
    // else drops it there, which `onTap` handles.
    if (target.kind === 'player' && target.playerId === context.armedMovePlayerId) {
      this.gesture = { kind: 'move-player', playerId: target.playerId };
      return;
    }

    // Empty ice stays a PRESS until the pointer actually moves. Committing to
    // a pan on pointer-down meant a tap on empty ice was swallowed by the
    // camera - so "tap empty ice to place a player" and "tap to deselect"
    // never fired at all.
    this.gesture = { kind: 'press', target, startPointer: sample.position, moved: false };

    // Hold-to-move is an optional expert shortcut, not the only way to move a
    // player. It uses the shared HOLD_DURATION, not a private 230ms constant.
    if (target.kind === 'player' && context.holdToMoveEnabled) {
      this.startHold(target.playerId, handlers);
    }
  }

  pointerMove(sample: PointerSample): void {
    if (!this.pointers.move(sample.pointerId, sample.position)) return;

    if (this.gesture.kind === 'pinch') {
      this.pendingMove = sample.position;
      this.requestFrame();
      return;
    }

    if (this.gesture.kind === 'pan' || this.gesture.kind === 'orbit') {
      this.pendingMove = sample.position;
      this.requestFrame();
      return;
    }

    if (this.gesture.kind === 'press') {
      const moved = distance(sample.position, this.gesture.startPointer) > MOVE_THRESHOLD;
      if (!moved) return;

      // Leaving the press point means this is a drag, not a hold.
      this.cancelHold();
      this.promotePress(this.gesture.target, this.gesture.startPointer, sample.position);
      return;
    }

    this.pendingMove = sample.position;
    this.requestFrame();
  }

  pointerUp(sample: PointerSample): void {
    const { handlers, hitTester } = this.options;
    const gesture = this.gesture;
    const { allowTap, remaining } = this.pointers.up(sample.pointerId);

    this.flushFrame();
    this.cancelHold();

    if (gesture.kind === 'pinch') {
      // Stay in the pinch until every finger is up, so the last release cannot
      // be reinterpreted as a single-finger drag.
      if (remaining === 0) this.gesture = { kind: 'idle' };
      return;
    }

    if (!allowTap) {
      // Part of a multi-touch lifecycle: never a tap, never an edit.
      if (remaining === 0) this.reset();
      return;
    }

    switch (gesture.kind) {
      case 'press': {
        const context = this.options.getContext();
        const targetId = pressTargetId(gesture.target);
        if (targetId && targetId === context.selectedId) {
          handlers.onSecondTap(sample.position, gesture.target);
        } else {
          handlers.onTap(sample.position, gesture.target);
        }
        break;
      }

      case 'move-player':
        handlers.onPlayerMoveEnd(gesture.playerId);
        break;

      case 'draw-route':
        if (this.routeSamples.length >= 2) {
          handlers.onRouteCommit(gesture.ownerId, this.routeSamples);
        }
        break;

      case 'drag-puck': {
        const receiverId = hitTester.passReceiverAt(sample.position, gesture.playerId);
        handlers.onPuckDragRelease(gesture.playerId, gesture.from, sample.position, receiverId);
        break;
      }

      case 'drag-route-handle':
      case 'drag-event-handle':
      case 'move-coach':
        handlers.onEditGestureEnd();
        break;

      case 'pan':
      case 'orbit':
      case 'idle':
        break;
    }

    this.reset();
  }

  pointerCancel(sample: PointerSample): void {
    const { remaining } = this.pointers.cancel(sample.pointerId);
    this.cancelHold();
    this.flushFrame();
    this.options.handlers.onGestureCancel();
    if (remaining === 0) this.reset();
  }

  /** Abandon everything: tool change, modal open, drill switch. */
  abort(): void {
    this.cancelHold();
    this.flushFrame();
    this.pointers.clear();
    this.reset();
    this.options.handlers.onGestureCancel();
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private classify(point: Point, hitTester: HitTester): PressTarget {
    // Control points win over the add-affordances between them, which win
    // over the lines underneath.
    const routeHandle = hitTester.routeHandleAt(point);
    if (routeHandle) return { kind: 'route-handle', ...routeHandle };

    const eventHandle = hitTester.eventHandleAt(point);
    if (eventHandle) return { kind: 'event-handle', ...eventHandle };

    const routeAdd = hitTester.routeAddHandleAt(point);
    if (routeAdd) return { kind: 'route-add', ...routeAdd };

    const eventAdd = hitTester.eventAddHandleAt(point);
    if (eventAdd) return { kind: 'event-add', ...eventAdd };

    const affordance = hitTester.routeAffordanceAt(point);
    if (affordance) return { kind: 'route-affordance', playerId: affordance };

    const player = hitTester.playerAt(point);
    if (player) return { kind: 'player', playerId: player.id, isCarrier: player.isCarrier };

    const coach = hitTester.coachAt(point);
    if (coach) return { kind: 'coach', coachId: coach };

    const route = hitTester.routeAt(point);
    if (route) return { kind: 'route', ...route };

    const event = hitTester.eventAt(point);
    if (event) return { kind: 'event', eventId: event };

    return { kind: 'empty' };
  }

  /**
   * A press that turned into a drag becomes the appropriate gesture.
   *
   * The origin is the press point, not the current pointer position: a pass
   * leaves from where the carrier is, not from wherever the finger has got to.
   */
  private promotePress(target: PressTarget, origin: Point, position: Point): void {
    const { hitTester, handlers, getContext } = this.options;
    const context = getContext();

    switch (target.kind) {
      case 'empty':
        // Only now is this a camera gesture: flat ice pans, a tilted
        // tabletop orbits.
        this.gesture = {
          kind: context.isTabletop ? 'orbit' : 'pan',
          startPointer: origin,
          startCamera: { ...context.camera },
        };
        break;

      case 'player':
        // Skate wins over the carrier's default drag-to-pass, so the player
        // with the puck can be given a route like anybody else.
        if (target.isCarrier && target.playerId !== context.armedRoutePlayerId) {
          this.gesture = {
            kind: 'drag-puck',
            playerId: target.playerId,
            from: hitTester.toWorld(origin),
          };
        } else {
          this.gesture = { kind: 'draw-route', ownerId: target.playerId };
          this.routeSamples = [hitTester.toWorld(origin)];
        }
        break;

      case 'coach':
        this.gesture = { kind: 'move-coach', coachId: target.coachId };
        break;

      case 'route':
        // Dragging from a point on a route releases the puck there.
        this.gesture = { kind: 'drag-puck', playerId: target.ownerId, from: target.point };
        break;

      default:
        this.gesture = { kind: 'idle' };
        break;
    }

    handlers.onHoldCancel();
    this.pendingMove = position;
    this.requestFrame();
  }

  private beginPinch(camera: Camera): void {
    this.cancelHold();
    this.routeSamples = [];
    const points = this.pointers.positions();
    if (points.length < 2) return;

    this.gesture = {
      kind: 'pinch',
      startDistance: Math.max(distance(points[0], points[1]), 1),
      startMidpoint: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
      startCamera: { ...camera },
    };
    this.options.handlers.onGestureCancel();
  }

  private startHold(playerId: ID, handlers: GestureHandlers): void {
    this.cancelHold();
    this.holdStartedAt = this.now();
    handlers.onHoldStart(playerId);

    const tick = () => {
      const fraction = Math.min((this.now() - this.holdStartedAt) / HOLD_DURATION, 1);
      handlers.onHoldProgress(fraction);
      if (fraction < 1 && this.holdTimer !== null) {
        this.holdProgressFrame = this.scheduleFrame(tick);
      }
    };
    this.holdProgressFrame = this.scheduleFrame(tick);

    this.holdTimer = this.setTimer(() => {
      this.holdTimer = null;
      this.gesture = { kind: 'move-player', playerId };
      this.routeSamples = [];
      handlers.onHoldProgress(1);
    }, HOLD_DURATION);
  }

  private cancelHold(): void {
    if (this.holdTimer !== null) {
      this.clearTimer(this.holdTimer);
      this.holdTimer = null;
      this.options.handlers.onHoldCancel();
    }
    if (this.holdProgressFrame !== null) {
      this.cancelFrame(this.holdProgressFrame);
      this.holdProgressFrame = null;
    }
  }

  /**
   * Coalesce pointer movement to one visual update per animation frame. A
   * high-rate stylus can fire several hundred moves a second; the rink cannot
   * usefully redraw more than once per frame.
   */
  private requestFrame(): void {
    if (this.frameHandle !== null) return;
    this.frameHandle = this.scheduleFrame(() => {
      this.frameHandle = null;
      this.applyPendingMove();
    });
  }

  private flushFrame(): void {
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.applyPendingMove();
  }

  private applyPendingMove(): void {
    const position = this.pendingMove;
    this.pendingMove = null;
    if (!position) return;

    const { hitTester, handlers, getContext } = this.options;
    const gesture = this.gesture;

    switch (gesture.kind) {
      case 'pinch': {
        const points = this.pointers.positions();
        if (points.length < 2) return;
        const dist = Math.max(distance(points[0], points[1]), 1);
        const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
        const scale = dist / gesture.startDistance;
        handlers.onPinch({
          ...gesture.startCamera,
          zoom: gesture.startCamera.zoom * scale,
          x: mid.x - (gesture.startMidpoint.x - gesture.startCamera.x) * scale,
          y: mid.y - (gesture.startMidpoint.y - gesture.startCamera.y) * scale,
        });
        return;
      }

      case 'pan':
        handlers.onPanOrOrbit({
          ...gesture.startCamera,
          x: gesture.startCamera.x + (position.x - gesture.startPointer.x),
          y: gesture.startCamera.y + (position.y - gesture.startPointer.y),
        });
        return;

      case 'orbit': {
        const dx = position.x - gesture.startPointer.x;
        const dy = position.y - gesture.startPointer.y;
        handlers.onPanOrOrbit({
          ...gesture.startCamera,
          rotation: (gesture.startCamera.rotation ?? 0) + dx * 0.006,
          tilt: Math.max(0, Math.min(TABLETOP_MAX_TILT, (gesture.startCamera.tilt ?? 0) - dy * 0.005)),
        });
        return;
      }

      case 'move-player':
        handlers.onPlayerMove(gesture.playerId, hitTester.toWorld(position));
        return;

      case 'move-coach':
        handlers.onCoachMove(gesture.coachId, hitTester.toWorld(position));
        return;

      case 'draw-route':
        this.routeSamples.push(hitTester.toWorld(position));
        handlers.onRouteSampling(gesture.ownerId, this.routeSamples);
        return;

      case 'drag-puck':
        handlers.onPuckDragPreview(
          gesture.playerId,
          gesture.from,
          hitTester.toWorld(position),
          hitTester.passReceiverAt(position, gesture.playerId)
        );
        return;

      case 'drag-route-handle':
        handlers.onRouteHandleDrag(gesture.pathId, gesture.index, hitTester.toWorld(position));
        return;

      case 'drag-event-handle':
        handlers.onEventHandleDrag(
          gesture.eventId,
          gesture.part,
          gesture.index,
          hitTester.toWorld(position)
        );
        return;

      default:
        void getContext();
        return;
    }
  }

  private reset(): void {
    this.gesture = { kind: 'idle' };
    this.routeSamples = [];
    this.pendingMove = null;
  }
}

function pressTargetId(target: PressTarget): ID | null {
  switch (target.kind) {
    case 'player':
      return target.playerId;
    case 'coach':
      return target.coachId;
    case 'event':
      return target.eventId;
    case 'route':
      return target.ownerId;
    default:
      return null;
  }
}
