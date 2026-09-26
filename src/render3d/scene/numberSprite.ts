// ============================================================================
// NUMBER SPRITE
//
// Overhead jersey number billboard for 3D skaters and goalies. Renders a
// high-contrast numbered token as a THREE.Sprite billboard that faces the
// camera at any orbit angle.
// ============================================================================

import * as THREE from 'three';
import type { RenderQuality } from '@/render/quality';

export interface NumberSprite {
  sprite: THREE.Sprite;
  dispose(): void;
}

export function createNumberSprite(
  number: string,
  palette: { jersey: string },
  quality: RenderQuality = 'high'
): NumberSprite {
  if (typeof document === 'undefined') {
    const sprite = new THREE.Sprite();
    sprite.name = 'number-sprite';
    sprite.position.set(0, 2.05, 0);
    return { sprite, dispose() {} };
  }

  const size = quality === 'low' ? 128 : 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    const radius = size * 0.42;
    const center = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Dark shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = size * 0.08;
    ctx.shadowOffsetY = size * 0.04;

    // Jersey-colored disc
    ctx.fillStyle = palette.jersey;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();

    // White border ring
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = size * 0.06;
    ctx.stroke();

    // High contrast number
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(size * 0.46)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.slice(0, 2), center, center + size * 0.02);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.name = 'number-sprite';
  // Position above player head (player model is ~1.85m tall)
  sprite.position.set(0, 2.05, 0);
  sprite.scale.set(0.55, 0.55, 1);

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
