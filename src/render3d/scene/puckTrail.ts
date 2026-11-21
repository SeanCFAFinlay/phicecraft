// ============================================================================
// PUCK TRAIL
//
// A puck in flight is a 7.6 cm disc crossing a 60 m sheet in under a second:
// from any camera further back than the bench it was gone before the eye
// found it. A short streak behind it, tapering and fading toward the tail,
// shows where a pass or shot came from and how hard it travels.
//
// It is a dark streak, like the motion blur of a photograph: ice is nearly
// white, so a light or glowing trail simply disappears into it.
//
// The streak is drawn from the frame's own velocity, not from a history of
// past renders, so scrubbing the timeline to any instant shows exactly what
// playing through it shows.
// ============================================================================

import * as THREE from 'three';

const SEGMENTS = 14;
const HEAD_WIDTH = 0.16;
const HEAD_ALPHA = 0.6;
const TRAIL_Y = 0.02;

export interface PuckTrail {
  root: THREE.Mesh;
  /** Draws the streak from `head` back along -`direction` (unit, world XZ) for `length` metres. */
  show(head: { x: number; z: number }, direction: { x: number; z: number }, length: number): void;
  hide(): void;
  dispose(): void;
}

export function createPuckTrail(colour = '#14202c'): PuckTrail {
  const vertices = (SEGMENTS + 1) * 2;
  const positions = new Float32Array(vertices * 3);
  const colours = new Float32Array(vertices * 4);
  const base = new THREE.Color(colour);
  for (let i = 0; i <= SEGMENTS; i++) {
    // Fades quadratically toward the tail: bright at the puck, gone behind it.
    const alpha = HEAD_ALPHA * (1 - i / SEGMENTS) ** 2;
    for (const side of [0, 1]) {
      colours.set([base.r, base.g, base.b, alpha], (i * 2 + side) * 4);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  geometry.setIndex(index);

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'puck-trail';
  mesh.visible = false;
  mesh.frustumCulled = false;

  return {
    root: mesh,
    show(head, direction, length) {
      if (!(length > 0.05)) {
        mesh.visible = false;
        return;
      }
      // Perpendicular on the ice plane, for the ribbon's width.
      const px = -direction.z;
      const pz = direction.x;
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const cx = head.x - direction.x * length * t;
        const cz = head.z - direction.z * length * t;
        const half = (HEAD_WIDTH / 2) * (1 - t * 0.85);
        positions.set([cx + px * half, TRAIL_Y, cz + pz * half, cx - px * half, TRAIL_Y, cz - pz * half], i * 6);
      }
      positionAttribute.needsUpdate = true;
      mesh.visible = true;
    },
    hide() {
      mesh.visible = false;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
