// ============================================================================
// ORBIT
// ============================================================================

import { describe, it, expect } from 'vitest';
import { orbitFromCamera, BASE_DISTANCE } from './orbit';
import { rinkToWorld } from './worldMap';
import { DEFAULT_CAMERA, RINK, TABLETOP_DEFAULT_TILT } from '@/core/constants';
import type { Camera } from '@/core/types';

const VIEWPORT_16_9 = { width: 1600, height: 900 };

describe('BASE_DISTANCE', () => {
  it('is the documented constant', () => {
    expect(BASE_DISTANCE).toBe(42);
  });
});

describe('orbitFromCamera', () => {
  it('reads azimuth straight from camera.rotation, defaulting to 0', () => {
    const withRotation: Camera = { ...DEFAULT_CAMERA, rotation: 1.2 };
    expect(orbitFromCamera(withRotation, VIEWPORT_16_9).azimuth).toBe(1.2);

    const noRotation: Camera = { ...DEFAULT_CAMERA, rotation: undefined };
    expect(orbitFromCamera(noRotation, VIEWPORT_16_9).azimuth).toBe(0);
  });

  it('clamps tilt 0 near top-down (the flat 2D view)', () => {
    const camera: Camera = { ...DEFAULT_CAMERA, tilt: 0 };
    const { polar } = orbitFromCamera(camera, VIEWPORT_16_9);
    // PI/2 - 0*1.05 = PI/2, clamped down to the PI/2 - 0.12 ceiling.
    expect(polar).toBeCloseTo(Math.PI / 2 - 0.12, 10);
  });

  it('matches the documented ~33° elevation at the default tabletop tilt (0.95)', () => {
    const camera: Camera = { ...DEFAULT_CAMERA, tilt: TABLETOP_DEFAULT_TILT };
    const { polar } = orbitFromCamera(camera, VIEWPORT_16_9);
    // PI/2 - 0.95*1.05 = PI/2 - 0.9975
    expect(polar).toBeCloseTo(Math.PI / 2 - 0.9975, 10);
    expect(polar * (180 / Math.PI)).toBeCloseTo(32.83, 1);
  });

  it('clamps polar at the 0.15 floor for an extreme tilt beyond the UI range', () => {
    const camera: Camera = { ...DEFAULT_CAMERA, tilt: 2 };
    const { polar } = orbitFromCamera(camera, VIEWPORT_16_9);
    expect(polar).toBe(0.15);
  });

  it('halves distance when zoom doubles (distance = BASE_DISTANCE / zoom)', () => {
    const zoomOne: Camera = { ...DEFAULT_CAMERA, zoom: 1 };
    const zoomTwo: Camera = { ...DEFAULT_CAMERA, zoom: 2 };
    const atOne = orbitFromCamera(zoomOne, VIEWPORT_16_9).distance;
    const atTwo = orbitFromCamera(zoomTwo, VIEWPORT_16_9).distance;

    expect(atOne).toBe(BASE_DISTANCE);
    expect(atTwo).toBeCloseTo(atOne / 2, 10);
  });

  it('targets rinkToWorld(camera.x, camera.y)', () => {
    const camera: Camera = { ...DEFAULT_CAMERA, x: 12, y: -7 };
    const { target } = orbitFromCamera(camera, VIEWPORT_16_9);
    expect(target).toEqual(rinkToWorld({ x: 12, y: -7 }));
  });

  it('targets the world origin when camera.x/y sit on centre ice', () => {
    const camera: Camera = { ...DEFAULT_CAMERA, x: RINK.centerX, y: RINK.centerY };
    const { target } = orbitFromCamera(camera, VIEWPORT_16_9);
    expect(target).toEqual({ x: 0, y: 0, z: 0 });
  });
});
