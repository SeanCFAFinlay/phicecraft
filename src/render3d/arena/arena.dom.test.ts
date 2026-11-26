// ============================================================================
// ARENA - scene-graph tests
//
// three.js scene assembly is DOM-free and runs under jsdom; only WebGL and
// canvas painting can't (jsdom's 2D context is stubbed to null, so every
// canvas texture here quietly falls back to its plain-colour material).
// ============================================================================

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createArena } from './arena';
import { BOARD_HEIGHT, CORNER_RADIUS, ICE_LENGTH, ICE_WIDTH, LIGHT_GRID_Y, perimeter, perimeterLength, sweep } from './layout';
import { createGoalNets, GOAL_HEIGHT, GOAL_MOUTH_WIDTH } from './goalNet';
import { iceTextureSize } from './iceSurface';
import { createBowl } from './bowl';
import { NO_REFLECT_LAYER } from './iceReflection';

function mesh(root: THREE.Object3D, name: string): THREE.Mesh {
  const found = root.getObjectByName(name);
  if (!(found instanceof THREE.Mesh)) throw new Error(`expected a mesh named ${name}`);
  return found;
}

function cameraAt(x: number, y: number, z: number, look = new THREE.Vector3(0, 0, 0)): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 500);
  camera.position.set(x, y, z);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  return camera;
}

describe('perimeter', () => {
  it('is a closed loop whose length matches the rounded rectangle', () => {
    for (const offset of [0, 3, 20]) {
      const stations = perimeter(offset, 0.5, 24);
      const first = stations[0];
      const last = stations[stations.length - 1];
      expect(last.x).toBeCloseTo(first.x, 6);
      expect(last.z).toBeCloseTo(first.z, 6);
      expect(last.s).toBeCloseTo(perimeterLength(offset), 0);
    }
  });

  it('puts every station on the outline pushed out by the offset, with unit outward normals', () => {
    const offset = 5;
    for (const st of perimeter(offset)) {
      expect(Math.hypot(st.nx, st.nz)).toBeCloseTo(1, 6);
      // Outward: the normal points away from centre ice.
      expect(st.x * st.nx + st.z * st.nz).toBeGreaterThan(0);
      // On the straights, the station sits exactly at the offset edge.
      if (Math.abs(st.nz) > 0.999) expect(Math.abs(st.z)).toBeCloseTo(ICE_WIDTH / 2 + offset, 6);
      if (Math.abs(st.nx) > 0.999) expect(Math.abs(st.x)).toBeCloseTo(ICE_LENGTH / 2 + offset, 6);
      // In the corners, it sits on the enlarged corner radius.
      if (Math.abs(st.nx) < 0.999 && Math.abs(st.nz) < 0.999) {
        const cx = Math.sign(st.x) * (ICE_LENGTH / 2 - CORNER_RADIUS);
        const cz = Math.sign(st.z) * (ICE_WIDTH / 2 - CORNER_RADIUS);
        expect(Math.hypot(st.x - cx, st.z - cz)).toBeCloseTo(CORNER_RADIUS + offset, 4);
      }
    }
  });
});

describe('sweep', () => {
  it('faces a profile walked upward toward the ice', () => {
    const geometry = sweep(perimeter(0, 1, 8), [{ out: 0, up: 0 }, { out: 0, up: 1 }]);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const index = geometry.getIndex()!;
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)].map(i => new THREE.Vector3().fromBufferAttribute(positions, i));
      const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (face.lengthSq() < 1e-12) continue;
      const vertexNormal = new THREE.Vector3().fromBufferAttribute(normals, index.getX(t));
      // Winding and stored normals agree, and both point back toward centre ice.
      expect(face.dot(vertexNormal)).toBeGreaterThan(0);
      expect(vertexNormal.x * a.x + vertexNormal.z * a.z).toBeLessThan(0);
    }
  });
});

describe('createArena', () => {
  it('assembles the building around the ice', () => {
    const arena = createArena('high');
    const names = arena.root.children.map(c => c.name);
    expect(names).toEqual(['arena-floor', 'ice', 'boards', 'glass', 'benches', 'goal-nets', 'bowl', 'roof', 'scoreboard', 'lights']);
    arena.dispose();
  });

  it('lays the ice flat on y = 0 at the rink size, with the full texture mapped and rounded corners cut', () => {
    const arena = createArena('medium');
    const ice = mesh(arena.root, 'ice');
    const geometry = ice.geometry as THREE.PlaneGeometry;
    expect(geometry.parameters.width).toBeCloseTo(ICE_LENGTH, 9);
    expect(geometry.parameters.height).toBeCloseTo(ICE_WIDTH, 9);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBeCloseTo(0, 9);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(0, 9);
    const material = ice.material as THREE.MeshPhysicalMaterial;
    expect(material.alphaTest).toBeGreaterThan(0);
    expect(material.metalness).toBe(0);
    arena.dispose();
  });

  it('stands the boards on the edge of the ice at regulation height, with a yellow kick plate and white face', () => {
    const arena = createArena('high');
    const boards = arena.root.getObjectByName('boards')!;
    const box = new THREE.Box3().setFromObject(boards);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeCloseTo(BOARD_HEIGHT, 3);
    expect(box.max.x - box.min.x).toBeGreaterThanOrEqual(ICE_LENGTH);
    expect(box.max.z - box.min.z).toBeGreaterThanOrEqual(ICE_WIDTH);
    const kick = mesh(boards, 'boards-kickplate').material as THREE.MeshStandardMaterial;
    expect(kick.color.getHex()).toBe(0xf0c419);
    arena.dispose();
  });

  it('puts see-through glass on top of the boards, taller at the ends', () => {
    const arena = createArena('high');
    const panes = mesh(arena.root, 'glass-panes');
    expect((panes.material as THREE.Material).transparent).toBe(true);
    const box = new THREE.Box3().setFromObject(panes);
    expect(box.min.y).toBeCloseTo(BOARD_HEIGHT, 3);
    expect(box.max.y).toBeCloseTo(BOARD_HEIGHT + 2.44, 2);
    arena.dispose();
  });

  it('casts shadows from the key light only on the high tier', () => {
    for (const [quality, expected] of [['high', true], ['medium', false], ['low', false]] as const) {
      const arena = createArena(quality);
      const key = arena.root.getObjectByName('key-light') as THREE.DirectionalLight;
      expect(key.castShadow).toBe(expected);
      arena.dispose();
    }
  });

  it('opens the roof for cameras above the light grid and closes it at ice level', () => {
    const arena = createArena('high');
    const roof = arena.root.getObjectByName('roof')!;
    const scoreboard = arena.root.getObjectByName('scoreboard')!;
    arena.update(cameraAt(0, 70, 40));
    expect(roof.visible).toBe(false);
    expect(scoreboard.visible).toBe(false);
    arena.update(cameraAt(0, 1.75, 5, new THREE.Vector3(10, 1, 0)));
    expect(roof.visible).toBe(true);
    expect(scoreboard.visible).toBe(true);
    arena.update(cameraAt(0, LIGHT_GRID_Y - 3, 0, new THREE.Vector3(0, 0, -5)));
    expect(roof.visible).toBe(true);
    expect(scoreboard.visible).toBe(false);
    arena.dispose();
  });

  it('lifts away the stands between a low camera and the ice, and keeps the far side', () => {
    const arena = createArena('high');
    const bowl = arena.root.getObjectByName('bowl')!;
    // A low broadcast angle from far beyond the near (+z) side.
    arena.update(cameraAt(0, 20, 75));
    const near = bowl.children.filter(c => c.name === 'bowl-near');
    const far = bowl.getObjectByName('bowl-far')!;
    expect(near.some(section => !section.visible)).toBe(true);
    expect(far.visible).toBe(true);
    // From centre ice nothing is in the way.
    arena.update(cameraAt(0, 1.75, 0, new THREE.Vector3(10, 1, 0)));
    expect(bowl.children.every(section => section.visible)).toBe(true);
    arena.dispose();
  });

  it('disposes without throwing', () => {
    const arena = createArena('high');
    expect(() => arena.dispose()).not.toThrow();
  });
});

describe('bowl', () => {
  it('fills both tiers with seats on high, the lower bowl on medium, none on low', () => {
    const count = (quality: 'high' | 'medium' | 'low') => {
      const bowl = createBowl(quality);
      let seats = 0;
      bowl.root.traverse(node => {
        if (node instanceof THREE.InstancedMesh && node.name === 'seats') seats += node.count;
      });
      bowl.dispose();
      return seats;
    };
    const high = count('high');
    const medium = count('medium');
    expect(high).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(1000);
    expect(count('low')).toBe(0);
  });
});

describe('goal nets', () => {
  it('builds two regulation goals on the goal lines, with netting', () => {
    const nets = createGoalNets('high');
    expect(nets.root.children.map(c => c.name)).toEqual(['goal-net-left', 'goal-net-right']);
    const left = nets.root.getObjectByName('goal-net-left')!;
    const crossbar = mesh(left, 'crossbar');
    const box = new THREE.Box3().setFromObject(crossbar);
    expect(box.max.z - box.min.z).toBeCloseTo(GOAL_MOUTH_WIDTH, 1);
    expect(box.max.y).toBeCloseTo(GOAL_HEIGHT + 0.03, 2);
    for (const name of ['net-top', 'net-side-left', 'net-side-right', 'net-back']) {
      expect((mesh(left, name).material as THREE.Material).side).toBe(THREE.DoubleSide);
    }
    expect(() => nets.dispose()).not.toThrow();
  });
});

describe('ice texture size', () => {
  it('keeps the rink aspect ratio and doubles the resolution on high', () => {
    const high = iceTextureSize('high');
    const medium = iceTextureSize('medium');
    expect(high.width).toBe(medium.width * 2);
    expect(high.width / high.height).toBeCloseTo(ICE_LENGTH / ICE_WIDTH, 2);
  });
});

describe('reflection layer', () => {
  it('is a layer other than the default one', () => {
    expect(NO_REFLECT_LAYER).not.toBe(0);
  });
});
