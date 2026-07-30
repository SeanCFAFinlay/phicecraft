// ============================================================================
// CAMERA STORE
//
// The camera changes on every pointer move during a pan and on every frame of
// a pinch. Keeping it in application state meant every panel, toolbar and
// toast re-rendered on each of those. It lives here instead: the canvas
// subscribes directly, and React only reads it where a value is actually
// displayed.
// ============================================================================

import type { Camera } from '@/core/types';
import { DEFAULT_CAMERA } from '@/core/constants';
import {
  autoBoardRotation,
  BOARD_ROTATION_HORIZONTAL,
  BOARD_ROTATION_VERTICAL,
  calculateFitCamera,
  cameraForZone,
  normalizeCamera,
  zoomAt,
  type Viewport,
  type Zone,
} from './cameraMath';

export interface CameraSnapshot {
  camera: Camera;
  viewport: Viewport;
  /**
   * Set once the user pans or zooms by hand. Until then the camera re-fits on
   * every resize, because the first layout pass reports a stale size and
   * fitting only once leaves the rink cropped.
   */
  userAdjusted: boolean;
  /**
   * The named view the camera currently frames, or `'custom'` once the coach
   * has panned or pinch-zoomed away from one. `ViewControls` and `MenuSheet`
   * both read this instead of keeping their own idea of "which zone" - the
   * two used to disagree, because only one of them updated on a tap.
   */
  zone: Zone | 'custom';
}

const INITIAL: CameraSnapshot = {
  camera: { ...DEFAULT_CAMERA },
  viewport: { width: 0, height: 0 },
  userAdjusted: false,
  zone: 'full',
};

export class CameraStore {
  private snapshot: CameraSnapshot = INITIAL;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CameraSnapshot => this.snapshot;

  get camera(): Camera {
    return this.snapshot.camera;
  }

  get viewport(): Viewport {
    return this.snapshot.viewport;
  }

  /** The named view currently framed, or `'custom'` once panned or zoomed by hand. */
  get zone(): Zone | 'custom' {
    return this.snapshot.zone;
  }

  private commit(next: CameraSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  /** A deliberate camera change by the user. Disables auto-fit. */
  setCamera(camera: Camera): void {
    this.commit({
      ...this.snapshot,
      camera: normalizeCamera(camera),
      userAdjusted: true,
      zone: 'custom',
    });
  }

  /**
   * Show the whole rink, and hand control back to auto-fit.
   *
   * Also re-picks the board orientation, because "show me everything" on a
   * phone held upright means turning the sheet, not shrinking it to a strip.
   * The tabletop is left alone: its rotation is the angle the coach has
   * orbited to, not a fit decision.
   */
  fit(): void {
    const { viewport, camera } = this.snapshot;
    const base = this.isTabletop(camera)
      ? camera
      : { ...camera, rotation: autoBoardRotation(viewport) };

    this.commit({
      ...this.snapshot,
      camera: calculateFitCamera(viewport, base),
      userAdjusted: false,
      zone: 'full',
    });
  }

  /** True while the board is tilted into the tabletop view. */
  private isTabletop(camera: Camera): boolean {
    return (camera.tilt ?? 0) > 0.01;
  }

  /**
   * Turn the board by hand.
   *
   * Auto-fit stays alive: choosing an orientation is a statement about the
   * BOARD, not about where the camera is pointed, so a later resize still
   * refits. Rotating is not the same as panning away and losing the fit.
   */
  setBoardOrientation(orientation: 'horizontal' | 'vertical'): void {
    const rotation =
      orientation === 'vertical' ? BOARD_ROTATION_VERTICAL : BOARD_ROTATION_HORIZONTAL;
    const { viewport, camera } = this.snapshot;

    this.commit({
      ...this.snapshot,
      camera: calculateFitCamera(viewport, { ...camera, rotation }),
      userAdjusted: false,
    });
  }

  /** Which way the board is currently laid out. */
  get boardOrientation(): 'horizontal' | 'vertical' {
    return Math.abs(this.snapshot.camera.rotation ?? 0) > Math.PI / 4 ? 'vertical' : 'horizontal';
  }

  zoomAt(factor: number, screenPoint: { x: number; y: number }): void {
    this.commit({
      ...this.snapshot,
      camera: normalizeCamera(zoomAt(this.snapshot.camera, factor, screenPoint)),
      userAdjusted: true,
      zone: 'custom',
    });
  }

  zoomToZone(zone: Zone): void {
    this.commit({
      ...this.snapshot,
      camera: normalizeCamera(cameraForZone(zone, this.snapshot.viewport, this.snapshot.camera)),
      // "Show me everything" is the one zoom that keeps auto-fit alive.
      userAdjusted: zone !== 'full',
      zone,
    });
  }

  setViewport(width: number, height: number): void {
    const { viewport, userAdjusted, camera, zone } = this.snapshot;
    if (viewport.width === width && viewport.height === height) return;

    const shouldFit = !userAdjusted && width > 0 && height > 0;
    // Rotating with the viewport is part of fitting: a phone turned upright
    // should not be handed a rink a quarter of the screen high.
    const base =
      shouldFit && !this.isTabletop(camera)
        ? { ...camera, rotation: autoBoardRotation({ width, height }) }
        : camera;

    this.commit({
      camera: shouldFit ? calculateFitCamera({ width, height }, base) : camera,
      viewport: { width, height },
      userAdjusted,
      // Auto-fit refresh is not a user zone change, so it is left alone.
      zone,
    });
  }

  reset(): void {
    this.commit({ ...INITIAL, viewport: this.snapshot.viewport });
  }
}
