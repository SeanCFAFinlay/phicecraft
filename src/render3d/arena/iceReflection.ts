// ============================================================================
// ICE REFLECTION (high tier)
//
// Fresh ice is a mirror with a frost on it: under arena lights you see a soft,
// faint reflection of every player, the boards and the light grid in it. The
// environment map alone can't do that (it has no players in it and no sense
// of position), so the high tier renders a true planar reflection: the scene
// seen from the camera mirrored through the ice plane, into a half-resolution
// target, which the ice material then samples, softens and blends in by its
// own glossiness (scuffed ice reflects less) and by Fresnel (more at a
// grazing angle, as real ice does).
//
// Flat things lying on the ice (the sheet itself, contact shadows, halos,
// route lines) and the seating bowl live on NO_REFLECT_LAYER, which the
// mirrored camera does not see.
// ============================================================================

import * as THREE from 'three';

/** Objects on this layer (and not layer 0) are drawn normally but never reflected. */
export const NO_REFLECT_LAYER = 1;
const STRENGTH = 0.34;

export interface IceReflection {
  /** Renders the mirrored view; call before the main render. */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

/** Moves an object (and its descendants) off layer 0 onto the no-reflect layer. */
export function excludeFromReflection(object: THREE.Object3D): void {
  object.traverse(node => node.layers.set(NO_REFLECT_LAYER));
}

export function createIceReflection(ice: THREE.Mesh, material: THREE.MeshPhysicalMaterial): IceReflection {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
  target.texture.generateMipmaps = false;
  const textureMatrix = new THREE.Matrix4();
  const virtualCamera = new THREE.PerspectiveCamera();
  virtualCamera.layers.set(0);
  const normal = new THREE.Vector3(0, 1, 0);
  const plane = new THREE.Plane();
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();
  const reflectorPos = new THREE.Vector3();
  const cameraPos = new THREE.Vector3();
  const rotation = new THREE.Matrix4();
  const lookAt = new THREE.Vector3();
  const view = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const texel = new THREE.Vector2(1, 1);
  let active = false;

  const uniforms = {
    tReflection: { value: target.texture },
    reflectionMatrix: { value: textureMatrix },
    reflectionStrength: { value: STRENGTH },
    reflectionTexel: { value: texel },
    reflectionOn: { value: 0 },
  };

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 reflectionMatrix;\nvarying vec4 vReflectionUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReflectionUv = reflectionMatrix * vec4(position, 1.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform sampler2D tReflection;',
          'uniform float reflectionStrength;',
          'uniform float reflectionOn;',
          'uniform vec2 reflectionTexel;',
          'varying vec4 vReflectionUv;',
        ].join('\n')
      )
      .replace(
        '#include <opaque_fragment>',
        [
          'if (reflectionOn > 0.5) {',
          '  vec2 ruv = vReflectionUv.xy / vReflectionUv.w;',
          '  // Frosted: a small blur that grows on rougher ice.',
          '  float spread = 1.5 + roughnessFactor * 7.0;',
          '  vec3 refl = texture2D(tReflection, ruv).rgb * 0.36;',
          '  refl += texture2D(tReflection, ruv + vec2(reflectionTexel.x, 0.0) * spread).rgb * 0.16;',
          '  refl += texture2D(tReflection, ruv - vec2(reflectionTexel.x, 0.0) * spread).rgb * 0.16;',
          '  refl += texture2D(tReflection, ruv + vec2(0.0, reflectionTexel.y) * spread).rgb * 0.16;',
          '  refl += texture2D(tReflection, ruv - vec2(0.0, reflectionTexel.y) * spread).rgb * 0.16;',
          '  float gloss = clamp(1.0 - roughnessFactor * 1.4, 0.0, 1.0);',
          '  float facing = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);',
          '  float fresnel = 0.35 + 0.65 * pow(1.0 - facing, 3.0);',
          '  // Reflections add light and also hide a little of the white beneath.',
          '  float amount = reflectionStrength * gloss * fresnel;',
          '  outgoingLight = outgoingLight * (1.0 - amount * 0.55) + refl * amount;',
          '}',
          '#include <opaque_fragment>',
        ].join('\n')
      );
  };
  material.customProgramCacheKey = () => 'ice-reflection';
  material.needsUpdate = true;

  return {
    update(renderer, scene, camera) {
      ice.updateMatrixWorld();
      reflectorPos.setFromMatrixPosition(ice.matrixWorld);
      cameraPos.setFromMatrixPosition(camera.matrixWorld);
      view.subVectors(reflectorPos, cameraPos);
      // Camera under the ice (never in practice): nothing to reflect.
      if (view.dot(normal) > 0) {
        uniforms.reflectionOn.value = 0;
        return;
      }
      view.reflect(normal).negate().add(reflectorPos);
      rotation.extractRotation(camera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rotation).add(cameraPos);
      targetPos.subVectors(reflectorPos, lookAt).reflect(normal).negate().add(reflectorPos);
      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      virtualCamera.lookAt(targetPos);
      virtualCamera.far = camera.far;
      virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);
      textureMatrix.multiply(ice.matrixWorld);

      // Oblique near plane: clip everything below the ice out of the mirrored view.
      plane.setFromNormalAndCoplanarPoint(normal, reflectorPos);
      plane.applyMatrix4(virtualCamera.matrixWorldInverse);
      clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const p = virtualCamera.projectionMatrix.elements;
      q.x = (Math.sign(clipPlane.x) + p[8]) / p[0];
      q.y = (Math.sign(clipPlane.y) + p[9]) / p[5];
      q.z = -1;
      q.w = (1 + p[10]) / p[14];
      clipPlane.multiplyScalar(2 / clipPlane.dot(q));
      p[2] = clipPlane.x;
      p[6] = clipPlane.y;
      p[10] = clipPlane.z + 1 - 0.003;
      p[14] = clipPlane.w;

      const previousTarget = renderer.getRenderTarget();
      const previousShadowAuto = renderer.shadowMap.autoUpdate;
      ice.visible = false;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, virtualCamera);
      renderer.setRenderTarget(previousTarget);
      renderer.shadowMap.autoUpdate = previousShadowAuto;
      ice.visible = true;
      active = true;
      uniforms.reflectionOn.value = active ? 1 : 0;
    },
    setSize(width, height) {
      const w = Math.max(1, Math.round(width / 2));
      const h = Math.max(1, Math.round(height / 2));
      target.setSize(w, h);
      texel.set(1 / w, 1 / h);
    },
    dispose() {
      target.dispose();
      material.onBeforeCompile = () => {};
    },
  };
}
