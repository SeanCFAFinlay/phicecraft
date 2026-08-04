// ============================================================================
// PUCK TRAIL — unit tests
//
// Pure three.js object-graph + math: no canvas/DOM needed (unlike
// numberSprite.ts's texture drawing), so this is a plain `.test.ts` running
// under vitest's default `node` environment (see vite.config.ts's
// `environmentMatchGlobs`, and iceTexture.test.ts's own note on the same
// split).
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GHOST_TRAIL_MAX_LENGTH } from '@/core/constants';
import type { Point } from '@/core/types';
import { rinkToWorld } from '../worldMap';
import { createPuckTrail, PUCK_TRAIL_COLOR, PUCK_TRAIL_Y_LIFT } from './puckTrail';

function points(count: number): Point[] {
  return Array.from({ length: count }, (_, i) => ({ x: i * 10, y: i * 5 }));
}

describe('createPuckTrail - shape', () => {
  it('builds a THREE.Line with a preallocated BufferGeometry sized to GHOST_TRAIL_MAX_LENGTH', () => {
    const { line } = createPuckTrail();
    expect(line).toBeInstanceOf(THREE.Line);

    const geometry = line.geometry;
    const position = geometry.getAttribute('position');
    expect(position.count).toBe(GHOST_TRAIL_MAX_LENGTH);
    const color = geometry.getAttribute('color');
    expect(color.count).toBe(GHOST_TRAIL_MAX_LENGTH);
  });

  it('uses vertex colors on a transparent LineBasicMaterial, base color #8ab4d8', () => {
    const { line } = createPuckTrail();
    const material = line.material as THREE.LineBasicMaterial;
    expect(material).toBeInstanceOf(THREE.LineBasicMaterial);
    expect(material.vertexColors).toBe(true);
    expect(material.transparent).toBe(true);
    expect(PUCK_TRAIL_COLOR).toBe('#8ab4d8');
  });

  it('starts with an empty draw range - nothing drawn before the first update', () => {
    const { line } = createPuckTrail();
    expect(line.geometry.drawRange.count).toBe(0);
  });
});

describe('createPuckTrail - update', () => {
  it('maps each point through rinkToWorld, lifted off the ice plane', () => {
    const { line, update } = createPuckTrail();
    update(points(3));

    const position = line.geometry.getAttribute('position');
    for (let i = 0; i < 3; i++) {
      const world = rinkToWorld({ x: i * 10, y: i * 5 });
      // Float32Array storage (a WebGL requirement) loses precision past ~4
      // decimal places relative to the float64 `rinkToWorld` computes.
      expect(position.getX(i)).toBeCloseTo(world.x, 4);
      expect(position.getY(i)).toBeCloseTo(world.y + PUCK_TRAIL_Y_LIFT, 4);
      expect(position.getZ(i)).toBeCloseTo(world.z, 4);
    }
  });

  it('sets the draw range to the number of points given', () => {
    const { line, update } = createPuckTrail();
    update(points(7));
    expect(line.geometry.drawRange.count).toBe(7);

    update(points(2));
    expect(line.geometry.drawRange.count).toBe(2);
  });

  it('never writes past the preallocated capacity, even given more points than that', () => {
    const { line, update } = createPuckTrail();
    update(points(GHOST_TRAIL_MAX_LENGTH + 20));

    expect(line.geometry.drawRange.count).toBe(GHOST_TRAIL_MAX_LENGTH);
    expect(line.geometry.getAttribute('position').count).toBe(GHOST_TRAIL_MAX_LENGTH);
  });

  it('fades color toward the tail: the oldest (first) point is dimmer than the newest (last)', () => {
    const { line, update } = createPuckTrail();
    update(points(10));

    const color = line.geometry.getAttribute('color');
    const oldestBrightness = color.getX(0) + color.getY(0) + color.getZ(0);
    const newestBrightness = color.getX(9) + color.getY(9) + color.getZ(9);
    expect(newestBrightness).toBeGreaterThan(oldestBrightness);
  });

  it('flags both attributes for re-upload on every update (BufferAttribute.needsUpdate is write-only; bumps `.version` instead)', () => {
    const { update, line } = createPuckTrail();
    const position = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const color = line.geometry.getAttribute('color') as THREE.BufferAttribute;
    const positionVersion = position.version;
    const colorVersion = color.version;

    update(points(2));

    expect(position.version).toBeGreaterThan(positionVersion);
    expect(color.version).toBeGreaterThan(colorVersion);
  });

  it('handles an empty point list without throwing, drawing nothing', () => {
    const { line, update } = createPuckTrail();
    update(points(4));
    update([]);
    expect(line.geometry.drawRange.count).toBe(0);
  });
});

describe('createPuckTrail - dispose', () => {
  it('disposes the geometry and material, and only this instance\'s own', () => {
    const a = createPuckTrail();
    const b = createPuckTrail();

    const geometryDisposeA = vi.spyOn(a.line.geometry, 'dispose');
    const materialDisposeA = vi.spyOn(a.line.material as THREE.Material, 'dispose');
    const geometryDisposeB = vi.spyOn(b.line.geometry, 'dispose');
    const materialDisposeB = vi.spyOn(b.line.material as THREE.Material, 'dispose');

    a.dispose();

    expect(geometryDisposeA).toHaveBeenCalledTimes(1);
    expect(materialDisposeA).toHaveBeenCalledTimes(1);
    expect(geometryDisposeB).not.toHaveBeenCalled();
    expect(materialDisposeB).not.toHaveBeenCalled();
  });
});
