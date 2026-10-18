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
  quality: RenderQuality = 'high',
  playerName?: string
): NumberSprite {
  if (typeof document === 'undefined') {
    const sprite = new THREE.Sprite();
    sprite.name = 'number-sprite';
    sprite.position.set(0, 2.05, 0);
    return { sprite, dispose() {} };
  }

  const size = quality === 'low' ? 128 : 256;
  const canvas = document.createElement('canvas');
  canvas.width = playerName ? size * 2 : size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    const radius = size * (playerName ? 0.30 : 0.42);
    const center = canvas.width / 2;
    const centerY = size * (playerName ? 0.36 : 0.5);

    ctx.clearRect(0, 0, canvas.width, size);

    // Dark shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = size * 0.08;
    ctx.shadowOffsetY = size * 0.04;

    // Jersey-colored disc
    ctx.fillStyle = palette.jersey;
    ctx.beginPath();
    ctx.arc(center, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // White border ring
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = size * 0.06;
    ctx.stroke();

    // High contrast number
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(size * (playerName ? 0.30 : 0.46))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number, center, centerY + size * 0.02, radius * 1.65);
    if (playerName) {
      ctx.fillStyle = '#07131e';
      ctx.fillRect(0, size * 0.72, canvas.width, size * 0.28);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(size * 0.20)}px system-ui, sans-serif`;
      ctx.fillText(playerName, center, size * 0.86, canvas.width * 0.94);
    }
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
  sprite.scale.set(playerName ? 1.4 : 0.55, playerName ? 0.7 : 0.55, 1);

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
