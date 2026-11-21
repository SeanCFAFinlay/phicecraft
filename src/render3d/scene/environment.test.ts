import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyArenaEnvironment } from './environment';

describe('applyArenaEnvironment', () => {
  it('leaves the low tier without a reflection environment', () => {
    const scene = new THREE.Scene();
    const cleanup = applyArenaEnvironment({} as THREE.WebGLRenderer, scene, 'low');
    expect(scene.environment).toBeNull();
    expect(() => cleanup()).not.toThrow();
  });

  it('keeps drawing, without reflections, when the context cannot prefilter', () => {
    const scene = new THREE.Scene();
    // Not a real renderer: PMREMGenerator throws on its first GPU call.
    const cleanup = applyArenaEnvironment({} as THREE.WebGLRenderer, scene, 'high');
    expect(scene.environment).toBeNull();
    expect(() => cleanup()).not.toThrow();
  });
});
