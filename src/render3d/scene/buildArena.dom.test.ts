// ============================================================================
// BUILD ARENA — scene-graph unit test
//
// three.js scene-graph assembly (Object3D/geometry math) is DOM-free and runs
// fine under jsdom - it is only WebGLRenderer and real image decoding that
// cannot (see the module header in Board3D.tsx and the project's global
// jsdom canvas stub in src/test/setup.ts, which returns a null 2D context by
// default). `buildArena` never calls `iceCanvas.getContext(...)` itself - it
// only reads `.width`/`.height` and hands the canvas to `THREE.CanvasTexture`
// as a pixel source - so a bare `document.createElement('canvas')` is a
// perfectly good stand-in here, same as `rinkScene.dom.test.ts` does for
// Pixi's scene graph.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RINK } from '@/core/constants';
import { RINK_SCALE } from '../worldMap';
import { buildArena } from './buildArena';

const ICE_WIDTH = RINK.width * RINK_SCALE;
const ICE_HEIGHT = RINK.height * RINK_SCALE;

function fakeIceCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 871;
  return canvas;
}

function findMesh(root: THREE.Object3D, name: string): THREE.Mesh {
  const found = root.getObjectByName(name);
  if (!(found instanceof THREE.Mesh)) {
    throw new Error(`expected a Mesh named "${name}", got ${found?.type ?? 'nothing'}`);
  }
  return found;
}

describe('buildArena', () => {
  it('assembles the labeled top-level groups in order: arena-floor, ice, boards, glass, lights', () => {
    const { root } = buildArena(fakeIceCanvas());
    expect(root.children.map(child => child.name)).toEqual([
      'arena-floor',
      'ice',
      'boards',
      'glass',
      'lights',
    ]);
  });

  it('builds a fresh scene graph on every call (no shared mutable state)', () => {
    const a = buildArena(fakeIceCanvas());
    const b = buildArena(fakeIceCanvas());
    expect(a.root).not.toBe(b.root);
    expect(a.root.children[0]).not.toBe(b.root.children[0]);
  });

  describe('ice', () => {
    it('is a PlaneGeometry(1000*S, 425*S) mesh, flat on the ground plane (y = 0)', () => {
      const { root } = buildArena(fakeIceCanvas());
      const ice = findMesh(root, 'ice');
      const geo = ice.geometry as THREE.PlaneGeometry;
      expect(geo).toBeInstanceOf(THREE.PlaneGeometry);
      expect(geo.parameters.width).toBeCloseTo(ICE_WIDTH, 9);
      expect(geo.parameters.height).toBeCloseTo(ICE_HEIGHT, 9);

      geo.computeBoundingBox();
      const box = geo.boundingBox as THREE.Box3;
      expect(box.min.y).toBeCloseTo(0, 9);
      expect(box.max.y).toBeCloseTo(0, 9);
    });

    it('maps UVs across the full 0..1 texture (no cropping)', () => {
      const { root } = buildArena(fakeIceCanvas());
      const ice = findMesh(root, 'ice');
      const uv = ice.geometry.getAttribute('uv');
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      for (let i = 0; i < uv.count; i++) {
        minU = Math.min(minU, uv.getX(i));
        maxU = Math.max(maxU, uv.getX(i));
        minV = Math.min(minV, uv.getY(i));
        maxV = Math.max(maxV, uv.getY(i));
      }
      expect(minU).toBe(0);
      expect(maxU).toBe(1);
      expect(minV).toBe(0);
      expect(maxV).toBe(1);
    });

    it('textures itself with a CanvasTexture wrapping the exact ice canvas it was given', () => {
      const canvas = fakeIceCanvas();
      const { root } = buildArena(canvas);
      const ice = findMesh(root, 'ice');
      const material = ice.material as THREE.MeshStandardMaterial;
      expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
      expect((material.map as THREE.CanvasTexture).image).toBe(canvas);
    });
  });

  describe('boards', () => {
    it('is an extruded wall following the rounded-rect rink outline, 1.2 world units tall, sitting on the ice', () => {
      const { root } = buildArena(fakeIceCanvas());
      const boards = root.getObjectByName('boards') as THREE.Object3D;
      expect(boards).toBeTruthy();

      const box = new THREE.Box3().setFromObject(boards);
      expect(box.min.y).toBeCloseTo(0, 6);
      expect(box.max.y).toBeCloseTo(1.2, 6);

      // Footprint matches the ice plane's own rounded-rect outline (the
      // boards do not overshoot the ice or leave a gap outside it).
      expect(box.max.x - box.min.x).toBeCloseTo(ICE_WIDTH, 3);
      expect(box.max.z - box.min.z).toBeCloseTo(ICE_HEIGHT, 3);

      // Every mesh under the group is a real ExtrudeGeometry, not a stand-in.
      boards.traverse(child => {
        if (child instanceof THREE.Mesh) {
          expect(child.geometry).toBeInstanceOf(THREE.ExtrudeGeometry);
        }
      });
    });

    it('is white with the existing board-fixture accent (the gold kick-plate stripe)', () => {
      const { root } = buildArena(fakeIceCanvas());
      const boards = root.getObjectByName('boards') as THREE.Object3D;
      const colors: number[] = [];
      boards.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.MeshStandardMaterial;
          colors.push(material.color.getHex());
        }
      });
      expect(colors).toContain(0xf5f8fb); // drawBoards' white cap rail
      expect(colors).toContain(0xf2c94c); // drawBoards' gold accent stripe
    });
  });

  describe('glass', () => {
    it('is a transparent pane, 1.6 world units tall, sitting directly above the boards', () => {
      const { root } = buildArena(fakeIceCanvas());
      const glass = findMesh(root, 'glass');
      const material = glass.material as THREE.MeshStandardMaterial;
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBeCloseTo(0.18, 9);

      const box = new THREE.Box3().setFromObject(glass);
      expect(box.min.y).toBeCloseTo(1.2, 6);
      expect(box.max.y).toBeCloseTo(1.2 + 1.6, 6);
    });
  });

  describe('lights', () => {
    it('has one HemisphereLight and one DirectionalLight', () => {
      const { root } = buildArena(fakeIceCanvas());
      const lights = root.getObjectByName('lights') as THREE.Group;
      expect(lights).toBeInstanceOf(THREE.Group);
      expect(lights.children.filter(c => c instanceof THREE.HemisphereLight)).toHaveLength(1);
      expect(lights.children.filter(c => c instanceof THREE.DirectionalLight)).toHaveLength(1);
    });

    it('casts shadows only at quality "high"', () => {
      const high = buildArena(fakeIceCanvas(), { quality: 'high' });
      const highDirectional = (high.root.getObjectByName('lights') as THREE.Group).children.find(
        (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight
      );
      expect(highDirectional?.castShadow).toBe(true);

      for (const quality of ['medium', 'low'] as const) {
        const { root } = buildArena(fakeIceCanvas(), { quality });
        const directional = (root.getObjectByName('lights') as THREE.Group).children.find(
          (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight
        );
        expect(directional?.castShadow).toBe(false);
      }
    });

    it('defaults to quality "high" when no quality is given', () => {
      const { root } = buildArena(fakeIceCanvas());
      const directional = (root.getObjectByName('lights') as THREE.Group).children.find(
        (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight
      );
      expect(directional?.castShadow).toBe(true);
    });
  });

  describe('arena-floor', () => {
    it('is a flat mesh in the PhiceCraft slate colour, sitting at/under ice level', () => {
      const { root } = buildArena(fakeIceCanvas());
      const floor = findMesh(root, 'arena-floor');
      const material = floor.material as THREE.MeshStandardMaterial;
      expect(material.color.getHex()).toBe(0x1f2937);
      expect(floor.position.y).toBeLessThanOrEqual(0);
    });

    it('extends past the ice plane\'s own footprint, so it covers the square corners the rounded rink outline leaves transparent', () => {
      const { root } = buildArena(fakeIceCanvas());
      const floor = findMesh(root, 'arena-floor');
      const geo = floor.geometry as THREE.PlaneGeometry;
      expect(geo.parameters.width).toBeGreaterThan(ICE_WIDTH);
      expect(geo.parameters.height).toBeGreaterThan(ICE_HEIGHT);
    });
  });

  describe('dispose', () => {
    it('disposes every geometry, material and texture without throwing', () => {
      const disposedGeometries: THREE.BufferGeometry[] = [];
      const disposedMaterials: THREE.Material[] = [];
      const { root, dispose } = buildArena(fakeIceCanvas());

      root.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const geometry = child.geometry;
          const originalGeoDispose = geometry.dispose.bind(geometry);
          geometry.dispose = () => {
            disposedGeometries.push(geometry);
            originalGeoDispose();
          };
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            const originalMatDispose = material.dispose.bind(material);
            material.dispose = () => {
              disposedMaterials.push(material);
              originalMatDispose();
            };
          }
        }
      });

      expect(() => dispose()).not.toThrow();
      expect(disposedGeometries.length).toBeGreaterThan(0);
      expect(disposedMaterials.length).toBeGreaterThan(0);
    });
  });
});
