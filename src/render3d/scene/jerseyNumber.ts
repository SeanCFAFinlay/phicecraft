// ============================================================================
// JERSEY NUMBER
//
// Both player models carry a `number` material: a curved panel across the
// back of the sweater that follows the torso and its bone weights, shipped
// fully transparent. This module prints one player's number onto it - a
// canvas texture per actor - so a single GLB serves every roster, and a
// player seen from behind (the chase camera, a breakaway from the far end)
// is identifiable from the sweater itself, not only from the floating badge.
//
// The digits are white with a dark outline on a dark sweater and the other
// way round on a light one, which is what makes them legible on any of the
// jersey colours a coach can pick.
// ============================================================================

import * as THREE from 'three';
import type { RenderQuality } from '@/render/quality';

export const JERSEY_NUMBER_MATERIAL = 'number';

export interface JerseyNumber {
  /** Panels that were found and printed (or hidden, for a player with no number). */
  readonly panels: number;
  dispose(): void;
}

/** Relative luminance of a CSS hex colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  const digits = match[1].length === 3 ? match[1].replace(/./g, c => c + c) : match[1];
  const [r, g, b] = [0, 2, 4].map(i => {
    const channel = parseInt(digits.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Fill and outline for digits printed on a sweater of `jersey`. */
export function numberColours(jersey: string, accent: string): { fill: string; outline: string } {
  const light = luminance(jersey) > 0.45;
  const fill = light ? '#0b1622' : '#ffffff';
  // The accent makes the best outline, unless it would vanish into the sweater.
  const accentStandsOut = Math.abs(luminance(accent) - luminance(jersey)) > 0.18;
  const outline = accentStandsOut ? accent : light ? '#ffffff' : '#0b1622';
  return { fill, outline };
}

function drawNumber(number: string, colours: { fill: string; outline: string }, quality: RenderQuality): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const width = quality === 'low' ? 128 : 256;
  const height = Math.round(width * 0.75);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  const size = Math.round(height * (number.length > 2 ? 0.62 : 0.78));
  ctx.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.14;
  ctx.strokeStyle = colours.outline;
  ctx.strokeText(number, width / 2, height * 0.54, width * 0.92);
  ctx.fillStyle = colours.fill;
  ctx.fillText(number, width / 2, height * 0.54, width * 0.92);
  return canvas;
}

/**
 * Prints `number` on every `number` panel under `root`, replacing the shared
 * transparent material with this actor's own. Call once per cloned actor,
 * after tinting. Without a number (or without a canvas) the panel is hidden.
 */
export function applyJerseyNumber(
  root: THREE.Object3D,
  number: string | undefined,
  palette: { jersey: string; accent: string },
  quality: RenderQuality = 'high'
): JerseyNumber {
  const owned: THREE.Material[] = [];
  const canvas = number ? drawNumber(number, numberColours(palette.jersey, palette.accent), quality) : null;
  const texture = canvas ? new THREE.CanvasTexture(canvas) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    // glTF UVs put v = 0 at the top of the image, the same way a canvas does.
    texture.flipY = false;
    texture.anisotropy = quality === 'low' ? 1 : 4;
  }

  let panels = 0;
  const print = (material: THREE.Material): THREE.Material => {
    if (material.name !== JERSEY_NUMBER_MATERIAL) return material;
    panels++;
    const printed = new THREE.MeshStandardMaterial({
      name: JERSEY_NUMBER_MATERIAL,
      map: texture,
      color: '#ffffff',
      roughness: 0.75,
      metalness: 0,
      side: THREE.FrontSide,
      // Cut-out rather than blended: the digits never need sorting against
      // the sweater, and the panel's empty area simply is not drawn.
      alphaTest: 0.45,
      transparent: false,
      // Pull the print toward the camera so it never flickers into the cloth.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      visible: Boolean(texture),
    });
    owned.push(printed);
    return printed;
  };

  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.material = Array.isArray(node.material) ? node.material.map(print) : print(node.material);
  });

  return {
    panels,
    dispose() {
      for (const material of owned) material.dispose();
      texture?.dispose();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
  };
}
