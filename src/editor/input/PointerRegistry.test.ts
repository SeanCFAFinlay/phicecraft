// ============================================================================
// POINTER REGISTRY - tap suppression across a multi-touch lifecycle
//
// P0: "Pinch release cannot become a tap/edit."
//
// The old code cleared the pinch gesture as soon as fewer than two pointers
// remained, so lifting the first finger left the second one looking like an
// ordinary press - and its release ran the tap handler. With Erase active that
// deleted whatever was underneath.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { PointerRegistry } from './PointerRegistry';

let registry: PointerRegistry;

const at = (pointerId: number, x = 0, y = 0) => ({
  pointerId,
  position: { x, y },
  pointerType: 'touch' as const,
});

beforeEach(() => {
  registry = new PointerRegistry();
});

describe('single pointer', () => {
  it('allows a tap for an ordinary press and release', () => {
    registry.down(at(1));
    expect(registry.tapsSuppressed).toBe(false);
    expect(registry.up(1)).toEqual({ allowTap: true, remaining: 0 });
  });

  it('tracks position through moves', () => {
    registry.down(at(1, 10, 10));
    expect(registry.move(1, { x: 40, y: 50 })).toBe(true);
    expect(registry.positions()).toEqual([{ x: 40, y: 50 }]);
  });

  it('ignores a move for a pointer that is not down', () => {
    expect(registry.move(9, { x: 1, y: 1 })).toBe(false);
  });
});

describe('pinch then sequential release', () => {
  it('suppresses the tap for BOTH releases', () => {
    registry.down(at(1));
    registry.down(at(2));
    expect(registry.isMultiTouch).toBe(true);
    expect(registry.tapsSuppressed).toBe(true);

    // First finger up: one pointer remains, and it is still not a tap.
    const first = registry.up(1);
    expect(first).toEqual({ allowTap: false, remaining: 1 });
    expect(registry.tapsSuppressed).toBe(true);

    // Second finger up: this is the release that used to become a tap.
    const second = registry.up(2);
    expect(second).toEqual({ allowTap: false, remaining: 0 });
  });

  it('re-arms cleanly for the next single-finger press', () => {
    registry.down(at(1));
    registry.down(at(2));
    registry.up(1);
    registry.up(2);
    expect(registry.tapsSuppressed).toBe(false);

    registry.down(at(3));
    expect(registry.up(3).allowTap).toBe(true);
  });
});

describe('pinch then simultaneous release', () => {
  it('suppresses both, whichever order they arrive in', () => {
    registry.down(at(1));
    registry.down(at(2));

    expect(registry.up(2).allowTap).toBe(false);
    expect(registry.up(1).allowTap).toBe(false);
  });
});

describe('interrupted and cancelled multi-touch', () => {
  it('keeps suppression when a pointer is cancelled mid-pinch', () => {
    registry.down(at(1));
    registry.down(at(2));

    expect(registry.cancel(1)).toEqual({ remaining: 1 });
    expect(registry.tapsSuppressed).toBe(true);
    expect(registry.up(2).allowTap).toBe(false);
  });

  it('suppresses a release after a cancel took the count to one', () => {
    registry.down(at(1));
    registry.down(at(2));
    registry.down(at(3));

    registry.cancel(3);
    expect(registry.up(2).allowTap).toBe(false);
    expect(registry.up(1).allowTap).toBe(false);
  });

  it('clears suppression once the last pointer is cancelled', () => {
    registry.down(at(1));
    registry.down(at(2));
    registry.cancel(1);
    registry.cancel(2);
    expect(registry.tapsSuppressed).toBe(false);
  });

  it('a third finger arriving keeps the lifecycle suppressed', () => {
    registry.down(at(1));
    registry.down(at(2));
    registry.up(1);
    registry.down(at(3));
    expect(registry.tapsSuppressed).toBe(true);
    expect(registry.up(2).allowTap).toBe(false);
    expect(registry.up(3).allowTap).toBe(false);
  });
});

describe('clear', () => {
  it('drops every pointer and disarms suppression', () => {
    registry.down(at(1));
    registry.down(at(2));
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.tapsSuppressed).toBe(false);
  });
});
