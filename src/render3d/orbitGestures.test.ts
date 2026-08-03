// ============================================================================
// ORBIT GESTURES
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  DRAG_ROTATION_SENSITIVITY,
  pointerDistance,
  rotationFromDrag,
  zoomFromPinch,
  zoomFromWheel,
} from './orbitGestures';
import { MAX_ZOOM, MIN_ZOOM } from '@/core/constants';

describe('rotationFromDrag', () => {
  it('leaves rotation unchanged for a zero-delta drag', () => {
    expect(rotationFromDrag(0.4, 0)).toBe(0.4);
  });

  it('scales by the documented sensitivity constant', () => {
    expect(rotationFromDrag(0, 100)).toBeCloseTo(100 * DRAG_ROTATION_SENSITIVITY, 10);
  });

  it('is additive from whatever rotation the drag started at, and reverses sign for a leftward drag', () => {
    expect(rotationFromDrag(1, 50)).toBeCloseTo(1 + 50 * DRAG_ROTATION_SENSITIVITY, 10);
    expect(rotationFromDrag(1, -50)).toBeCloseTo(1 - 50 * DRAG_ROTATION_SENSITIVITY, 10);
  });

  it('never touches tilt - it is a pure function of rotation and deltaX alone', () => {
    // Documented as a type-level contract: the signature has no tilt
    // parameter and returns a bare number, not a partial Camera.
    expect(typeof rotationFromDrag(0, 0)).toBe('number');
  });
});

describe('zoomFromWheel', () => {
  it('zooms in for a negative deltaY (scroll up), matching the 2D wheel handler', () => {
    expect(zoomFromWheel(1, -100)).toBeGreaterThan(1);
  });

  it('zooms out for a positive deltaY (scroll down)', () => {
    expect(zoomFromWheel(1, 100)).toBeLessThan(1);
  });

  it('leaves zoom unchanged for a zero delta', () => {
    expect(zoomFromWheel(2, 0)).toBeCloseTo(2, 10);
  });

  it('clamps at MAX_ZOOM for a huge zoom-in tick', () => {
    expect(zoomFromWheel(MAX_ZOOM, -100000)).toBe(MAX_ZOOM);
  });

  it('clamps at MIN_ZOOM for a huge zoom-out tick', () => {
    expect(zoomFromWheel(MIN_ZOOM, 100000)).toBe(MIN_ZOOM);
  });
});

describe('pointerDistance', () => {
  it('is the Euclidean distance between two points (3-4-5 triangle)', () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('is zero for coincident points', () => {
    expect(pointerDistance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0);
  });
});

describe('zoomFromPinch', () => {
  it('doubles zoom when the pinch span doubles', () => {
    expect(zoomFromPinch(1, 100, 200)).toBeCloseTo(2, 10);
  });

  it('halves zoom when the pinch span halves', () => {
    expect(zoomFromPinch(2, 200, 100)).toBeCloseTo(1, 10);
  });

  it('leaves zoom unchanged when the span has not moved', () => {
    expect(zoomFromPinch(1.5, 150, 150)).toBeCloseTo(1.5, 10);
  });

  it('clamps at MAX_ZOOM/MIN_ZOOM the same as the wheel path', () => {
    expect(zoomFromPinch(MAX_ZOOM, 100, 10000)).toBe(MAX_ZOOM);
    expect(zoomFromPinch(MIN_ZOOM, 100, 0.001)).toBe(MIN_ZOOM);
  });

  it('guards against a degenerate (near-zero) starting distance instead of dividing by ~0', () => {
    expect(Number.isFinite(zoomFromPinch(1, 0, 50))).toBe(true);
  });
});
