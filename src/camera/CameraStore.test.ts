// ============================================================================
// CAMERA STORE
//
// These assertions are the reducer's camera tests, moved verbatim to the store
// that now owns the camera. The behaviour is unchanged - only the owner moved,
// so a pan or a pinch no longer republishes application state.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { CameraStore } from './CameraStore';
import { calculateFitCamera, effectiveDevicePixelRatio, normalizeCamera, rinkRegion } from './cameraMath';
import { applyAffine, cameraMatrix } from '@/utils/geometry';
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
      const { zoom, rotation } = fresh.camera;

      // The footprint depends on which way the board is laid out: turned, the
      // rink is 425 wide and 1000 tall on screen rather than the reverse.
      const cos = Math.abs(Math.cos(rotation ?? 0));
      const sin = Math.abs(Math.sin(rotation ?? 0));
      const onScreenWidth = (RINK.width * cos + RINK.height * sin) * zoom;
      const onScreenHeight = (RINK.width * sin + RINK.height * cos) * zoom;

      expect(onScreenWidth, `${width}x${height} width`).toBeLessThanOrEqual(width);
      expect(onScreenHeight, `${width}x${height} height`).toBeLessThanOrEqual(height);
    }
  });

  // --------------------------------------------------------------------------
  // Portrait
  //
  // Fitting a 1000x425 sheet horizontally into an upright phone leaves a strip
  // about a quarter of the screen high in a large decorative stage. This is the
  // §8.1 finding, and these tests are what stop it coming back.
  // --------------------------------------------------------------------------

  it('turns the board upright on a portrait phone', () => {
    const fresh = new CameraStore();
    fresh.setViewport(390, 640);

    expect(fresh.boardOrientation).toBe('vertical');
  });

  it('leaves the board flat in landscape', () => {
    const fresh = new CameraStore();
    fresh.setViewport(844, 390);

    expect(fresh.boardOrientation).toBe('horizontal');
  });

  it('leaves the board flat on a desktop', () => {
    const fresh = new CameraStore();
    fresh.setViewport(1366, 768);

    expect(fresh.boardOrientation).toBe('horizontal');
  });

  it('gives a portrait phone most of its height, rather than a quarter of it', () => {
    const fresh = new CameraStore();
    fresh.setViewport(390, 640);
    const { zoom } = fresh.camera;

    // Turned, the long axis of the rink runs down the screen.
    const usedHeight = (RINK.width * zoom) / 640;
    expect(usedHeight).toBeGreaterThan(0.9);
  });

  it('shows far more ice turned than flat on the same phone', () => {
    const turned = new CameraStore();
    turned.setViewport(390, 640);

    const flat = new CameraStore();
    flat.setViewport(390, 640);
    flat.setBoardOrientation('horizontal');

    expect(turned.camera.zoom).toBeGreaterThan(flat.camera.zoom * 1.5);
  });

  it('can be turned by hand, and keeps auto-fit alive', () => {
    const fresh = new CameraStore();
    fresh.setViewport(1366, 768);
    fresh.setBoardOrientation('vertical');

    expect(fresh.boardOrientation).toBe('vertical');
    // Choosing an orientation says something about the BOARD, not about where
    // the camera is pointed, so a later resize still refits.
    fresh.setViewport(390, 640);
    expect(fresh.camera.zoom).toBeGreaterThan(0);
  });

  it('does not touch the tabletop, whose rotation is an orbit angle', () => {
    const fresh = new CameraStore();
    fresh.setViewport(1366, 768);
    fresh.setCamera({ ...fresh.camera, tilt: 0.7, rotation: 0.4 });
    fresh.fit();

    expect(fresh.camera.rotation).toBeCloseTo(0.4, 6);
    expect(fresh.camera.tilt).toBeCloseTo(0.7, 6);
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

  it('frames the real zone, from the end boards to the blue line', () => {
    const region = rinkRegion('defensive');

    // The old implementation hard-coded a zoom of 2 and centred on 38% of the
    // rink's length - numbers unrelated to where the blue line actually is.
    expect(region.x).toBe(RINK.x);
    expect(region.width).toBeGreaterThan(RINK.blueLineLeftX - RINK.x);
    expect(region.width).toBeLessThan(RINK.width / 2);
  });

  it('mirrors the two ends', () => {
    const left = rinkRegion('defensive');
    const right = rinkRegion('offensive');

    expect(left.width).toBeCloseTo(right.width, 6);
    expect(right.x + right.width).toBeCloseTo(RINK.x + RINK.width, 6);
  });

  it('puts the zone centre in the middle of the viewport', () => {
    store.setViewport(1000, 500);
    store.zoomToZone('offensive');

    const { camera } = store;
    const region = rinkRegion('offensive');
    const screen = applyAffine(
      cameraMatrix(camera),
      region.x + region.width / 2,
      region.y + region.height / 2
    );

    expect(screen.x).toBeCloseTo(500, 3);
    expect(screen.y).toBeCloseTo(250, 3);
  });

  it('shows a zone larger than the whole sheet does', () => {
    store.setViewport(1000, 500);
    store.zoomToZone('full');
    const full = store.camera.zoom;

    store.zoomToZone('offensive');
    expect(store.camera.zoom).toBeGreaterThan(full);
  });

  it('does not turn the board for a zone, which is nearly square', () => {
    // A full sheet is 2.35:1 and wants turning on an upright phone. An end
    // zone is 435x425, so turning it would gain nothing and cost the coach
    // their bearings.
    const fresh = new CameraStore();
    fresh.setViewport(390, 640);
    expect(fresh.boardOrientation).toBe('vertical');

    fresh.zoomToZone('offensive');
    expect(fresh.boardOrientation).toBe('horizontal');
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

describe('zone tracking', () => {
  it('starts at full', () => {
    expect(new CameraStore().zone).toBe('full');
  });
  it('follows zoomToZone and resets on fit', () => {
    const store = new CameraStore();
    store.setViewport(390, 700);
    store.zoomToZone('offensive');
    expect(store.zone).toBe('offensive');
    store.fit();
    expect(store.zone).toBe('full');
  });
  it('goes custom when the user pans or pinch-zooms', () => {
    const store = new CameraStore();
    store.setViewport(390, 700);
    store.zoomToZone('defensive');
    store.zoomAt(1.2, { x: 100, y: 100 });
    expect(store.zone).toBe('custom');
  });
  it('is part of the snapshot so React can subscribe', () => {
    const store = new CameraStore();
    store.zoomToZone('offensive');
    expect(store.getSnapshot().zone).toBe('offensive');
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
