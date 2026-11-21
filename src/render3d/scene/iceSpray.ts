// ============================================================================
// ICE SPRAY
//
// The snow a hockey stop throws off the edges. It is what tells a viewer a
// skater has dug in and stopped rather than simply slowed down, and it gives
// the stop clip the weight it has on real ice.
//
// Every particle's position is a pure function of the simulation clock and
// the skater, never of the previous render: a short looping lifetime per
// particle, each offset by a fixed seed. Scrubbing back over a stop replays
// the same spray, and pausing freezes it mid-air.
// ============================================================================

import * as THREE from 'three';

export const PARTICLES_PER_SKATER = 22;
/** Most skaters drawn spraying at once; a whole line stopping together fits. */
export const MAX_SPRAYING_SKATERS = 12;
const LIFETIME_SECONDS = 0.42;
const POINT_SIZE = 0.3;
/** Speed (rink units/s) at which a stop throws its fullest spray. */
const FULL_SPRAY_SPEED = 110;

export interface IceSprayEmitter {
  /** Stable per-skater seed, so two skaters stopping together do not spray in lockstep. */
  seed: number;
  /** World position of the skates. */
  x: number;
  z: number;
  /** World-space unit vector of travel on the ice (the spray flies ahead of the skates). */
  dirX: number;
  dirZ: number;
  /** Rink units/s. */
  speed: number;
  timeSeconds: number;
}

export interface IceSpray {
  root: THREE.Points;
  begin(): void;
  emit(emitter: IceSprayEmitter): void;
  end(): void;
  dispose(): void;
}

/** Deterministic hash in [0, 1). */
export function sprayHash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** How strongly a skater at `speed` sprays: none at a crawl, full at a hard stop. */
export function sprayIntensity(speed: number): number {
  return Math.min(1, Math.max(0, (speed - 12) / (FULL_SPRAY_SPEED - 12)));
}

function createDotTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - half, y - half) / half);
      const i = (y * size + x) * 4;
      data.set([255, 255, 255, Math.round((1 - d) ** 1.6 * 255)], i);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createIceSpray(): IceSpray {
  const capacity = PARTICLES_PER_SKATER * MAX_SPRAYING_SKATERS;
  const positions = new Float32Array(capacity * 3);
  const colours = new Float32Array(capacity * 4);
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const colourAttribute = new THREE.BufferAttribute(colours, 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colourAttribute);
  geometry.setDrawRange(0, 0);

  const texture = createDotTexture();
  const material = new THREE.PointsMaterial({
    size: POINT_SIZE,
    map: texture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'ice-spray';
  points.frustumCulled = false;
  let count = 0;

  return {
    root: points,
    begin() {
      count = 0;
    },
    emit(e) {
      const intensity = sprayIntensity(e.speed);
      if (intensity <= 0 || count + PARTICLES_PER_SKATER > capacity) return;
      // Perpendicular to travel: the spray fans out from the edges, both sides.
      const sideX = -e.dirZ;
      const sideZ = e.dirX;
      for (let i = 0; i < PARTICLES_PER_SKATER; i++) {
        const seed = e.seed * 61.3 + i * 7.77;
        const offset = sprayHash(seed) * LIFETIME_SECONDS;
        const u = (((e.timeSeconds + offset) % LIFETIME_SECONDS) + LIFETIME_SECONDS) % LIFETIME_SECONDS / LIFETIME_SECONDS;
        const fan = (sprayHash(seed + 1) - 0.5) * 1.5;
        const side = sprayHash(seed + 2) < 0.5 ? -1 : 1;
        const reach = (0.45 + sprayHash(seed + 3) * 0.75) * intensity;
        const lift = 0.3 + sprayHash(seed + 4) * 0.35;
        const forward = reach * u;
        const lateral = (fan * 0.5 + side * 0.18) * u;
        const p = count * 3;
        positions[p] = e.x + e.dirX * forward + sideX * lateral;
        positions[p + 1] = 0.03 + lift * u * (1 - u) * 4 * intensity;
        positions[p + 2] = e.z + e.dirZ * forward + sideZ * lateral;
        const c = count * 4;
        // Shaved ice in shade, not pure white: pure white vanishes into the
        // sheet it is thrown across.
        colours[c] = 0.62;
        colours[c + 1] = 0.76;
        colours[c + 2] = 0.9;
        colours[c + 3] = (1 - u) * 0.9 * intensity;
        count++;
      }
    },
    end() {
      geometry.setDrawRange(0, count);
      positionAttribute.needsUpdate = true;
      colourAttribute.needsUpdate = true;
      points.visible = count > 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
