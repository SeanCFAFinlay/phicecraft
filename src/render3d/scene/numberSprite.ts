// ============================================================================
// NUMBER SPRITE
//
// One jersey-number billboard: a `THREE.Sprite` (auto camera-facing, unlike a
// plane mesh which would need its own look-at logic every frame) textured
// from a small canvas drawn once at construction - white digits on a rounded
// jersey-colour chip, matching the jersey tint `tintActorMaterials` already
// applies to the model itself (`actors.ts`'s `createActor` passes the SAME
// `opts.jersey` string here as the chip colour, not a separate palette
// lookup, so a jersey recolour can never drift the two out of sync).
//
// Attached at a fixed local offset on the actor root (`NUMBER_SPRITE_Y`)
// rather than the head bone: actors are a static ~1.8m tall rig with no head
// bob authored into any clip, so a root-local Y offset reads as "over the
// head" for the whole animation without per-frame bone lookups.
// ============================================================================

import * as THREE from 'three';
import type { RenderQuality } from '@/render/quality';

/** World-metres above the actor root the chip's centre sits at - actors are ~1.8m tall, this clears the head. */
export const NUMBER_SPRITE_Y = 2.05;
/** World-metre width/height of the billboard - readable at a default-zoom orbit without dwarfing the ~1.8m actor. */
export const NUMBER_SPRITE_SCALE = 0.5;

/**
 * Texture canvas resolution, per the plan's Global Constraints quality tiers:
 * 'low' halves it, 'medium'/'high' both get the full resolution - a jersey
 * number never needs more detail than 'medium' already provides, so there is
 * no separate 'high' tier to keep in sync.
 */
const CANVAS_SIZE_LOW = 128;
const CANVAS_SIZE_DEFAULT = 256;

const CHIP_INSET_FRACTION = 0.1;
const CHIP_CORNER_RADIUS_FRACTION = 0.22;
const NUMBER_COLOR = '#ffffff';

export interface NumberSpritePalette {
  jersey: string;
}

export interface NumberSprite {
  sprite: THREE.Sprite;
  dispose(): void;
}

export function canvasSizeForQuality(quality: RenderQuality): number {
  return quality === 'low' ? CANVAS_SIZE_LOW : CANVAS_SIZE_DEFAULT;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws `number` white-on-jersey-colour onto a fresh canvas sized for
 * `quality`. Real browsers only - jsdom's canvas `getContext('2d')` is
 * stubbed to return null (see src/test/setup.ts, and `iceTexture.ts`'s own
 * note on the same stub), so this quietly no-ops to a blank (transparent)
 * canvas there. `numberSprite.dom.test.ts` never asserts on drawn pixels -
 * only canvas/texture dimensions, dispose plumbing, and per-actor instance
 * identity - so that no-op is harmless under test.
 */
function drawNumberCanvas(
  number: string,
  palette: NumberSpritePalette,
  quality: RenderQuality
): HTMLCanvasElement {
  const size = canvasSizeForQuality(quality);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    const inset = size * CHIP_INSET_FRACTION;
    const chipSize = size - inset * 2;
    const radius = chipSize * CHIP_CORNER_RADIUS_FRACTION;

    roundedRectPath(ctx, inset, inset, chipSize, chipSize, radius);
    ctx.fillStyle = palette.jersey;
    ctx.fill();

    ctx.fillStyle = NUMBER_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(size * 0.52)}px sans-serif`;
    ctx.fillText(number, size / 2, size / 2 + size * 0.02);
  }

  return canvas;
}

/**
 * Builds one jersey-number billboard, ready to `root.add(sprite.sprite)`.
 * Every call draws its own fresh canvas/texture/material - never shared
 * across actors - so two skaters with different numbers or jersey colours
 * never fight over the same texture, and `dispose()` only ever frees this
 * one sprite's own GPU resources.
 */
export function createNumberSprite(
  number: string,
  palette: NumberSpritePalette,
  quality: RenderQuality
): NumberSprite {
  const canvas = drawNumberCanvas(number, palette, quality);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.name = 'number-sprite';
  sprite.position.set(0, NUMBER_SPRITE_Y, 0);
  sprite.scale.set(NUMBER_SPRITE_SCALE, NUMBER_SPRITE_SCALE, 1);

  return {
    sprite,
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}
