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
}

const INITIAL: CameraSnapshot = {
  camera: { ...DEFAULT_CAMERA },
  viewport: { width: 0, height: 0 },
  userAdjusted: false,
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

  private commit(next: CameraSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  /** A deliberate camera change by the user. Disables auto-fit. */
  setCamera(camera: Camera): void {
    this.commit({ ...this.snapshot, camera: normalizeCamera(camera), userAdjusted: true });
  }

  /** Show the whole rink, and hand control back to auto-fit. */
  fit(): void {
    this.commit({
      ...this.snapshot,
      camera: calculateFitCamera(this.snapshot.viewport, this.snapshot.camera),
      userAdjusted: false,
    });
  }

  zoomAt(factor: number, screenPoint: { x: number; y: number }): void {
    this.commit({
      ...this.snapshot,
      camera: normalizeCamera(zoomAt(this.snapshot.camera, factor, screenPoint)),
      userAdjusted: true,
    });
  }

  zoomToZone(zone: Zone): void {
    this.commit({
      ...this.snapshot,
      camera: normalizeCamera(cameraForZone(zone, this.snapshot.viewport, this.snapshot.camera)),
      // "Show me everything" is the one zoom that keeps auto-fit alive.
      userAdjusted: zone !== 'full',
    });
  }

  setViewport(width: number, height: number): void {
    const { viewport, userAdjusted, camera } = this.snapshot;
    if (viewport.width === width && viewport.height === height) return;

    const shouldFit = !userAdjusted && width > 0 && height > 0;
    this.commit({
      camera: shouldFit ? calculateFitCamera({ width, height }, camera) : camera,
      viewport: { width, height },
      userAdjusted,
    });
  }

  reset(): void {
    this.commit({ ...INITIAL, viewport: this.snapshot.viewport });
  }
}
