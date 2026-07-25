// ============================================================================
// CAMERA STORE
//
// These assertions are the reducer's camera tests, moved verbatim to the store
// that now owns the camera. The behaviour is unchanged - only the owner moved,
// so a pan or a pinch no longer republishes application state.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { CameraStore } from './CameraStore';
import { calculateFitCamera, effectiveDevicePixelRatio, normalizeCamera } from './cameraMath';
import { DEFAULT_CAMERA, MAX_ZOOM, MIN_ZOOM, RINK, TABLETOP_MAX_TILT } from '@/core/constants';

let store: CameraStore;

beforeEach(() => {
  store = new CameraStore();
});

describe('viewport fitting', () => {
  it('fits the rink on the first real canvas size', () => {
    store.setViewport(1000, 500);
    expect(store.getSnapshot().userAdjusted).toBe(false);
    expect(store.camera.zoom).toBeGreaterThan(0);
  });

  it('ignores a zero-sized canvas', () => {
    store.setViewport(0, 0);
    expect(store.camera).toEqual(DEFAULT_CAMERA);
  });

  it('keeps re-fitting on resize until the user takes over', () => {
    // The first layout pass reports a stale height. Fitting only once left the
    // rink cropped, because the corrected size arrived on a later resize.
    store.setViewport(1000, 900);
    const tooTall = store.camera.zoom;

    store.setViewport(1000, 400);
    expect(store.camera.zoom).not.toBe(tooTall);
    expect(store.camera.zoom).toBeCloseTo(calculateFitCamera({ width: 1000, height: 400 }).zoom, 6);
  });

  it('always fits the whole rink inside the canvas', () => {
    for (const [width, height] of [
      [320, 568],
      [667, 375],
      [844, 390],
      [768, 1024],
      [1366, 768],
    ]) {
      const fresh = new CameraStore();
      fresh.setViewport(width, height);
      const { zoom } = fresh.camera;
      expect(RINK.width * zoom).toBeLessThanOrEqual(width);
      expect(RINK.height * zoom).toBeLessThanOrEqual(height);
    }
  });

  it('leaves the camera alone on resize once the user has panned or zoomed', () => {
    store.setViewport(1000, 500);
    store.setCamera({ ...store.camera, x: 42, y: 24 });

    store.setViewport(800, 400);
    expect(store.camera.x).toBe(42);
    expect(store.camera.y).toBe(24);
  });

  it('hands control back to auto-fit when the user asks for the full rink', () => {
    store.setViewport(1000, 500);
    store.setCamera({ ...store.camera, x: 42 });
    expect(store.getSnapshot().userAdjusted).toBe(true);

    store.fit();
    expect(store.getSnapshot().userAdjusted).toBe(false);
  });

  it('centres the rink when fitted', () => {
    store.setViewport(1000, 1000);
    const { camera } = store;
    const drawnHeight = RINK.height * camera.zoom;
    expect(camera.y).toBeCloseTo((1000 - drawnHeight) / 2, 6);
  });

  it('does not republish for a viewport that has not changed', () => {
    store.setViewport(1000, 500);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.setViewport(1000, 500);
    expect(notifications).toBe(0);
  });
});

describe('zoom', () => {
  it('clamps zoom to the allowed range', () => {
    store.setCamera({ ...DEFAULT_CAMERA, zoom: 9999 });
    expect(store.camera.zoom).toBe(MAX_ZOOM);

    store.setCamera({ ...DEFAULT_CAMERA, zoom: 0.0001 });
    expect(store.camera.zoom).toBe(MIN_ZOOM);
  });

  it('keeps the anchor point fixed when zooming at a point', () => {
    store.setViewport(1000, 500);
    const before = store.camera;
    const anchor = { x: 400, y: 250 };
    const worldBefore = {
      x: (anchor.x - before.x) / before.zoom,
      y: (anchor.y - before.y) / before.zoom,
    };

    store.zoomAt(1.5, anchor);

    const after = store.camera;
    const worldAfter = {
      x: (anchor.x - after.x) / after.zoom,
      y: (anchor.y - after.y) / after.zoom,
    };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  it('clamps tilt to the tabletop maximum', () => {
    store.setCamera({ ...DEFAULT_CAMERA, tilt: 99 });
    expect(store.camera.tilt).toBe(TABLETOP_MAX_TILT);

    store.setCamera({ ...DEFAULT_CAMERA, tilt: -5 });
    expect(store.camera.tilt).toBe(0);
  });
});

describe('zones', () => {
  it('centres the offensive zone right of the defensive zone', () => {
    store.setViewport(1000, 500);
    store.zoomToZone('offensive');
    const offensive = store.camera.x;

    store.zoomToZone('defensive');
    expect(store.camera.x).toBeGreaterThan(offensive);
  });

  it('fits the whole rink for the full zone, and re-enables auto-fit', () => {
    store.setViewport(1000, 500);
    store.zoomToZone('offensive');
    expect(store.getSnapshot().userAdjusted).toBe(true);

    store.zoomToZone('full');
    expect(store.getSnapshot().userAdjusted).toBe(false);
    expect(store.camera.zoom).toBeCloseTo(calculateFitCamera({ width: 1000, height: 500 }).zoom, 6);
  });

  it('keeps the tabletop lean across a zone change', () => {
    store.setViewport(1000, 500);
    store.setCamera({ ...store.camera, tilt: 0.8, rotation: -0.4 });
    store.zoomToZone('offensive');
    expect(store.camera.tilt).toBeCloseTo(0.8, 6);
    expect(store.camera.rotation).toBeCloseTo(-0.4, 6);
  });
});

describe('subscription', () => {
  it('notifies subscribers and stops after unsubscribe', () => {
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.setCamera({ ...DEFAULT_CAMERA, x: 10 });
    expect(notifications).toBe(1);

    unsubscribe();
    store.setCamera({ ...DEFAULT_CAMERA, x: 20 });
    expect(notifications).toBe(1);
  });

  it('returns a stable snapshot between changes', () => {
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    store.setCamera({ ...DEFAULT_CAMERA, x: 5 });
    expect(store.getSnapshot()).not.toBe(first);
  });

  it('resets to the default camera, keeping the measured viewport', () => {
    store.setViewport(1000, 500);
    store.setCamera({ ...DEFAULT_CAMERA, x: 99 });
    store.reset();

    expect(store.camera).toEqual(DEFAULT_CAMERA);
    expect(store.viewport).toEqual({ width: 1000, height: 500 });
  });
});

describe('normalizeCamera', () => {
  it('defaults a missing tilt to zero', () => {
    expect(normalizeCamera({ x: 0, y: 0, zoom: 1 }).tilt).toBe(0);
  });
});

describe('effectiveDevicePixelRatio', () => {
  it('caps at 2 so a DPR 3 phone does not render 9x the pixels', () => {
    expect(effectiveDevicePixelRatio(3)).toBe(2);
    expect(effectiveDevicePixelRatio(4)).toBe(2);
  });

  it('passes through a ratio below the cap', () => {
    expect(effectiveDevicePixelRatio(1)).toBe(1);
    expect(effectiveDevicePixelRatio(1.5)).toBe(1.5);
  });

  it('steps down under sustained frame pressure', () => {
    expect(effectiveDevicePixelRatio(3, 'medium')).toBe(1.5);
    expect(effectiveDevicePixelRatio(3, 'low')).toBe(1);
  });

  it('survives a nonsense ratio', () => {
    expect(effectiveDevicePixelRatio(Number.NaN)).toBe(1);
    expect(effectiveDevicePixelRatio(0)).toBe(1);
    expect(effectiveDevicePixelRatio(-2)).toBe(1);
  });
});
