// ============================================================================
// ICE SURFACE
//
// The 3D sheet has its own painter. The 2D diagram's ice is tuned for a flat
// coaching diagram (zone tints, a drawn goal, bench labels); the 3D view
// wants what a real sheet looks like from the stands: markings painted UNDER
// a layer of ice (slightly soft at the edges and a touch translucent), a
// near-white surface with a faint blue cast, snow piled along the boards, and
// skate cuts concentrated where the play happens.
//
// Every marking still comes from `RINK` / `RINK_MARKS`, so the 3D sheet and
// the 2D diagram can never disagree about where a line is.
//
// Two canvases are baked:
//   - colour: the visible sheet (also the alpha mask that rounds the corners)
//   - roughness: green channel, read by MeshPhysicalMaterial. Fresh, flooded
//     ice is glossy; skate-cut traffic areas and the snow along the boards are
//     matte. That variation is what makes light reflect off the ice the way
//     it does in a real arena instead of a uniform plastic sheen.
// ============================================================================

import * as THREE from 'three';
import { RINK, RINK_MARKS as M, FT } from '@/core/constants';
import { centreIceLogo, fitInCircle } from '@/render/teamLogo';
import type { RenderQuality } from '@/render/quality';
import { ICE_LENGTH, ICE_WIDTH, seededRandom } from './layout';

/** Regulation paint, slightly deeper than the 2D diagram's colours, as it reads under ice. */
export const ICE_PAINT = {
  red: '#c3102f',
  blue: '#103a9a',
  creaseFill: '#5fb4e6',
  ice: '#eef4f8',
} as const;

export function iceTextureSize(quality: RenderQuality): { width: number; height: number } {
  const width = quality === 'high' ? 4096 : 2048;
  return { width, height: Math.round((width * RINK.height) / RINK.width) };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Minor lines (goal lines, circles, creases) are 2 in wide. */
const MINOR = M.lineWidthMinor;
const MAJOR = M.lineWidthMajor;

function strokeCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, width = MINOR): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * An end-zone spot: 2 ft across, outlined in red, the middle band red and
 * the two caps (3 in each side, toward the goal and toward centre) white.
 */
function endZoneSpot(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const r = M.faceoffSpotRadius;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();
  const band = r - (3 / 12) * FT;
  ctx.fillStyle = ICE_PAINT.red;
  ctx.fillRect(cx - band, cy - r, band * 2, r * 2);
  ctx.restore();
  strokeCircle(ctx, cx, cy, r - MINOR / 2, ICE_PAINT.red);
}

function endZoneCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const r = M.faceoffCircleRadius;
  strokeCircle(ctx, cx, cy, r, ICE_PAINT.red);
  // Hash marks off the top and bottom of the circle.
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const x = cx + (sx * M.hashSeparation) / 2;
      const y0 = cy + sy * Math.sqrt(r * r - (M.hashSeparation / 2) ** 2);
      line(ctx, x, y0, x, cy + sy * (r + M.hashLength), ICE_PAINT.red, MINOR);
    }
  }
  // The L-shaped alignment marks around the spot.
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const y = cy + sy * (9 / 12) * FT;
      const inner = cx + sx * M.markGapX;
      const outer = inner + sx * M.markLongArm;
      ctx.strokeStyle = ICE_PAINT.red;
      ctx.lineWidth = MINOR;
      ctx.beginPath();
      ctx.moveTo(outer, y);
      ctx.lineTo(inner, y);
      ctx.lineTo(inner, y + sy * M.markShortArm);
      ctx.stroke();
    }
  }
  endZoneSpot(ctx, cx, cy);
}

function crease(ctx: CanvasRenderingContext2D, goalLineX: number, direction: 1 | -1): void {
  const cy = RINK.centerY;
  const r = M.creaseRadius;
  const hw = M.creaseHalfWidth;
  const a = Math.asin(hw / r);
  ctx.beginPath();
  ctx.moveTo(goalLineX, cy - hw);
  if (direction === 1) {
    ctx.lineTo(goalLineX + Math.cos(a) * r, cy - hw);
    ctx.arc(goalLineX, cy, r, -a, a);
  } else {
    ctx.lineTo(goalLineX - Math.cos(a) * r, cy - hw);
    ctx.arc(goalLineX, cy, r, Math.PI + a, Math.PI - a, true);
  }
  ctx.lineTo(goalLineX, cy + hw);
  ctx.closePath();
  ctx.fillStyle = ICE_PAINT.creaseFill;
  ctx.globalAlpha = 0.82;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ICE_PAINT.red;
  ctx.lineWidth = MINOR;
  ctx.stroke();
  // The 5 in tick marks 4 ft out from the goal line on each side.
  for (const sy of [-1, 1]) {
    const x = goalLineX + direction * 4 * FT;
    line(ctx, x, cy + sy * hw, x, cy + sy * (hw - (5 / 12) * FT), ICE_PAINT.red, MINOR);
  }
}

function centreLine(ctx: CanvasRenderingContext2D): void {
  // Red, 12 in, broken by white checks so it can't be mistaken for a blue line.
  const x = RINK.centerX;
  ctx.fillStyle = ICE_PAINT.red;
  ctx.fillRect(x - MAJOR / 2, 0, MAJOR, RINK.height);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const check = 1 * FT;
  for (let y = check * 0.5; y < RINK.height; y += check * 3) {
    ctx.fillRect(x - MAJOR * 0.22, y, MAJOR * 0.44, check);
  }
}

function centreLogo(ctx: CanvasRenderingContext2D): void {
  const logo = centreIceLogo();
  if (!logo || !logo.complete || logo.naturalWidth === 0) return;
  const radius = M.faceoffCircleRadius * 0.82;
  const size = fitInCircle(logo.naturalWidth, logo.naturalHeight, radius);
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.drawImage(logo, RINK.centerX - size.width / 2, RINK.centerY - size.height / 2, size.width, size.height);
  ctx.restore();
}

/** Blurs everything drawn by `draw` by `px` canvas pixels: paint seen through a layer of ice. */
function underIce(ctx: CanvasRenderingContext2D, px: number, draw: () => void): void {
  ctx.save();
  ctx.filter = `blur(${px}px)`;
  draw();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.9;
  draw();
  ctx.restore();
}

function paintMarkings(ctx: CanvasRenderingContext2D): void {
  const cy = RINK.centerY;
  ctx.lineCap = 'butt';
  // Goal lines - full width, clipped by the rounded outline.
  for (const gx of [RINK.goalLineLeftX, RINK.goalLineRightX]) line(ctx, gx, 0, gx, RINK.height, ICE_PAINT.red, MINOR);
  // Trapezoids behind each net.
  for (const [gx, bx] of [[RINK.goalLineLeftX, 0], [RINK.goalLineRightX, RINK.width]] as const) {
    for (const sy of [-1, 1]) {
      line(ctx, gx, cy + sy * M.trapezoidGoalLineHalfWidth, bx, cy + sy * M.trapezoidBoardsHalfWidth, ICE_PAINT.red, MINOR);
    }
  }
  // Blue lines.
  for (const bx of [RINK.blueLineLeftX, RINK.blueLineRightX]) {
    ctx.fillStyle = ICE_PAINT.blue;
    ctx.fillRect(bx - MAJOR / 2, 0, MAJOR, RINK.height);
  }
  centreLine(ctx);
  // Centre circle and spot.
  strokeCircle(ctx, RINK.centerX, cy, M.faceoffCircleRadius, ICE_PAINT.blue);
  ctx.fillStyle = ICE_PAINT.blue;
  ctx.beginPath();
  ctx.arc(RINK.centerX, cy, M.centerSpotRadius, 0, Math.PI * 2);
  ctx.fill();
  // Referee's crease against the near boards, in front of the scorer's table.
  ctx.strokeStyle = ICE_PAINT.red;
  ctx.lineWidth = MINOR;
  ctx.beginPath();
  ctx.arc(RINK.centerX, RINK.height, M.refereeCreaseRadius, Math.PI, Math.PI * 2);
  ctx.stroke();
  // Neutral-zone spots.
  for (const bx of [RINK.blueLineLeftX + M.neutralSpotFromBlueLine, RINK.blueLineRightX - M.neutralSpotFromBlueLine]) {
    for (const sy of [-1, 1]) {
      ctx.fillStyle = ICE_PAINT.red;
      ctx.beginPath();
      ctx.arc(bx, cy + sy * M.spotOffsetFromCenterY, M.faceoffSpotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // End-zone circles.
  for (const cx of [RINK.goalLineLeftX + M.endZoneSpotFromGoalLine, RINK.goalLineRightX - M.endZoneSpotFromGoalLine]) {
    for (const sy of [-1, 1]) endZoneCircle(ctx, cx, cy + sy * M.spotOffsetFromCenterY);
  }
  crease(ctx, RINK.goalLineLeftX, 1);
  crease(ctx, RINK.goalLineRightX, -1);
}

/** Skate cuts: long shallow arcs everywhere, dense tight cuts around the creases and dots. */
function paintSkateCuts(ctx: CanvasRenderingContext2D, color: string, alphaScale: number): void {
  const random = seededRandom(1907);
  ctx.save();
  ctx.lineCap = 'round';
  const hotspots: { x: number; y: number; r: number; n: number }[] = [
    { x: RINK.goalLineLeftX + 3 * FT, y: RINK.centerY, r: 9 * FT, n: 260 },
    { x: RINK.goalLineRightX - 3 * FT, y: RINK.centerY, r: 9 * FT, n: 260 },
    { x: RINK.centerX, y: RINK.centerY, r: 12 * FT, n: 140 },
  ];
  for (const cx of [RINK.goalLineLeftX + M.endZoneSpotFromGoalLine, RINK.goalLineRightX - M.endZoneSpotFromGoalLine]) {
    for (const sy of [-1, 1]) hotspots.push({ x: cx, y: RINK.centerY + sy * M.spotOffsetFromCenterY, r: 7 * FT, n: 90 });
  }
  // Broad, long glides across the whole sheet.
  ctx.lineWidth = 0.22;
  for (let i = 0; i < 1400; i++) {
    const x = random() * RINK.width;
    const y = random() * RINK.height;
    const len = (6 + random() * 26) * FT * 0.5;
    const angle = (random() - 0.5) * 0.9 + (random() < 0.7 ? 0 : Math.PI / 2);
    const bend = (random() - 0.5) * len * 0.5;
    ctx.strokeStyle = color.replace('A', String((0.05 + random() * 0.09) * alphaScale));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(angle) * len * 0.5 - Math.sin(angle) * bend,
      y + Math.sin(angle) * len * 0.5 + Math.cos(angle) * bend,
      x + Math.cos(angle) * len,
      y + Math.sin(angle) * len
    );
    ctx.stroke();
  }
  // Tight cuts and stops where the play concentrates.
  for (const spot of hotspots) {
    for (let i = 0; i < spot.n; i++) {
      const radius = Math.sqrt(random()) * spot.r;
      const angle = random() * Math.PI * 2;
      const x = spot.x + Math.cos(angle) * radius;
      const y = spot.y + Math.sin(angle) * radius;
      const cut = angle + Math.PI / 2 + (random() - 0.5);
      const len = (1 + random() * 4) * FT * 0.5;
      ctx.lineWidth = 0.18 + random() * 0.3;
      ctx.strokeStyle = color.replace('A', String((0.08 + random() * 0.14) * alphaScale));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(cut) * len, y + Math.sin(cut) * len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Snow scraped up against the boards: a soft matte band all the way round. */
function paintBoardSnow(ctx: CanvasRenderingContext2D, alpha: number, color: string): void {
  ctx.save();
  roundedRect(ctx, 0, 0, RINK.width, RINK.height, RINK.cornerRadius);
  ctx.clip();
  for (let i = 0; i < 6; i++) {
    const inset = i * 0.9 * FT * 0.5;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * (1 - i / 6);
    ctx.lineWidth = 2.2 * FT * 0.5;
    roundedRect(ctx, inset, inset, RINK.width - inset * 2, RINK.height - inset * 2, Math.max(1, RINK.cornerRadius - inset));
    ctx.stroke();
  }
  ctx.restore();
}

function paintColour(ctx: CanvasRenderingContext2D, scale: number): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, RINK.width, RINK.height);
  ctx.save();
  roundedRect(ctx, 0, 0, RINK.width, RINK.height, RINK.cornerRadius);
  ctx.clip();

  // The sheet: near white with a faint blue cast, very slightly brighter in
  // the middle where it was flooded last.
  const base = ctx.createRadialGradient(RINK.centerX, RINK.centerY, 20, RINK.centerX, RINK.centerY, RINK.width * 0.55);
  base.addColorStop(0, '#f3f8fb');
  base.addColorStop(1, '#e4edf3');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, RINK.width, RINK.height);

  // Large, faint mottling: ice is never one flat colour.
  const random = seededRandom(77);
  for (let i = 0; i < 90; i++) {
    const x = random() * RINK.width;
    const y = random() * RINK.height;
    const r = (10 + random() * 40) * FT * 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tint = random() < 0.5 ? '200,222,236' : '255,255,255';
    g.addColorStop(0, `rgba(${tint},${0.05 + random() * 0.08})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  centreLogo(ctx);
  const blurPx = Math.max(0.6, scale * 0.35);
  underIce(ctx, blurPx, () => paintMarkings(ctx));

  paintSkateCuts(ctx, 'rgba(255,255,255,A)', 1.4);
  paintSkateCuts(ctx, 'rgba(120,140,155,A)', 0.35);
  paintBoardSnow(ctx, 0.5, '#f8fbfd');
  ctx.restore();
}

function paintRoughness(ctx: CanvasRenderingContext2D, scale: number): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  // Mid-gloss everywhere (green 0.32), polished down the middle of each zone,
  // matte where the skates have been.
  ctx.fillStyle = 'rgb(0,82,0)';
  ctx.fillRect(0, 0, RINK.width, RINK.height);
  const random = seededRandom(5);
  for (let i = 0; i < 40; i++) {
    const x = random() * RINK.width;
    const y = RINK.height * (0.25 + random() * 0.5);
    const r = (18 + random() * 30) * FT * 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,40,0,0.5)');
    g.addColorStop(1, 'rgba(0,40,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  paintSkateCuts(ctx, 'rgba(0,200,0,A)', 3.5);
  paintBoardSnow(ctx, 0.85, 'rgb(0,235,0)');
}

export interface IceSurface {
  mesh: THREE.Mesh;
  /** Re-bakes the sheet (a new centre-ice logo). */
  redraw(): void;
  dispose(): void;
}

/**
 * The ice: a plane exactly the size of the rink, flat on y = 0, its corners
 * cut round by the colour texture's alpha. Real browsers only paint the
 * textures; under jsdom the canvases stay blank and nothing reads them.
 */
export function createIceSurface(quality: RenderQuality): IceSurface {
  const { width, height } = iceTextureSize(quality);
  const scale = width / RINK.width;

  const colourCanvas = document.createElement('canvas');
  colourCanvas.width = width;
  colourCanvas.height = height;
  const roughCanvas = document.createElement('canvas');
  const roughScale = quality === 'low' ? 0 : scale / 2;
  roughCanvas.width = Math.max(1, Math.round(width / 2));
  roughCanvas.height = Math.max(1, Math.round(height / 2));

  const paint = () => {
    const ctx = colourCanvas.getContext('2d');
    if (ctx) paintColour(ctx, scale);
    const rctx = roughScale ? roughCanvas.getContext('2d') : null;
    if (rctx) paintRoughness(rctx, roughScale);
  };
  paint();

  const map = new THREE.CanvasTexture(colourCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;
  const roughnessMap = roughScale ? new THREE.CanvasTexture(roughCanvas) : null;
  if (roughnessMap) roughnessMap.anisotropy = 8;

  const geometry = new THREE.PlaneGeometry(ICE_LENGTH, ICE_WIDTH);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap,
    // The roughness map's green channel is multiplied by this.
    roughness: roughnessMap ? 0.95 : 0.38,
    metalness: 0,
    clearcoat: quality === 'low' ? 0 : 0.35,
    clearcoatRoughness: 0.32,
    alphaTest: 0.5,
    envMapIntensity: 0.7,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ice';
  mesh.receiveShadow = true;

  return {
    mesh,
    redraw() {
      paint();
      map.needsUpdate = true;
      if (roughnessMap) roughnessMap.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      map.dispose();
      roughnessMap?.dispose();
      colourCanvas.width = colourCanvas.height = 0;
      roughCanvas.width = roughCanvas.height = 0;
    },
  };
}
