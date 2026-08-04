// ============================================================================
// NUMBER SPRITE — unit tests
//
// jsdom (this file is `.dom.test.ts` - see vite.config.ts's
// `environmentMatchGlobs`) provides `document.createElement('canvas')`, which
// `createNumberSprite` needs to build its texture. Its 2D context is stubbed
// to null (src/test/setup.ts), so pixel content is never asserted here -
// only what does not depend on real drawing: canvas/texture resolution per
// quality tier, `THREE.Sprite`/`SpriteMaterial` shape, per-call instance
// identity, and dispose plumbing. Matches `iceTexture.ts`/`buildArena.ts`'s
// own established pattern for canvas-backed three.js objects under test.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createNumberSprite, NUMBER_SPRITE_Y, NUMBER_SPRITE_SCALE } from './numberSprite';

const PALETTE = { jersey: '#e63946' };

describe('createNumberSprite - canvas resolution per quality', () => {
  it('draws at 128px for quality "low"', () => {
    const { sprite } = createNumberSprite('9', PALETTE, 'low');
    const texture = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
  });

  it('draws at 256px for quality "medium"', () => {
    const { sprite } = createNumberSprite('9', PALETTE, 'medium');
    const texture = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(256);
  });

  it('draws at 256px for quality "high"', () => {
    const { sprite } = createNumberSprite('9', PALETTE, 'high');
    const texture = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(256);
  });
});

describe('createNumberSprite - shape', () => {
  it('builds a THREE.Sprite with a size-attenuated, transparent SpriteMaterial', () => {
    const { sprite } = createNumberSprite('27', PALETTE, 'high');
    expect(sprite).toBeInstanceOf(THREE.Sprite);
    const material = sprite.material as THREE.SpriteMaterial;
    expect(material).toBeInstanceOf(THREE.SpriteMaterial);
    expect(material.sizeAttenuation).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
  });

  it('positions at y ~= 2.05 and scales to ~0.5 world units', () => {
    const { sprite } = createNumberSprite('27', PALETTE, 'high');
    expect(sprite.position.y).toBeCloseTo(NUMBER_SPRITE_Y, 5);
    expect(NUMBER_SPRITE_Y).toBeCloseTo(2.05, 5);
    expect(sprite.scale.x).toBeCloseTo(NUMBER_SPRITE_SCALE, 5);
    expect(sprite.scale.y).toBeCloseTo(NUMBER_SPRITE_SCALE, 5);
    expect(NUMBER_SPRITE_SCALE).toBeCloseTo(0.5, 5);
  });
});

describe('createNumberSprite - distinct instances per actor', () => {
  it('never shares a canvas, texture, material or sprite between two calls', () => {
    const a = createNumberSprite('9', { jersey: '#e63946' }, 'high');
    const b = createNumberSprite('27', { jersey: '#2f80ed' }, 'high');

    expect(a.sprite).not.toBe(b.sprite);
    expect(a.sprite.material).not.toBe(b.sprite.material);
    const textureA = (a.sprite.material as THREE.SpriteMaterial).map;
    const textureB = (b.sprite.material as THREE.SpriteMaterial).map;
    expect(textureA).not.toBe(textureB);
    expect(textureA?.image).not.toBe(textureB?.image);
  });
});

describe('createNumberSprite - dispose', () => {
  it('disposes the texture and material, and only this instance\'s own', () => {
    const a = createNumberSprite('9', PALETTE, 'high');
    const b = createNumberSprite('27', PALETTE, 'high');

    const materialA = a.sprite.material as THREE.SpriteMaterial;
    const materialB = b.sprite.material as THREE.SpriteMaterial;
    const textureA = materialA.map as THREE.CanvasTexture;
    const textureB = materialB.map as THREE.CanvasTexture;

    const textureADispose = vi.spyOn(textureA, 'dispose');
    const materialADispose = vi.spyOn(materialA, 'dispose');
    const textureBDispose = vi.spyOn(textureB, 'dispose');
    const materialBDispose = vi.spyOn(materialB, 'dispose');

    a.dispose();

    expect(textureADispose).toHaveBeenCalledTimes(1);
    expect(materialADispose).toHaveBeenCalledTimes(1);
    expect(textureBDispose).not.toHaveBeenCalled();
    expect(materialBDispose).not.toHaveBeenCalled();
  });
});
