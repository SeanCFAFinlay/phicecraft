// ============================================================================
// ICE TEXTURE
//
// Bakes the SAME 2D rink painter CanvasSurface uses (`drawStaticLayer`) onto
// an offscreen canvas, once, top-down and unrotated - the ice mesh's texture
// map. This is the one place a drill's rink markings are drawn twice
// (2D canvas + this texture); everything else about the rink's geometry
// (dimensions, corner radius, marking layout) still comes from `RINK` /
// `RINK_MARKS`, so the two presentations can never disagree about where a
// line is.
// ============================================================================

import { drawStaticLayer } from '@/components/canvas/renderStatic';
import { RINK } from '@/core/constants';
import type { Camera } from '@/core/types';

/**
 * Resolution of the baked ice texture. Wide enough that goal-line paint and
 * faceoff-circle hashes stay crisp at a close orbit distance; taller
 * resolutions gain nothing a coach's screen can resolve at arm's length.
 */
export const ICE_TEXTURE_WIDTH = 2048;
export const ICE_TEXTURE_HEIGHT = 871;

/**
 * The camera that renders the WHOLE 1000x425 rink onto the
 * `ICE_TEXTURE_WIDTH`x`ICE_TEXTURE_HEIGHT` canvas, top-down and unrotated.
 *
 * `cameraMatrix` (src/utils/geometry.ts) maps a rink point to screen as
 * `zoom * R(rotation) * foreshorten(tilt) * (world - centre) + (camera.x +
 * zoom*centreX, camera.y + zoom*centreY)`. With `rotation = tilt = 0` that
 * collapses to `screen = zoom * world + (camera.x, camera.y)` (see
 * `cameraMatrix`'s own derivation of `e`/`f` for the identity-rotation case),
 * so:
 *   - `zoom = ICE_TEXTURE_WIDTH / RINK.width` maps the full rink width onto
 *     the full canvas width.
 *   - `x = y = 0` puts rink (0, 0) at canvas (0, 0) exactly.
 *
 * Worked check: rink (1000, 425) -> (2.048 * 1000, 2.048 * 425) =
 * (2048, 870.4) ~ (ICE_TEXTURE_WIDTH, ICE_TEXTURE_HEIGHT) - the rink's
 * 1000:425 aspect ratio is not an exact fraction of 2048:871, so the bottom
 * ~0.6px of the canvas is a sliver past the rink's bottom edge (a fraction of
 * a texel; invisible at any real resolution).
 *
 * This SUPERSEDES the brief's literal `{x:500, y:212.5, zoom:1, rotation:0,
 * tilt:0}` - that value is `cameraMatrix`'s IDENTITY camera (screen == rink
 * coordinates 1:1, so a 1000x425 rink would only fill the top-left 1000x425
 * px of a 2048x871 canvas, not the whole canvas the ice plane's UVs expect to
 * sample from edge to edge).
 */
export const FLAT_CAMERA: Camera = {
  x: 0,
  y: 0,
  zoom: ICE_TEXTURE_WIDTH / RINK.width,
  rotation: 0,
  tilt: 0,
};

export interface IceTexture {
  canvas: HTMLCanvasElement;
  dispose(): void;
}

/**
 * Renders deterministic procedural skate blade cuts, scuffs, and ice grain
 * across the rink, with higher concentration around creases and faceoff dots.
 */
function drawSkateScratches(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';

  // Seeded deterministic pseudo-random numbers (LCG)
  let seed = 42;
  const lcg = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // 1. General rink surface scratches (subtle arcs across the ice)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.beginPath();
  for (let i = 0; i < 240; i++) {
    const x = lcg() * width;
    const y = lcg() * height;
    const len = 15 + lcg() * 45;
    const angle = lcg() * Math.PI * 2;
    const curvature = (lcg() - 0.5) * 20;
    const midX = x + Math.cos(angle) * (len * 0.5) + Math.sin(angle) * curvature;
    const midY = y + Math.sin(angle) * (len * 0.5) - Math.cos(angle) * curvature;
    const endX = x + Math.cos(angle) * len;
    const endY = y + Math.sin(angle) * len;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
  }
  ctx.stroke();

  // 2. High-traffic skate shavings in goal creases (left end ~11% width, right end ~89% width)
  ctx.strokeStyle = 'rgba(240, 248, 255, 0.14)';
  const creaseCenters = [
    { x: width * 0.11, y: height * 0.5 },
    { x: width * 0.89, y: height * 0.5 },
  ];
  ctx.beginPath();
  for (const center of creaseCenters) {
    for (let i = 0; i < 60; i++) {
      const radius = lcg() * 55;
      const angle = lcg() * Math.PI * 2;
      const startX = center.x + Math.cos(angle) * radius;
      const startY = center.y + Math.sin(angle) * radius * 0.8;
      const cutAngle = angle + Math.PI / 2 + (lcg() - 0.5) * 0.8;
      const cutLen = 8 + lcg() * 18;
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + Math.cos(cutAngle) * cutLen, startY + Math.sin(cutAngle) * cutLen);
    }
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * Bakes the ice texture once. Real browsers only - jsdom's canvas
 * `getContext('2d')` is stubbed to return `null` (see src/test/setup.ts), so
 * this quietly no-ops to a blank canvas there rather than throwing; nothing
 * under test ever reads its pixels.
 */
export function createIceTexture(): IceTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ICE_TEXTURE_WIDTH;
  canvas.height = ICE_TEXTURE_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawStaticLayer(ctx, {
      camera: FLAT_CAMERA,
      width: ICE_TEXTURE_WIDTH,
      height: ICE_TEXTURE_HEIGHT,
      dpr: 1,
    });
    drawSkateScratches(ctx, ICE_TEXTURE_WIDTH, ICE_TEXTURE_HEIGHT);
  }

  return {
    canvas,
    dispose() {
      // Release the backing pixel buffer promptly rather than waiting on GC -
      // the same reasoning WebGLRenderer.dispose() callers already follow.
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
