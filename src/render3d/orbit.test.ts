// ============================================================================
// ORBIT
// ============================================================================

import { describe, it, expect } from 'vitest';
import { orbitFromCamera, ORBIT_FOV_DEGREES } from './orbit';
import * as THREE from 'three';
import { rinkToWorld } from './worldMap';
import { DEFAULT_CAMERA, TABLETOP_DEFAULT_TILT } from '@/core/constants';
import { calculateFitCamera } from '@/camera/cameraMath';
import { cameraMatrix, applyAffine } from '@/utils/geometry';
import type { Camera } from '@/core/types';

const VIEWPORT_16_9 = { width: 1600, height: 900 };

describe('orbitFromCamera', () => {
  it('fits all rink and glass corners in side, net and top views on desktop and phone', () => {
    for (const viewport of [{ width: 1366, height: 520 }, { width: 390, height: 600 }]) {
      for (const [rotation, tilt] of [[0, 0.65], [-0.4, 0.55], [Math.PI / 2, 0.65], [0, 0.35]]) {
        const orbit = orbitFromCamera(calculateFitCamera(viewport, { ...DEFAULT_CAMERA, rotation, tilt }), viewport);
        const camera = new THREE.PerspectiveCamera(ORBIT_FOV_DEGREES, viewport.width / viewport.height, 0.1, 500);
        const horizontal = orbit.distance * Math.cos(orbit.polar);
        camera.position.set(horizontal * Math.sin(orbit.azimuth), orbit.distance * Math.sin(orbit.polar), horizontal * Math.cos(orbit.azimuth));
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        for (const x of [-30.5, 30.5]) for (const z of [-12.9625, 12.9625]) for (const y of [0, 2.5]) {
          const point = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(point.x)).toBeLessThanOrEqual(0.901);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(0.901);
        }
      }
    }
  });
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

  it('halves distance when zoom doubles', () => {
    const zoomOne: Camera = { ...DEFAULT_CAMERA, zoom: 1 };
    const zoomTwo: Camera = { ...DEFAULT_CAMERA, zoom: 2 };
    const atOne = orbitFromCamera(zoomOne, VIEWPORT_16_9).distance;
    const atTwo = orbitFromCamera(zoomTwo, VIEWPORT_16_9).distance;

    expect(atOne).toBeGreaterThan(0);
    expect(atTwo).toBeCloseTo(atOne / 2, 10);
  });

  // Worked example (a): the default fitted camera centres the WHOLE rink in
  // the viewport, so the rink point under screen centre is centre ice itself
  // - the orbit target should be the world origin, regardless of viewport
  // size or aspect.
  it('targets centre ice (the world origin) for the default fitted camera', () => {
    const camera = calculateFitCamera(VIEWPORT_16_9);
    const { target } = orbitFromCamera(camera, VIEWPORT_16_9);
    expect(target.x).toBeCloseTo(0, 9);
    expect(target.y).toBeCloseTo(0, 9);
    expect(target.z).toBeCloseTo(0, 9);
  });

  // Worked example (b): a camera panned so an arbitrary rink point sits at
  // screen centre. The panned camera is built by using `cameraMatrix`/
  // `applyAffine` themselves (the exact functions `orbitFromCamera` now
  // inverts via `screenToWorld`) to measure the pan needed, rather than
  // hand-deriving a closed-form camera.x/y - so this test cannot silently
  // drift from the real math the way the old, circular assertions did.
  it('targets rinkToWorld(p) when the camera is panned so rink point p sits at screen centre', () => {
    const rinkPoint = { x: 750, y: 212.5 };
    const screenCentre = { x: VIEWPORT_16_9.width / 2, y: VIEWPORT_16_9.height / 2 };

    const base: Camera = { ...DEFAULT_CAMERA, x: 0, y: 0 };
    const screenUnderBase = applyAffine(cameraMatrix(base), rinkPoint.x, rinkPoint.y);
    const camera: Camera = {
      ...base,
      x: base.x + (screenCentre.x - screenUnderBase.x),
      y: base.y + (screenCentre.y - screenUnderBase.y),
    };

    // Confirm the constructed camera really does put rinkPoint at screen
    // centre before using it to exercise orbitFromCamera.
    const check = applyAffine(cameraMatrix(camera), rinkPoint.x, rinkPoint.y);
    expect(check.x).toBeCloseTo(screenCentre.x, 9);
    expect(check.y).toBeCloseTo(screenCentre.y, 9);

    const { target } = orbitFromCamera(camera, VIEWPORT_16_9);
    const expected = rinkToWorld(rinkPoint);
    expect(target.x).toBeCloseTo(expected.x, 9);
    expect(target.y).toBeCloseTo(expected.y, 9);
    expect(target.z).toBeCloseTo(expected.z, 9);
  });
});
