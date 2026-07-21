// ============================================================================
// COACH RENDERER
//
// The big bearded coach standing on the ice. Rendered top-down in the flat
// diagram and as an upright, camera-facing piece in the tabletop view - the
// same extruded language as the players and boards, but unmistakably a coach:
// toque, heavy jacket, and a full beard.
// ============================================================================

import type { CoachMarker, Camera } from '@/core/types';
import { PLAYER_RADIUS } from '@/core/constants';
import { cameraMatrix, applyAffine } from '@/utils/geometry';

const COACH_RADIUS = PLAYER_RADIUS * 1.28;

const JACKET = '#243244';
const JACKET_LIGHT = '#33475f';
const JACKET_DARK = '#141d28';
const SKIN = '#e7b48c';
const SKIN_SHADE = '#c98f66';
const BEARD = '#6f4a2c';
const BEARD_LIGHT = '#8a5f3b';
const TOQUE = '#b5313b';
const TOQUE_DARK = '#7f1f27';

function ellipsePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
}

/**
 * Top-down coach marker for the flat diagram: a heavy dark disc with a toque
 * band, a beard arc and a little clipboard so it never reads as a skater.
 */
export function drawCoachTopDown(
  ctx: CanvasRenderingContext2D,
  coach: CoachMarker,
  isSelected: boolean
): void {
  const { x, y } = coach;
  const r = COACH_RADIUS;

  if (isSelected) {
    ctx.strokeStyle = 'rgba(255, 210, 10, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ellipsePath(ctx, x, y, r + 10, r + 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Jacket / body disc.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  g.addColorStop(0, JACKET_LIGHT);
  g.addColorStop(1, JACKET_DARK);
  ellipsePath(ctx, x, y, r, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // Toque band across the top of the head.
  ctx.fillStyle = TOQUE;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.12, r * 0.62, r * 0.5, 0, Math.PI, 0);
  ctx.fill();

  // Face.
  ctx.fillStyle = SKIN;
  ellipsePath(ctx, x, y + r * 0.06, r * 0.52, r * 0.5);
  ctx.fill();

  // Beard covering the lower face.
  ctx.fillStyle = BEARD;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.2, r * 0.52, r * 0.42, 0, 0, Math.PI);
  ctx.fill();

  // Clipboard tucked to the side.
  ctx.fillStyle = '#d9c38a';
  ctx.strokeStyle = JACKET_DARK;
  ctx.lineWidth = 1;
  ctx.fillRect(x + r * 0.5, y - r * 0.2, r * 0.5, r * 0.66);
  ctx.strokeRect(x + r * 0.5, y - r * 0.2, r * 0.5, r * 0.66);

  // Label.
  ctx.fillStyle = 'rgba(230, 240, 248, 0.9)';
  ctx.font = `700 ${Math.max(6, r * 0.42)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('COACH', x, y + r + 2);
}

/**
 * Upright tabletop coach piece, drawn in screen space at its projected ground
 * point `g`, rising by `height`.
 */
export function drawCoachStanding(
  ctx: CanvasRenderingContext2D,
  g: { x: number; y: number },
  z: number,
  k: number,
  height: number,
  isSelected: boolean
): void {
  const bodyR = COACH_RADIUS * z * 0.95;
  const baseRx = bodyR;
  const baseRy = Math.max(bodyR * 0.34, bodyR * k);
  const topY = g.y - height * 1.12; // coach stands a touch taller than skaters
  const headR = bodyR * 0.72;

  // Contact shadow.
  ellipsePath(ctx, g.x, g.y + baseRy * 0.15, baseRx * 1.25, baseRy * 1.25);
  ctx.fillStyle = 'rgba(6, 16, 26, 0.34)';
  ctx.fill();

  if (isSelected) {
    ctx.save();
    ctx.setLineDash([baseRx * 0.35, baseRx * 0.28]);
    ctx.lineWidth = Math.max(2, bodyR * 0.2);
    ctx.strokeStyle = 'rgba(255, 210, 10, 0.9)';
    ellipsePath(ctx, g.x, g.y + baseRy * 0.15, baseRx * 1.45, baseRy * 1.45);
    ctx.stroke();
    ctx.restore();
  }

  // Jacket body (broad shoulders).
  const bodyGrad = ctx.createLinearGradient(0, topY, 0, g.y);
  bodyGrad.addColorStop(0, JACKET_LIGHT);
  bodyGrad.addColorStop(0.5, JACKET);
  bodyGrad.addColorStop(1, JACKET_DARK);
  ctx.beginPath();
  ctx.moveTo(g.x - baseRx, topY);
  ctx.lineTo(g.x - baseRx, g.y);
  ctx.ellipse(g.x, g.y, baseRx, baseRy, 0, Math.PI, 0, true);
  ctx.lineTo(g.x + baseRx, topY);
  ctx.ellipse(g.x, topY, baseRx, baseRy, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, bodyR * 0.08);
  ctx.strokeStyle = 'rgba(4, 12, 20, 0.55)';
  ctx.stroke();

  // Zip line down the jacket.
  ctx.strokeStyle = 'rgba(180, 200, 220, 0.35)';
  ctx.lineWidth = Math.max(0.8, bodyR * 0.06);
  ctx.beginPath();
  ctx.moveTo(g.x, topY + baseRy);
  ctx.lineTo(g.x, g.y - baseRy * 0.3);
  ctx.stroke();

  // Neck + head.
  const headCy = topY - headR * 0.55;
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(g.x, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, bodyR * 0.06);
  ctx.strokeStyle = SKIN_SHADE;
  ctx.stroke();

  // Big bushy beard: wraps the chin and spills below the jaw.
  const beardGrad = ctx.createLinearGradient(0, headCy, 0, headCy + headR * 1.6);
  beardGrad.addColorStop(0, BEARD_LIGHT);
  beardGrad.addColorStop(1, BEARD);
  ctx.fillStyle = beardGrad;
  ctx.beginPath();
  ctx.moveTo(g.x - headR * 0.95, headCy - headR * 0.05);
  ctx.quadraticCurveTo(g.x - headR * 1.05, headCy + headR * 1.15, g.x, headCy + headR * 1.5);
  ctx.quadraticCurveTo(g.x + headR * 1.05, headCy + headR * 1.15, g.x + headR * 0.95, headCy - headR * 0.05);
  ctx.quadraticCurveTo(g.x, headCy + headR * 0.55, g.x - headR * 0.95, headCy - headR * 0.05);
  ctx.closePath();
  ctx.fill();

  // Moustache hint bridging the beard.
  ctx.beginPath();
  ctx.ellipse(g.x, headCy + headR * 0.2, headR * 0.7, headR * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes above the beard line.
  ctx.fillStyle = '#25190f';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(g.x + sx * headR * 0.34, headCy - headR * 0.12, Math.max(0.8, headR * 0.11), 0, Math.PI * 2);
    ctx.fill();
  }

  // Toque with a folded brim.
  ctx.fillStyle = TOQUE;
  ctx.beginPath();
  ctx.arc(g.x, headCy - headR * 0.15, headR * 1.02, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TOQUE_DARK;
  ctx.fillRect(g.x - headR * 1.02, headCy - headR * 0.28, headR * 2.04, headR * 0.34);
  // Pom-pom.
  ctx.fillStyle = '#f0e6d2';
  ctx.beginPath();
  ctx.arc(g.x, headCy - headR * 1.15, headR * 0.24, 0, Math.PI * 2);
  ctx.fill();

  // Whistle lanyard.
  ctx.strokeStyle = '#0c1119';
  ctx.lineWidth = Math.max(0.8, bodyR * 0.05);
  ctx.beginPath();
  ctx.moveTo(g.x - headR * 0.3, topY + baseRy * 0.2);
  ctx.lineTo(g.x + baseRx * 0.35, topY + bodyR * 0.7);
  ctx.stroke();
  ctx.fillStyle = '#f2c94c';
  ctx.beginPath();
  ctx.arc(g.x + baseRx * 0.35, topY + bodyR * 0.72, Math.max(1, bodyR * 0.12), 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw all coaches as upright tabletop pieces, sorted back-to-front.
 */
export function drawArenaCoaches(
  ctx: CanvasRenderingContext2D,
  view: { camera: Camera; dpr: number },
  coaches: CoachMarker[],
  selectedId: string | null
): void {
  if (!coaches.length) return;
  const { camera, dpr } = view;
  const tilt = camera.tilt ?? 0;
  const z = camera.zoom;
  const k = Math.cos(tilt);
  const s = Math.sin(tilt);
  const m = cameraMatrix(camera);
  const height = PLAYER_RADIUS * z * (1.5 + 1.9 * s);

  const projected = coaches
    .map(coach => ({ coach, g: applyAffine(m, coach.x, coach.y) }))
    .sort((a, b) => a.g.y - b.g.y);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const { coach, g } of projected) {
    drawCoachStanding(ctx, g, z, k, height, coach.id === selectedId);
  }
  ctx.restore();
}
