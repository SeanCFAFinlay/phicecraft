// ============================================================================
// ORBIT GESTURES
//
// Pure math for Board3D's own pointer input: drag-to-orbit, wheel-to-zoom,
// and two-finger pinch-to-zoom. Extracted out of Board3D.tsx so the
// arithmetic is unit-testable without a DOM or a WebGL context - Board3D
// itself is not (see loadBoard3D.dom.test.ts's own comment) - and so it
// shares the SAME zoom clamps and wheel sensitivity the flat 2D board's own
// gestures use (CanvasSurface.tsx's wheel handler; GestureStateMachine.ts's
// pinch), rather than a second, drifting copy of either.
//
// Board3D is a view-only presentation (no editing affordances - see
// AppShell.tsx/CanvasSurface.tsx's own comments on that split): every
// function here only ever produces a `rotation` or a `zoom`, never a `tilt` -
// writing tilt from a drag would silently un-tilt the board out of the
// tabletop view Board3D exists to show.
// ============================================================================

import { clamp } from '@/utils/geometry';
import { MAX_ZOOM, MIN_ZOOM, WHEEL_ZOOM_SENSITIVITY } from '@/core/constants';

export interface PointerPoint {
  x: number;
  y: number;
}

/**
 * Radians of azimuth per screen pixel of horizontal drag. Tuned so a drag
 * across roughly a third of a phone's width (~130px) spins the rink about a
 * quarter turn (~90 deg = 1.57rad / 130 ~= 0.012) - direct enough to feel like
 * grabbing the rink, not so twitchy that a small correction overshoots.
 */
export const DRAG_ROTATION_SENSITIVITY = 0.012;

/**
 * The azimuth (`camera.rotation`) after a horizontal drag of `deltaX` screen
 * pixels away from the drag's own starting rotation. Never derives or
 * returns a tilt - callers must spread the rest of the current camera
 * unchanged (see the module header).
 */
export function rotationFromDrag(startRotation: number, deltaX: number): number {
  return startRotation + deltaX * DRAG_ROTATION_SENSITIVITY;
}

/**
 * The zoom after a wheel tick of `deltaY`, using the exact formula and
 * sensitivity CanvasSurface's own native wheel handler applies to the flat 2D
 * camera (`WHEEL_ZOOM_SENSITIVITY`, `src/core/constants.ts`), clamped to the
 * same `MIN_ZOOM`/`MAX_ZOOM` every camera path respects.
 */
export function zoomFromWheel(currentZoom: number, deltaY: number): number {
  return clamp(currentZoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY), MIN_ZOOM, MAX_ZOOM);
}

/** Euclidean distance between two pointer points - the pinch span. */
export function pointerDistance(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The zoom for a pinch that started at `startZoom` with fingers `startDistance`
 * apart and has spread to `currentDistance` - the same ratio-of-spans math
 * `GestureStateMachine.ts`'s pinch handling uses for the flat 2D camera
 * (`scale = currentDistance / startDistance`), applied to Board3D's zoom
 * alone: an orbit camera has no pan/midpoint term to solve for the way the
 * flat camera's `x`/`y` translation does.
 */
export function zoomFromPinch(startZoom: number, startDistance: number, currentDistance: number): number {
  const scale = currentDistance / Math.max(startDistance, 1);
  return clamp(startZoom * scale, MIN_ZOOM, MAX_ZOOM);
}
