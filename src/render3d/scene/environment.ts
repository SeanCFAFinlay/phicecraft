// ============================================================================
// ARENA ENVIRONMENT
//
// Every material in the 3D view is physically based, but with only a sky
// light and one sun there was nothing for them to reflect: the clearcoat on
// the ice, the visor, the steel of the blades and the sheen of a sweater all
// read as flat paint. A prefiltered studio environment (three's
// RoomEnvironment, generated on the GPU once per mount, no download) gives
// every surface soft reflected light, which is most of what makes the ice
// look like ice.
//
// Skipped on the 'low' tier, where the one-off prefilter pass and the extra
// texture lookups per pixel are not worth it.
// ============================================================================

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { RenderQuality } from '@/render/quality';

/** How strongly the environment lights the scene, next to the arena's own lamps. */
export const ENVIRONMENT_INTENSITY = 0.42;

/** Installs the reflection environment on `scene`; returns the matching cleanup. */
export function applyArenaEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  quality: RenderQuality
): () => void {
  if (quality === 'low') return () => {};
  let target: THREE.WebGLRenderTarget | null = null;
  try {
    const generator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    target = generator.fromScene(room, 0.04);
    (room as unknown as { dispose?: () => void }).dispose?.();
    generator.dispose();
    scene.environment = target.texture;
    scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  } catch {
    // A context that cannot run the prefilter still draws the arena lit by
    // its own lamps - reflections are an enhancement, not a requirement.
    target?.dispose();
    target = null;
  }
  return () => {
    if (scene.environment === target?.texture) scene.environment = null;
    target?.dispose();
  };
}
