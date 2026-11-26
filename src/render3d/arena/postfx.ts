// ============================================================================
// POST-PROCESSING (high tier only)
//
//   - Ground-truth ambient occlusion: the soft darkening where the boards
//     meet the ice, under the bench, between rows of seats and in the folds
//     of a player's kit. Most of what separates "lit geometry" from "a real
//     place".
//   - A restrained bloom that only catches what is genuinely bright: the
//     sports lights, the scoreboard, the ribbon boards.
//   - Multisampled render targets, so the composer keeps the antialiasing
//     the plain renderer had.
//
// Medium and low tiers render straight to the canvas instead.
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export interface PostFx {
  render(): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

export function createPostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): PostFx {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const ao = new GTAOPass(scene, camera, Math.max(1, size.x), Math.max(1, size.y));
  ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 12 });
  ao.updatePdMaterial({ radius: 6, rings: 2, samples: 12 });
  ao.blendIntensity = 0.85;
  // Glass, netting, shadows pools and overlays must not occlude anything:
  // hide every transparent mesh and sprite from the normal/depth prepass.
  const hidden: THREE.Object3D[] = [];
  const passInternals = ao as unknown as { _overrideVisibility: () => void; _restoreVisibility: () => void };
  passInternals._overrideVisibility = () => {
    scene.traverse(object => {
      if (!object.visible) return;
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const transparent = Array.isArray(material) ? material.some(m => m.transparent) : material?.transparent;
      if ((object as THREE.Points).isPoints || (object as THREE.Line).isLine || (object as THREE.Sprite).isSprite || transparent) {
        object.visible = false;
        hidden.push(object);
      }
    });
  };
  passInternals._restoreVisibility = () => {
    for (const object of hidden) object.visible = true;
    hidden.length = 0;
  };
  composer.addPass(ao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.5, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    render() {
      composer.render();
    },
    setSize(width, height) {
      const pr = renderer.getPixelRatio();
      composer.setPixelRatio(pr);
      composer.setSize(width, height);
    },
    dispose() {
      composer.dispose();
      ao.dispose();
      bloom.dispose();
      target.dispose();
    },
  };
}
