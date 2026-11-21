import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { contactShadowAlpha, createContactShadows, MAX_CONTACT_SHADOWS } from './contactShadows';
import { createPuckTrail } from './puckTrail';
import { createIceSpray, PARTICLES_PER_SKATER, sprayIntensity, type IceSprayEmitter } from './iceSpray';
import { eventWeight, stopPhase } from './actors';

describe('contact shadows', () => {
  it('fade from dense under the body to nothing at the edge', () => {
    expect(contactShadowAlpha(0)).toBe(1);
    expect(contactShadowAlpha(0.5)).toBeGreaterThan(0);
    expect(contactShadowAlpha(0.5)).toBeLessThan(1);
    expect(contactShadowAlpha(1)).toBe(0);
    expect(contactShadowAlpha(2)).toBe(0);
  });

  it('draws exactly the pools placed this frame, in one instanced mesh', () => {
    const shadows = createContactShadows();
    shadows.begin();
    shadows.place(1, 2, 0.6);
    shadows.place(-3, 4, 0.9);
    shadows.end();
    expect(shadows.root.count).toBe(2);
    const matrix = new THREE.Matrix4();
    shadows.root.getMatrixAt(1, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(-3);
    expect(position.z).toBeCloseTo(4);

    shadows.begin();
    shadows.place(0, 0, 0.6);
    shadows.end();
    expect(shadows.root.count).toBe(1);
    shadows.dispose();
  });

  it('never writes past its capacity', () => {
    const shadows = createContactShadows();
    shadows.begin();
    for (let i = 0; i < MAX_CONTACT_SHADOWS + 10; i++) shadows.place(i, 0, 0.5);
    shadows.end();
    expect(shadows.root.count).toBe(MAX_CONTACT_SHADOWS);
    shadows.dispose();
  });
});

describe('puck trail', () => {
  it('streaks back from the puck, opposite its direction of travel', () => {
    const trail = createPuckTrail();
    trail.show({ x: 5, z: 1 }, { x: 1, z: 0 }, 2);
    expect(trail.root.visible).toBe(true);
    const positions = trail.root.geometry.getAttribute('position');
    // Head pair at the puck, tail pair two metres behind it.
    expect((positions.getX(0) + positions.getX(1)) / 2).toBeCloseTo(5);
    const last = positions.count - 1;
    expect((positions.getX(last) + positions.getX(last - 1)) / 2).toBeCloseTo(3);
    trail.dispose();
  });

  it('fades to nothing at the tail', () => {
    const trail = createPuckTrail();
    const colours = trail.root.geometry.getAttribute('color');
    expect(colours.getW(0)).toBeGreaterThan(0.3);
    expect(colours.getW(colours.count - 1)).toBe(0);
    trail.dispose();
  });

  it('hides for a puck barely moving', () => {
    const trail = createPuckTrail();
    trail.show({ x: 0, z: 0 }, { x: 1, z: 0 }, 0.01);
    expect(trail.root.visible).toBe(false);
    trail.dispose();
  });
});

describe('ice spray', () => {
  const emitter = (over: Partial<IceSprayEmitter> = {}): IceSprayEmitter => ({
    seed: 1, x: 0, z: 0, dirX: 1, dirZ: 0, speed: 110, timeSeconds: 1.234, ...over,
  });
  const snapshot = (spray: ReturnType<typeof createIceSpray>) =>
    Array.from((spray.root.geometry.getAttribute('position') as THREE.BufferAttribute).array.slice(0, PARTICLES_PER_SKATER * 3));

  it('throws nothing at a crawl and a full spray on a hard stop', () => {
    expect(sprayIntensity(5)).toBe(0);
    expect(sprayIntensity(200)).toBe(1);
    const spray = createIceSpray();
    spray.begin();
    spray.emit(emitter({ speed: 5 }));
    spray.end();
    expect(spray.root.geometry.drawRange.count).toBe(0);
    expect(spray.root.visible).toBe(false);
    spray.begin();
    spray.emit(emitter());
    spray.end();
    expect(spray.root.geometry.drawRange.count).toBe(PARTICLES_PER_SKATER);
    spray.dispose();
  });

  it('is a function of the clock: the same instant always draws the same spray', () => {
    const spray = createIceSpray();
    spray.begin();
    spray.emit(emitter());
    spray.end();
    const first = snapshot(spray);
    spray.begin();
    spray.emit(emitter({ timeSeconds: 2.5 }));
    spray.end();
    expect(snapshot(spray)).not.toEqual(first);
    spray.begin();
    spray.emit(emitter());
    spray.end();
    expect(snapshot(spray)).toEqual(first);
    spray.dispose();
  });

  it('flies ahead of the skates, the way they were travelling', () => {
    const spray = createIceSpray();
    spray.begin();
    spray.emit(emitter({ dirX: 0, dirZ: 1 }));
    spray.end();
    const positions = snapshot(spray);
    let ahead = 0;
    for (let i = 0; i < PARTICLES_PER_SKATER; i++) ahead += positions[i * 3 + 2];
    expect(ahead / PARTICLES_PER_SKATER).toBeGreaterThan(0);
    spray.dispose();
  });
});

describe('animation phases', () => {
  it('eases an event clip in, holds it through contact, and eases it out', () => {
    expect(eventWeight(0)).toBe(0);
    expect(eventWeight(0.1)).toBeGreaterThan(0);
    expect(eventWeight(0.1)).toBeLessThan(1);
    expect(eventWeight(0.5)).toBe(1);
    expect(eventWeight(1)).toBe(0);
  });

  it('holds the deepest point of a hard stop and rises out of it as the speed goes', () => {
    expect(stopPhase(120)).toBe(0.5);
    expect(stopPhase(40)).toBe(0.5);
    expect(stopPhase(20)).toBeCloseTo(0.75);
    expect(stopPhase(0)).toBe(1);
  });
});
