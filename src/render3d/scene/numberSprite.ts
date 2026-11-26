// ============================================================================
// NUMBER SPRITE
//
// A small jersey-number tag floating above each player, always facing the
// camera. It keeps a steady size ON SCREEN rather than in the world: from the
// tabletop views it stays readable, and from ice level it shrinks instead of
// ballooning over the player's head - and fades out entirely for anyone
// right in front of the camera, whose number is on their back anyway.
//
// It lives on the no-reflect layer so the ice never mirrors a floating label.
// ============================================================================

import * as THREE from 'three';
import type { RenderQuality } from '@/render/quality';

export interface NumberSprite {
  sprite: THREE.Sprite;
  dispose(): void;
}

/** Same value as arena/iceReflection.ts's NO_REFLECT_LAYER (kept local so this module stays leaf-level). */
const NO_REFLECT_LAYER = 1;
/** World height of the tag per metre of camera distance: a constant size on screen. */
const SCREEN_SCALE = 0.021;
const MIN_HEIGHT = 0.16;
const MAX_HEIGHT = 1.0;
/** Fully hidden nearer than this (metres), fully shown past FADE_END. */
const FADE_START = 3.5;
const FADE_END = 8;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createNumberSprite(
  number: string,
  palette: { jersey: string },
  quality: RenderQuality = 'high',
  playerName?: string
): NumberSprite {
  if (typeof document === 'undefined') {
    const sprite = new THREE.Sprite();
    sprite.name = 'number-sprite';
    sprite.position.set(0, 2.05, 0);
    return { sprite, dispose() {} };
  }

  const h = quality === 'low' ? 64 : 128;
  const tagW = Math.round(h * 1.45);
  const canvas = document.createElement('canvas');
  canvas.width = playerName ? h * 4 : tagW;
  canvas.height = playerName ? Math.round(h * 1.6) : h;
  const aspect = canvas.width / canvas.height;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const x = (canvas.width - tagW) / 2;
    const pad = h * 0.08;
    // Team-coloured tag with a crisp white rim.
    roundedRect(ctx, x + pad, pad, tagW - pad * 2, h - pad * 2, h * 0.24);
    ctx.fillStyle = palette.jersey;
    ctx.fill();
    ctx.lineWidth = h * 0.06;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(h * 0.52)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number, canvas.width / 2, h * 0.53, tagW * 0.78);
    if (playerName) {
      ctx.font = `700 ${Math.round(h * 0.3)}px system-ui, sans-serif`;
      const label = playerName;
      const width = Math.min(canvas.width * 0.96, ctx.measureText(label).width + h * 0.4);
      roundedRect(ctx, (canvas.width - width) / 2, h * 1.02, width, h * 0.5, h * 0.14);
      ctx.fillStyle = 'rgba(7,19,30,0.82)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, canvas.width / 2, h * 1.28, canvas.width * 0.92);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'number-sprite';
  sprite.layers.set(NO_REFLECT_LAYER);
  sprite.position.set(0, 2.05, 0);
  // The tag's height is the number tag itself; a name label adds below it.
  const tagHeightShare = playerName ? 1 / 1.6 : 1;
  const baseHeight = 0.5 / tagHeightShare;
  sprite.scale.set(baseHeight * aspect, baseHeight, 1);
  // Anchor at the bottom so it grows upward, away from the helmet.
  sprite.center.set(0.5, 0);

  const worldPos = new THREE.Vector3();
  const cameraPos = new THREE.Vector3();
  sprite.onBeforeRender = (_renderer, _scene, camera) => {
    sprite.getWorldPosition(worldPos);
    camera.getWorldPosition(cameraPos);
    const distance = worldPos.distanceTo(cameraPos);
    const tag = THREE.MathUtils.clamp(distance * SCREEN_SCALE, MIN_HEIGHT, MAX_HEIGHT);
    const height = tag / tagHeightShare;
    sprite.scale.set(height * aspect, height, 1);
    material.opacity = THREE.MathUtils.smoothstep(distance, FADE_START, FADE_END);
    sprite.updateMatrixWorld();
    sprite.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, sprite.matrixWorld);
  };

  return {
    sprite,
    dispose() {
      material.dispose();
      texture.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
