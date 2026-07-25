// ============================================================================
// GESTURE STATE MACHINE
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GestureStateMachine } from './GestureStateMachine';
import { HOLD_DURATION, MOVE_THRESHOLD, DEFAULT_CAMERA } from '@/core/constants';
import type { GestureContext, HitTester, PointerSample } from './gestureTypes';
import type { ID, Point } from '@/core/types';

// ----------------------------------------------------------------------------
// Test harness: a controllable clock, frame scheduler, and timer.
// ----------------------------------------------------------------------------

class FakeScheduler {
  private time = 0;
  private frames: (() => void)[] = [];
  private timers = new Map<number, { at: number; callback: () => void }>();
  private nextHandle = 1;

  now = () => this.time;

  scheduleFrame = (callback: () => void): number => {
    this.frames.push(callback);
    return this.nextHandle++;
  };

  cancelFrame = (): void => {
    this.frames = [];
  };

  setTimer = (callback: () => void, ms: number): number => {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.time + ms, callback });
    return handle;
  };

  clearTimer = (handle: number): void => {
    this.timers.delete(handle);
  };

  /** Run every queued animation frame callback. */
  flushFrames(): void {
    const queued = this.frames;
    this.frames = [];
    for (const callback of queued) callback();
  }

  advance(ms: number): void {
    this.time += ms;
    for (const [handle, timer] of [...this.timers]) {
      if (timer.at <= this.time) {
        this.timers.delete(handle);
        timer.callback();
      }
    }
  }
}

function buildHitTester(overrides: Partial<HitTester> = {}): HitTester {
  return {
    playerAt: () => null,
    coachAt: () => null,
    routeAt: () => null,
    eventAt: () => null,
    routeHandleAt: () => null,
    eventHandleAt: () => null,
    routeAffordanceAt: () => null,
    passReceiverAt: () => null,
    toWorld: (point: Point) => point,
    ...overrides,
  };
}

function buildHandlers() {
  return {
    onTap: vi.fn(),
    onSecondTap: vi.fn(),
    onHoldStart: vi.fn(),
    onHoldProgress: vi.fn(),
    onHoldCancel: vi.fn(),
    onPlayerMove: vi.fn(),
    onPlayerMoveEnd: vi.fn(),
    onCoachMove: vi.fn(),
    onRouteSampling: vi.fn(),
    onRouteCommit: vi.fn(),
    onPuckDragPreview: vi.fn(),
    onPuckDragRelease: vi.fn(),
    onRouteHandleDrag: vi.fn(),
    onEventHandleDrag: vi.fn(),
    onEditGestureEnd: vi.fn(),
    onPanOrOrbit: vi.fn(),
    onPinch: vi.fn(),
    onGestureCancel: vi.fn(),
  };
}

let scheduler: FakeScheduler;
let handlers: ReturnType<typeof buildHandlers>;
let context: GestureContext;

function build(hitTester: HitTester = buildHitTester()): GestureStateMachine {
  return new GestureStateMachine({
    hitTester,
    handlers,
    getContext: () => context,
    now: scheduler.now,
    scheduleFrame: scheduler.scheduleFrame,
    cancelFrame: scheduler.cancelFrame,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
  });
}

const touch = (pointerId: number, x: number, y: number): PointerSample => ({
  pointerId,
  position: { x, y },
  pointerType: 'touch',
});

const playerHitTester = (id: ID = 'p1', isCarrier = false) =>
  buildHitTester({ playerAt: () => ({ id, isCarrier }) });

beforeEach(() => {
  scheduler = new FakeScheduler();
  handlers = buildHandlers();
  context = {
    camera: { ...DEFAULT_CAMERA },
    isPlaying: false,
    isTabletop: false,
    holdToMoveEnabled: true,
    selectedId: null,
  };
});

// ----------------------------------------------------------------------------

describe('taps', () => {
  it('fires a tap for a press and release that did not move', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerUp(touch(1, 100, 100));

    expect(handlers.onTap).toHaveBeenCalledTimes(1);
    expect(handlers.onTap.mock.calls[0][1]).toMatchObject({ kind: 'player', playerId: 'p1' });
  });

  it('fires a second tap when the target is already selected', () => {
    context.selectedId = 'p1';
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerUp(touch(1, 100, 100));

    expect(handlers.onSecondTap).toHaveBeenCalledTimes(1);
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('does not fire a tap while playback is running', () => {
    context.isPlaying = true;
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerUp(touch(1, 100, 100));

    expect(handlers.onTap).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// P0: a pinch release must never become a tap or an edit.
// ----------------------------------------------------------------------------

describe('pinch tap suppression', () => {
  it('pinch then sequential release fires no tap', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerDown(touch(2, 200, 200));

    machine.pointerUp(touch(1, 100, 100));
    machine.pointerUp(touch(2, 200, 200));

    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(handlers.onSecondTap).not.toHaveBeenCalled();
  });

  it('pinch then simultaneous release fires no tap', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerDown(touch(2, 200, 200));

    machine.pointerUp(touch(2, 200, 200));
    machine.pointerUp(touch(1, 100, 100));

    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('an interrupted pinch (one finger cancelled) still fires no tap', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerDown(touch(2, 200, 200));

    machine.pointerCancel(touch(1, 100, 100));
    machine.pointerUp(touch(2, 200, 200));

    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('a cancelled single pointer fires no tap', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerCancel(touch(1, 100, 100));

    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(handlers.onGestureCancel).toHaveBeenCalled();
  });

  it('pinching over a player performs no edit on release', () => {
    const machine = build(playerHitTester('p1', true));
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerDown(touch(2, 140, 120));
    machine.pointerUp(touch(1, 100, 100));
    machine.pointerUp(touch(2, 140, 120));

    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(handlers.onPuckDragRelease).not.toHaveBeenCalled();
    expect(handlers.onRouteCommit).not.toHaveBeenCalled();
  });

  it('abandons a hold-to-move that was already counting down', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    expect(handlers.onHoldStart).toHaveBeenCalledWith('p1');

    machine.pointerDown(touch(2, 200, 200));
    scheduler.advance(HOLD_DURATION + 50);

    expect(handlers.onHoldCancel).toHaveBeenCalled();
    machine.pointerUp(touch(1, 100, 100));
    machine.pointerUp(touch(2, 200, 200));
    expect(handlers.onPlayerMove).not.toHaveBeenCalled();
  });

  it('allows a normal tap again after the multi-touch lifecycle ends', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerDown(touch(2, 200, 200));
    machine.pointerUp(touch(1, 100, 100));
    machine.pointerUp(touch(2, 200, 200));

    machine.pointerDown(touch(3, 100, 100));
    machine.pointerUp(touch(3, 100, 100));
    expect(handlers.onTap).toHaveBeenCalledTimes(1);
  });

  it('updates the camera while pinching', () => {
    const machine = build();
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerDown(touch(2, 200, 100));
    machine.pointerMove(touch(2, 300, 100));
    scheduler.flushFrames();

    expect(handlers.onPinch).toHaveBeenCalled();
    const camera = handlers.onPinch.mock.calls.at(-1)![0];
    expect(camera.zoom).toBeCloseTo(DEFAULT_CAMERA.zoom * 2, 5);
  });
});

// ----------------------------------------------------------------------------

describe('hold to move', () => {
  it('uses the shared HOLD_DURATION, not a private shorter constant', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));

    scheduler.advance(HOLD_DURATION - 1);
    expect(machine.current.kind).toBe('press');

    scheduler.advance(2);
    expect(machine.current).toEqual({ kind: 'move-player', playerId: 'p1' });
  });

  it('reports hold progress so the UI can show it', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));

    scheduler.advance(HOLD_DURATION / 2);
    scheduler.flushFrames();
    const reported = handlers.onHoldProgress.mock.calls.map(call => call[0]);
    expect(reported.some(value => value > 0 && value <= 1)).toBe(true);
  });

  it('cancels the hold once the pointer moves past the drag threshold', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerMove(touch(1, 100 + MOVE_THRESHOLD + 5, 100));

    expect(handlers.onHoldCancel).toHaveBeenCalled();
    scheduler.advance(HOLD_DURATION + 50);
    expect(machine.current.kind).not.toBe('move-player');
  });

  it('can be switched off, leaving explicit Move as the only path', () => {
    context.holdToMoveEnabled = false;
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));

    expect(handlers.onHoldStart).not.toHaveBeenCalled();
    scheduler.advance(HOLD_DURATION + 50);
    expect(machine.current.kind).toBe('press');
  });

  it('moves the player and reports the end of the gesture', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    scheduler.advance(HOLD_DURATION + 1);

    machine.pointerMove(touch(1, 160, 180));
    scheduler.flushFrames();
    expect(handlers.onPlayerMove).toHaveBeenCalledWith('p1', { x: 160, y: 180 });

    machine.pointerUp(touch(1, 160, 180));
    expect(handlers.onPlayerMoveEnd).toHaveBeenCalledWith('p1');
  });
});

// ----------------------------------------------------------------------------

describe('drawing a route', () => {
  it('keeps samples outside React and commits once on release', () => {
    const machine = build(playerHitTester('p1', false));
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerMove(touch(1, 140, 100));

    for (let x = 150; x <= 200; x += 10) {
      machine.pointerMove(touch(1, x, 100));
      scheduler.flushFrames();
    }

    expect(handlers.onRouteCommit).not.toHaveBeenCalled();
    expect(machine.transientRoute.length).toBeGreaterThan(1);

    machine.pointerUp(touch(1, 200, 100));
    expect(handlers.onRouteCommit).toHaveBeenCalledTimes(1);
    expect(handlers.onRouteCommit.mock.calls[0][0]).toBe('p1');
  });

  it('coalesces many pointer moves into one sample per animation frame', () => {
    const machine = build(playerHitTester('p1', false));
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerMove(touch(1, 140, 100));

    // Five moves, one frame: only the last position is sampled.
    for (let x = 150; x <= 190; x += 10) machine.pointerMove(touch(1, x, 100));
    scheduler.flushFrames();

    expect(handlers.onRouteSampling).toHaveBeenCalledTimes(1);
    expect(machine.transientRoute.at(-1)).toEqual({ x: 190, y: 100 });
  });

  it('does not commit a route that never left the press point', () => {
    const machine = build(playerHitTester('p1', false));
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerUp(touch(1, 100, 100));
    expect(handlers.onRouteCommit).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------

describe('puck drags', () => {
  it('previews and releases a carrier drag', () => {
    const machine = build(
      buildHitTester({
        playerAt: () => ({ id: 'carrier', isCarrier: true }),
        passReceiverAt: () => 'mate',
      })
    );

    machine.pointerDown(touch(1, 100, 100));
    machine.pointerMove(touch(1, 200, 150));
    scheduler.flushFrames();

    expect(handlers.onPuckDragPreview).toHaveBeenCalledWith(
      'carrier',
      { x: 100, y: 100 },
      { x: 200, y: 150 },
      'mate'
    );

    machine.pointerUp(touch(1, 200, 150));
    expect(handlers.onPuckDragRelease).toHaveBeenCalledWith(
      'carrier',
      { x: 100, y: 100 },
      { x: 200, y: 150 },
      'mate'
    );
  });

  it('starts a puck drag from a point on a route', () => {
    const machine = build(
      buildHitTester({
        routeAt: () => ({ pathId: 'r1', ownerId: 'owner', point: { x: 50, y: 60 } }),
      })
    );

    machine.pointerDown(touch(1, 100, 100));
    machine.pointerMove(touch(1, 200, 150));
    scheduler.flushFrames();

    expect(handlers.onPuckDragPreview).toHaveBeenCalledWith(
      'owner',
      { x: 50, y: 60 },
      { x: 200, y: 150 },
      null
    );
  });
});

// ----------------------------------------------------------------------------

describe('camera gestures on empty ice', () => {
  it('pans when flat', () => {
    const machine = build();
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerMove(touch(1, 150, 130));
    scheduler.flushFrames();

    expect(handlers.onPanOrOrbit).toHaveBeenCalledWith(
      expect.objectContaining({ x: DEFAULT_CAMERA.x + 50, y: DEFAULT_CAMERA.y + 30 })
    );
  });

  it('orbits when the tabletop is tilted', () => {
    context.isTabletop = true;
    const machine = build();
    machine.pointerDown(touch(1, 100, 100));
    machine.pointerMove(touch(1, 200, 100));
    scheduler.flushFrames();

    const camera = handlers.onPanOrOrbit.mock.calls.at(-1)![0];
    expect(camera.rotation).toBeCloseTo(0.6, 5);
  });
});

// ----------------------------------------------------------------------------

describe('edit handles', () => {
  it('drags a route control handle', () => {
    const controls = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    const machine = build(
      buildHitTester({ routeHandleAt: () => ({ pathId: 'r1', index: 1, controls }) })
    );

    machine.pointerDown(touch(1, 100, 100));
    machine.pointerMove(touch(1, 120, 130));
    scheduler.flushFrames();

    expect(handlers.onRouteHandleDrag).toHaveBeenCalledWith('r1', 1, controls, { x: 120, y: 130 });
    machine.pointerUp(touch(1, 120, 130));
    expect(handlers.onEditGestureEnd).toHaveBeenCalled();
  });

  it('drags an event bend handle', () => {
    const machine = build(
      buildHitTester({ eventHandleAt: () => ({ eventId: 'e1', part: 'bend' }) })
    );

    machine.pointerDown(touch(1, 100, 100));
    machine.pointerMove(touch(1, 120, 130));
    scheduler.flushFrames();

    expect(handlers.onEventHandleDrag).toHaveBeenCalledWith('e1', 'bend', { x: 120, y: 130 });
  });
});

// ----------------------------------------------------------------------------

describe('abort', () => {
  it('drops every pointer and cancels the gesture', () => {
    const machine = build(playerHitTester());
    machine.pointerDown(touch(1, 100, 100));
    machine.abort();

    expect(machine.current.kind).toBe('idle');
    expect(machine.pointers.size).toBe(0);
    expect(handlers.onGestureCancel).toHaveBeenCalled();
  });
});
