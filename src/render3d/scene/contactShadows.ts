// ============================================================================
// CONTACT SHADOWS
//
// A soft dark pool on the ice under every player, coach and the puck. The
// sun's shadow map (high tier only) throws a long shadow to one side but
// leaves the feet themselves floating; on the medium and low tiers there was
// no shadow at all and players looked pasted onto the ice. These pools are
// what ground them, on every tier.
//
// One instanced mesh draws all of them in a single draw call. The falloff
// texture is computed, not drawn on a canvas, so it works in any context.
// ============================================================================

import * as THREE from 'three';

/** Upper bound on pools drawn at once: a full two-team scrimmage plus coaches and the puck. */
export const MAX_CONTACT_SHADOWS = 64;
const TEXTURE_SIZE = 64;
const SHADOW_OPACITY = 0.62;
/** Just above the ice and its painted lines, under every route overlay. */
const SHADOW_Y = 0.008;

export interface ContactShadows {
  root: THREE.InstancedMesh;
  /** Starts a frame: every pool placed before `end()` is drawn, the rest are not. */
  begin(): void;
  place(x: number, z: number, radius: number): void;
  end(): void;
  dispose(): void;
}

/** Radial falloff: dense under the body, fading smoothly to nothing at the edge. */
export function contactShadowAlpha(distanceFromCentre: number): number {
  const t = Math.min(1, Math.max(0, distanceFromCentre));
  const fade = 1 - t * t * (3 - 2 * t);
  return fade * fade;
}

function createFalloffTexture(): THREE.DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const half = (TEXTURE_SIZE - 1) / 2;
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const i = (y * TEXTURE_SIZE + x) * 4;
      const distance = Math.hypot(x - half, y - half) / half;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = Math.round(contactShadowAlpha(distance) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createContactShadows(): ContactShadows {
  const geometry = new THREE.PlaneGeometry(2, 2);
  geometry.rotateX(-Math.PI / 2);
  const texture = createFalloffTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: '#05080c',
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
    // Drawn over the ice, never fighting it for depth.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_CONTACT_SHADOWS);
  mesh.name = 'contact-shadows';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  const matrix = new THREE.Matrix4();
  let placed = 0;

  return {
    root: mesh,
    begin() {
      placed = 0;
    },
    place(x, z, radius) {
      if (placed >= MAX_CONTACT_SHADOWS) return;
      matrix.makeScale(radius, 1, radius);
      matrix.setPosition(x, SHADOW_Y, z);
      mesh.setMatrixAt(placed++, matrix);
    },
    end() {
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
