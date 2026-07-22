// ============================================================================
// RINK RENDERER - NHL regulation hockey rink
//
// Every measurement comes from `RINK` / `RINK_MARKS`, which model the sheet at
// true NHL scale (200 x 85 ft). Nothing here should invent its own proportions:
// if a dimension is missing, add it to the spec rather than guessing a fraction
// of the rink size.
// ============================================================================

import { RINK, RINK_MARKS as M, COLORS, FT, ARENA, ARENA_ADS } from '@/core/constants';
import type { Camera, Point } from '@/core/types';
import { cameraMatrix, applyAffine } from '@/utils/geometry';

/**
 * Draw a rounded rectangle path
 */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * A faceoff spot (the solid dot at the centre of a circle)
 */
function drawFaceoffSpot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The four L-shaped alignment marks inside an end zone faceoff circle. Each is
 * a long arm parallel to the side boards with a short arm turning outward.
 */
function drawFaceoffMarks(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = M.lineWidthMinor * 1.5;

  const halfGapY = M.hashSeparation / 2;

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const y = cy + sy * halfGapY;
      const innerX = cx + sx * M.markGapX;
      const outerX = innerX + sx * M.markLongArm;

      ctx.beginPath();
      // Long arm, running along the length of the rink
      ctx.moveTo(innerX, y);
      ctx.lineTo(outerX, y);
      // Short arm, turning away from the spot
      ctx.lineTo(outerX, y + sy * M.markShortArm);
      ctx.stroke();
    }
  }
}

/**
 * Hash marks: two short ticks off the top of the circle and two off the bottom.
 */
function drawFaceoffHashMarks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number
): void {
  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = M.lineWidthMinor * 1.5;

  const halfSep = M.hashSeparation / 2;

  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const x = cx + sx * halfSep;
      const yStart = cy + sy * radius;

      ctx.beginPath();
      ctx.moveTo(x, yStart);
      ctx.lineTo(x, yStart + sy * M.hashLength);
      ctx.stroke();
    }
  }
}

/**
 * An end zone faceoff circle, with its spot, alignment marks and hash marks.
 */
function drawEndZoneCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const radius = M.faceoffCircleRadius;

  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = M.lineWidthMinor * 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  drawFaceoffMarks(ctx, cx, cy);
  drawFaceoffHashMarks(ctx, cx, cy, radius);
  drawFaceoffSpot(ctx, cx, cy, M.faceoffSpotRadius, COLORS.redLine);
}

/**
 * Centre ice: the circle and spot here are blue, unlike the red end zone ones.
 */
function drawCenterCircle(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = COLORS.blueLine;
  ctx.lineWidth = M.lineWidthMinor * 1.5;
  ctx.beginPath();
  ctx.arc(RINK.centerX, RINK.centerY, M.faceoffCircleRadius, 0, Math.PI * 2);
  ctx.stroke();

  drawFaceoffSpot(ctx, RINK.centerX, RINK.centerY, M.centerSpotRadius, COLORS.blueLine);
}

/**
 * Goal crease: a 6 ft arc off the goal line, 8 ft wide where it meets it.
 * `direction` is +1 for the left goal (opening toward centre ice) and -1 for the right.
 */
function drawCrease(ctx: CanvasRenderingContext2D, goalLineX: number, direction: 1 | -1): void {
  const cy = RINK.centerY;
  const { creaseRadius: r, creaseHalfWidth: hw } = M;

  // Angle at which the arc crosses the crease's flat edge.
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

  ctx.fillStyle = COLORS.crease.fill;
  ctx.fill();
  ctx.strokeStyle = COLORS.crease.stroke;
  ctx.lineWidth = M.lineWidthMinor * 1.5;
  ctx.stroke();
}

/**
 * The restricted area behind the net. Widens from 22 ft at the goal line to
 * 28 ft where it meets the end boards.
 */
function drawTrapezoid(
  ctx: CanvasRenderingContext2D,
  goalLineX: number,
  boardsX: number,
  direction: 1 | -1
): void {
  const cy = RINK.centerY;

  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = M.lineWidthMinor * 1.5;

  for (const sy of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(goalLineX, cy + sy * M.trapezoidGoalLineHalfWidth);
    ctx.lineTo(boardsX, cy + sy * M.trapezoidBoardsHalfWidth);
    ctx.stroke();
  }

  // Keep the trapezoid from visually floating off the boards on the curve.
  void direction;
}

/**
 * The goal: 6 ft wide, 4 ft deep, sitting behind the goal line.
 */
function drawGoal(ctx: CanvasRenderingContext2D, goalLineX: number, direction: 1 | -1): void {
  const cy = RINK.centerY;
  const { goalHalfWidth: hw, goalDepth: depth } = M;

  // The net extends away from centre ice, behind the goal line.
  const backX = goalLineX - direction * depth;
  const mouthX = goalLineX;
  const backTopY = cy - hw * 0.72;
  const backBottomY = cy + hw * 0.72;

  // Net bag. A translucent white bed and shaped clip make it read as a real
  // goal from above instead of a rectangular diagram symbol.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(mouthX, cy - hw);
  ctx.lineTo(backX, backTopY);
  ctx.quadraticCurveTo(backX - direction * FT * 0.45, cy, backX, backBottomY);
  ctx.lineTo(mouthX, cy + hw);
  ctx.closePath();
  ctx.fillStyle = 'rgba(245, 250, 253, .72)';
  ctx.fill();
  ctx.clip();

  ctx.strokeStyle = 'rgba(102, 126, 142, .5)';
  ctx.lineWidth = 0.46;
  const minX = Math.min(goalLineX, backX) - FT;
  const maxX = Math.max(goalLineX, backX) + FT;
  const step = 0.55 * FT;
  for (let x = minX; x <= maxX; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, cy - hw);
    ctx.lineTo(x + direction * FT * 1.2, cy + hw);
    ctx.stroke();
  }
  for (let y = cy - hw; y <= cy + hw; y += step) {
    ctx.beginPath();
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
    ctx.stroke();
  }
  ctx.restore();

  // Red frame: crossbar, side rails and rounded rear rail.
  ctx.strokeStyle = COLORS.goalPost;
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(mouthX, cy - hw);
  ctx.lineTo(backX, backTopY);
  ctx.quadraticCurveTo(backX - direction * FT * 0.45, cy, backX, backBottomY);
  ctx.lineTo(mouthX, cy + hw);
  ctx.stroke();

  // Crossbar and two post caps.
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(mouthX, cy - hw);
  ctx.lineTo(mouthX, cy + hw);
  ctx.stroke();
  ctx.fillStyle = COLORS.goalPost;
  for (const y of [cy - hw, cy + hw]) {
    ctx.beginPath();
    ctx.arc(mouthX, y, 1.65, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBoardFixtures(ctx: CanvasRenderingContext2D): void {
  const { x, y, width, height, centerX } = RINK;
  const benchWidth = 32 * FT;
  const boxDepth = 5 * FT;

  ctx.save();
  ctx.fillStyle = 'rgba(214, 226, 234, 0.2)';
  ctx.strokeStyle = 'rgba(117, 213, 245, 0.72)';
  ctx.lineWidth = 1.4;

  // Team benches on the upper side, separated at centre ice.
  const benchCenters = [centerX - benchWidth * 0.58, centerX + benchWidth * 0.58];
  for (const [index, cx] of benchCenters.entries()) {
    ctx.beginPath();
    ctx.rect(cx - benchWidth / 2, y - boxDepth, benchWidth, boxDepth);
    ctx.fill();
    ctx.stroke();
    for (let sx = cx - benchWidth / 2 + 12; sx < cx + benchWidth / 2; sx += 24) {
      ctx.beginPath();
      ctx.moveTo(sx, y - boxDepth);
      ctx.lineTo(sx, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(215, 238, 247, .72)';
    ctx.font = '700 5.5px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(index === 0 ? 'HOME BENCH' : 'AWAY BENCH', cx, y - boxDepth * 0.52);
    ctx.fillStyle = 'rgba(214, 226, 234, 0.2)';
  }

  // Penalty boxes and scorer's table opposite the benches.
  const penaltyWidth = 18 * FT;
  for (const cx of [centerX - penaltyWidth * 0.68, centerX + penaltyWidth * 0.68]) {
    ctx.beginPath();
    ctx.rect(cx - penaltyWidth / 2, y + height, penaltyWidth, boxDepth);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(6, 20, 31, 0.78)';
  ctx.fillRect(centerX - 10 * FT, y + height, 20 * FT, boxDepth);
  ctx.strokeRect(centerX - 10 * FT, y + height, 20 * FT, boxDepth);

  ctx.fillStyle = 'rgba(215, 238, 247, .72)';
  ctx.font = '700 5.5px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PENALTY', centerX - penaltyWidth * 0.68, y + height + boxDepth * 0.52);
  ctx.fillText('SCORER', centerX, y + height + boxDepth * 0.52);
  ctx.fillText('PENALTY', centerX + penaltyWidth * 0.68, y + height + boxDepth * 0.52);

  // Glass stanchions at regulation-looking intervals around the straight runs.
  ctx.strokeStyle = 'rgba(174, 229, 248, 0.42)';
  ctx.lineWidth = 0.9;
  for (let sx = x + 30 * FT; sx < x + width - 30 * FT; sx += 10 * FT) {
    ctx.beginPath();
    ctx.moveTo(sx, y - 5);
    ctx.lineTo(sx, y + 5);
    ctx.moveTo(sx, y + height - 5);
    ctx.lineTo(sx, y + height + 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIceSurfaceDetail(ctx: CanvasRenderingContext2D): void {
  const { x, y, width, height, centerX, centerY } = RINK;

  // Six resurfacing lanes create the broad sheen seen on freshly flooded ice.
  ctx.save();
  for (let lane = 0; lane < 6; lane++) {
    const laneY = y + (lane * height) / 6;
    const laneGradient = ctx.createLinearGradient(x, laneY, x + width, laneY + height / 6);
    laneGradient.addColorStop(0, 'rgba(120, 185, 213, .015)');
    laneGradient.addColorStop(0.5, lane % 2 === 0 ? 'rgba(90, 160, 195, .09)' : 'rgba(255,255,255,.08)');
    laneGradient.addColorStop(1, 'rgba(120, 185, 213, .015)');
    ctx.fillStyle = laneGradient;
    ctx.fillRect(x, laneY, width, height / 6);
  }

  // Deterministic skate scratches: never random, so the canvas does not flicker.
  ctx.strokeStyle = 'rgba(87, 139, 166, .075)';
  ctx.lineWidth = 0.55;
  for (let i = 0; i < 46; i++) {
    const px = x + FT * 8 + ((i * 83) % (width - FT * 16));
    const py = y + FT * 5 + ((i * 47) % (height - FT * 10));
    const length = FT * (2.2 + (i % 5) * 0.55);
    const tilt = Math.sin(i * 1.87) * 0.42;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + length * 0.5, py + tilt * FT, px + length, py + tilt * FT * 1.4);
    ctx.stroke();
  }

  const light = ctx.createRadialGradient(centerX, centerY, FT * 5, centerX, centerY, width * 0.53);
  light.addColorStop(0, 'rgba(255,255,255,.28)');
  light.addColorStop(0.62, 'rgba(219,239,248,.055)');
  light.addColorStop(1, 'rgba(76,140,172,.04)');
  ctx.fillStyle = light;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

/**
 * Very faint end-zone tints (home red, away blue) that add depth without
 * fighting the diagram's markings.
 */
function drawZoneTints(ctx: CanvasRenderingContext2D): void {
  const { x, y, width, height, blueLineLeftX, blueLineRightX } = RINK;
  ctx.save();
  const leftEnd = ctx.createLinearGradient(x, 0, blueLineLeftX, 0);
  leftEnd.addColorStop(0, 'rgba(200, 40, 55, 0.05)');
  leftEnd.addColorStop(1, 'rgba(200, 40, 55, 0)');
  ctx.fillStyle = leftEnd;
  ctx.fillRect(x, y, blueLineLeftX - x, height);

  const rightEnd = ctx.createLinearGradient(x + width, 0, blueLineRightX, 0);
  rightEnd.addColorStop(0, 'rgba(48, 128, 237, 0.05)');
  rightEnd.addColorStop(1, 'rgba(48, 128, 237, 0)');
  ctx.fillStyle = rightEnd;
  ctx.fillRect(blueLineRightX, y, x + width - blueLineRightX, height);
  ctx.restore();
}

/** Draw a string of characters spread along the top arc of a circle. */
function drawArcTextTop(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  anglePer: number
): void {
  const start = -Math.PI / 2 - ((text.length - 1) * anglePer) / 2;
  for (let i = 0; i < text.length; i++) {
    const a = start + i * anglePer;
    ctx.save();
    ctx.translate(radius * Math.cos(a), radius * Math.sin(a));
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
}

/**
 * The PH Hockey Practice centre-ice crest: a brand-coloured monogram painted on
 * the sheet, kept translucent so the lines and circle stay legible over it.
 */
function drawCenterIceLogo(ctx: CanvasRenderingContext2D): void {
  const { centerX: cx, centerY: cy } = RINK;
  const R = 19 * FT;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.62;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Concentric brand rings.
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(47, 128, 237, 0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(22, 163, 74, 0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2);
  ctx.stroke();

  // Curved tagline around the top.
  ctx.fillStyle = 'rgba(22, 163, 74, 0.8)';
  ctx.font = `800 ${R * 0.14}px Arial, sans-serif`;
  drawArcTextTop(ctx, 'TRAIN · PLAY · IMPROVE', R * 0.72, 0.115);

  // PH monogram with a green-to-blue gradient.
  const grad = ctx.createLinearGradient(-R * 0.55, 0, R * 0.55, 0);
  grad.addColorStop(0, '#16a34a');
  grad.addColorStop(1, '#2f80ed');
  ctx.font = `900 ${R * 0.9}px "Arial Black", Arial, sans-serif`;
  ctx.lineWidth = R * 0.035;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.strokeText('PH', 0, -R * 0.04);
  ctx.fillStyle = grad;
  ctx.fillText('PH', 0, -R * 0.04);

  // Wordmark beneath.
  ctx.fillStyle = 'rgba(30, 41, 59, 0.82)';
  ctx.font = `800 ${R * 0.15}px Arial, sans-serif`;
  ctx.fillText('HOCKEY PRACTICE', 0, R * 0.52);

  ctx.restore();
}

function drawCenterLine(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = M.lineWidthMajor;
  ctx.setLineDash([2 * FT, 1.15 * FT]);
  ctx.lineDashOffset = 0.4 * FT;
  ctx.beginPath();
  ctx.moveTo(RINK.centerX, RINK.y);
  ctx.lineTo(RINK.centerX, RINK.y + RINK.height);
  ctx.stroke();
  ctx.restore();
}

export interface DrawRinkOptions {
  /**
   * When the tabletop arena is being rendered, the raised boards and floor slab
   * are drawn separately in screen space, so the flat drop-shadow and flat
   * board stack are suppressed to avoid doubling up on the ice edge.
   */
  elevated?: boolean;
}

/**
 * Draw the complete hockey rink
 */
export function drawRink(ctx: CanvasRenderingContext2D, opts: DrawRinkOptions = {}): void {
  const { x: rx, y: ry, width: rw, height: rh, cornerRadius: cr, centerX, centerY } = RINK;
  const elevated = opts.elevated ?? false;

  if (!elevated) {
    // Arena-floor depth beneath the boards. These broad silhouettes remain
    // readable at every zoom level and make the ice feel physically seated in
    // the building rather than pasted onto a flat canvas.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 18;
    roundedRectPath(ctx, rx - 10, ry - 10, rw + 20, rh + 20, cr + 10);
    ctx.fillStyle = '#07121c';
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(19, 210, 255, 0.18)';
    ctx.lineWidth = 12;
    roundedRectPath(ctx, rx - 7, ry - 7, rw + 14, rh + 14, cr + 7);
    ctx.stroke();
  }

  roundedRectPath(ctx, rx, ry, rw, rh, cr);
  ctx.save();
  ctx.clip();

  // Ice surface. Deliberately flat and near-white: a drill diagram wants
  // contrast for the markings, not scenery.
  const ice = ctx.createLinearGradient(rx, ry, rx, ry + rh);
  ice.addColorStop(0, COLORS.ice.light);
  ice.addColorStop(0.5, COLORS.ice.mid);
  ice.addColorStop(1, COLORS.ice.dark);
  ctx.fillStyle = ice;
  ctx.fillRect(rx, ry, rw, rh);

  drawZoneTints(ctx);
  drawIceSurfaceDetail(ctx);

  // Layered frozen-water texture: subtle resurfacing lanes, skate haze and
  // overhead light bloom. It stays faint to preserve diagram legibility.
  ctx.save();
  ctx.globalAlpha = 0.15;
  for (let y = ry + 10; y < ry + rh; y += 18) {
    const lane = ctx.createLinearGradient(rx, y, rx + rw, y + 3);
    lane.addColorStop(0, 'rgba(120, 190, 220, 0)');
    lane.addColorStop(0.5, 'rgba(110, 180, 215, 0.28)');
    lane.addColorStop(1, 'rgba(120, 190, 220, 0)');
    ctx.fillStyle = lane;
    ctx.fillRect(rx, y, rw, 1.2);
  }
  const bloom = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, rw * 0.48);
  bloom.addColorStop(0, 'rgba(255,255,255,0.62)');
  bloom.addColorStop(0.45, 'rgba(219,242,255,0.16)');
  bloom.addColorStop(1, 'rgba(95,160,200,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(rx, ry, rw, rh);
  ctx.restore();

  // Centre-ice crest, painted on the ice beneath the markings.
  drawCenterIceLogo(ctx);

  ctx.lineCap = 'butt';

  // --- Goal lines (2 in, red) -------------------------------------------
  // These run the full width; the clip trims them to the boards at the corners.
  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = M.lineWidthMinor;
  for (const gx of [RINK.goalLineLeftX, RINK.goalLineRightX]) {
    ctx.beginPath();
    ctx.moveTo(gx, ry);
    ctx.lineTo(gx, ry + rh);
    ctx.stroke();
  }

  // --- Blue lines (12 in) -----------------------------------------------
  ctx.strokeStyle = COLORS.blueLine;
  ctx.lineWidth = M.lineWidthMajor;
  for (const bx of [RINK.blueLineLeftX, RINK.blueLineRightX]) {
    ctx.beginPath();
    ctx.moveTo(bx, ry);
    ctx.lineTo(bx, ry + rh);
    ctx.stroke();
  }

  // --- Centre line (12 in, alternating red/ice blocks) ------------------
  drawCenterLine(ctx);

  // --- Creases and goals -------------------------------------------------
  drawCrease(ctx, RINK.goalLineLeftX, 1);
  drawCrease(ctx, RINK.goalLineRightX, -1);

  drawTrapezoid(ctx, RINK.goalLineLeftX, rx, 1);
  drawTrapezoid(ctx, RINK.goalLineRightX, rx + rw, -1);

  // --- Faceoff circles ---------------------------------------------------
  const spotY = [centerY - M.spotOffsetFromCenterY, centerY + M.spotOffsetFromCenterY];
  const endZoneX = [
    RINK.goalLineLeftX + M.endZoneSpotFromGoalLine,
    RINK.goalLineRightX - M.endZoneSpotFromGoalLine,
  ];

  for (const cx of endZoneX) {
    for (const cy of spotY) {
      drawEndZoneCircle(ctx, cx, cy);
    }
  }

  drawCenterCircle(ctx);

  // --- Neutral zone spots (no circles) -----------------------------------
  const neutralX = [
    RINK.blueLineLeftX + M.neutralSpotFromBlueLine,
    RINK.blueLineRightX - M.neutralSpotFromBlueLine,
  ];
  for (const cx of neutralX) {
    for (const cy of spotY) {
      drawFaceoffSpot(ctx, cx, cy, M.faceoffSpotRadius, COLORS.redLine);
    }
  }

  // --- Referee's crease --------------------------------------------------
  // A 10 ft semicircle at centre ice, bulging into the ice off the boards.
  ctx.strokeStyle = COLORS.redLine;
  ctx.lineWidth = M.lineWidthMinor * 1.5;
  ctx.beginPath();
  ctx.arc(centerX, ry + rh, M.refereeCreaseRadius, Math.PI, 0, false);
  ctx.stroke();

  ctx.restore();

  // --- Boards ------------------------------------------------------------
  if (elevated) {
    // The raised boards are drawn separately in screen space; on the ground
    // plane we only need a crisp inner rim so the ice edge stays defined.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 3;
    roundedRectPath(ctx, rx + 1, ry + 1, rw - 2, rh - 2, Math.max(0, cr - 1));
    ctx.stroke();
  } else {
    // Boards, kick plate, cap rail and glass are separated into material layers.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 13;
    roundedRectPath(ctx, rx, ry, rw, rh, cr);
    ctx.stroke();
    ctx.strokeStyle = '#f5f8fb';
    ctx.lineWidth = 8;
    roundedRectPath(ctx, rx, ry, rw, rh, cr);
    ctx.stroke();
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 2.2;
    roundedRectPath(ctx, rx + 2, ry + 2, rw - 4, rh - 4, Math.max(0, cr - 2));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(94, 211, 255, 0.72)';
    ctx.lineWidth = 2;
    roundedRectPath(ctx, rx, ry, rw, rh, cr);
    ctx.stroke();

    // Glass edge and steel stanchion rail outside the boards.
    ctx.strokeStyle = 'rgba(157, 224, 247, .42)';
    ctx.lineWidth = 3.2;
    roundedRectPath(ctx, rx - 5, ry - 5, rw + 10, rh + 10, cr + 5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(235, 250, 255, .72)';
    ctx.lineWidth = 0.9;
    roundedRectPath(ctx, rx - 6.5, ry - 6.5, rw + 13, rh + 13, cr + 6.5);
    ctx.stroke();

    drawBoardFixtures(ctx);
  }

  // Goals sit on top of the boards clip so the mesh stays crisp.
  drawGoal(ctx, RINK.goalLineLeftX, 1);
  drawGoal(ctx, RINK.goalLineRightX, -1);
}

// ============================================================================
// TABLETOP ARENA (raised boards, glass and floor slab)
//
// Everything below draws in *screen space* (the caller leaves the canvas in the
// device-pixel transform). Ground points are projected through the camera
// matrix and raised by a screen-space height, giving the extruded, spin-around
// "table hockey" look without leaving the 2D canvas.
// ============================================================================

/** Sample a rounded-rectangle outline into a closed world-space polyline. */
function roundedRectOutline(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  cornerSteps = 9
): Point[] {
  const pts: Point[] = [];
  const rr = Math.min(r, w / 2, h / 2);
  // Corner centres, walked clockwise from the top-left.
  const corners: { cx: number; cy: number; start: number }[] = [
    { cx: x + rr, cy: y + rr, start: Math.PI }, // top-left
    { cx: x + w - rr, cy: y + rr, start: -Math.PI / 2 }, // top-right
    { cx: x + w - rr, cy: y + h - rr, start: 0 }, // bottom-right
    { cx: x + rr, cy: y + h - rr, start: Math.PI / 2 }, // bottom-left
  ];
  for (const { cx, cy, start } of corners) {
    for (let i = 0; i <= cornerSteps; i++) {
      const a = start + (Math.PI / 2) * (i / cornerSteps);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
  }
  return pts;
}

interface ArenaView {
  camera: Camera;
  dpr: number;
}

function tabletopLift(camera: Camera): number {
  return Math.sin(camera.tilt ?? 0);
}

function polygonPath(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/**
 * The dark floor slab the whole sheet sits on, plus its soft contact shadow -
 * the "model on a white desk" base from the reference render.
 */
export function drawArenaBase(ctx: CanvasRenderingContext2D, view: ArenaView): void {
  const { camera, dpr } = view;
  const lift = tabletopLift(camera);
  if (lift <= 0) return;

  const m = cameraMatrix(camera);
  const marginFt = 9 * FT;
  const baseH = ARENA.baseThicknessFt * FT * camera.zoom * lift;

  const outline = roundedRectOutline(
    RINK.x - marginFt,
    RINK.y - marginFt,
    RINK.width + marginFt * 2,
    RINK.height + marginFt * 2,
    RINK.cornerRadius + marginFt
  );
  const top = outline.map(p => applyAffine(m, p.x, p.y));
  const bottom = top.map(p => ({ x: p.x, y: p.y + baseH }));

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Soft contact shadow on the "desk".
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 40 * Math.min(camera.zoom, 1.4);
  ctx.shadowOffsetY = 26 * lift;
  polygonPath(ctx, bottom);
  ctx.fillStyle = '#0b1016';
  ctx.fill();
  ctx.restore();

  // Slab thickness (the visible side of the base).
  polygonPath(ctx, bottom);
  ctx.fillStyle = '#05080c';
  ctx.fill();

  // Slab top surface.
  const g = ctx.createLinearGradient(0, top[0].y - baseH, 0, bottom[0].y + baseH);
  g.addColorStop(0, '#12202e');
  g.addColorStop(1, '#0a121b');
  polygonPath(ctx, top);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.restore();
}

/**
 * The raised boards, wrap-around advertising and glass. Drawn in two passes:
 * `far` (behind the play) before the skaters, `near` (in front) after them, so
 * depth reads correctly as the rink is spun.
 */
export function drawArenaWalls(
  ctx: CanvasRenderingContext2D,
  view: ArenaView,
  pass: 'far' | 'near'
): void {
  const { camera, dpr } = view;
  const lift = tabletopLift(camera);
  if (lift <= 0) return;

  const m = cameraMatrix(camera);
  const zoom = camera.zoom;
  const boardH = ARENA.boardHeightFt * FT * zoom * lift;
  const glassH = ARENA.glassHeightFt * FT * zoom * lift;

  const outline = roundedRectOutline(RINK.x, RINK.y, RINK.width, RINK.height, RINK.cornerRadius, 11);
  const ground = outline.map(p => applyAffine(m, p.x, p.y));
  const center = applyAffine(m, RINK.centerX, RINK.centerY);
  const N = ground.length;

  // Assign each vertex to an advertising panel by walking the perimeter, so a
  // brand spans several segments instead of flickering per edge.
  const panelWorldLen = 26 * FT;
  const panelOf: number[] = [];
  {
    let acc = 0;
    for (let i = 0; i < N; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % N];
      panelOf[i] = Math.floor(acc / panelWorldLen);
      acc += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = 'round';

  let lastLabelPanel = -1;

  for (let i = 0; i < N; i++) {
    const a = ground[i];
    const b = ground[(i + 1) % N];
    const midY = (a.y + b.y) / 2;
    const isNear = midY >= center.y;
    if (pass === 'far' && isNear) continue;
    if (pass === 'near' && !isNear) continue;

    const aBoard = { x: a.x, y: a.y - boardH };
    const bBoard = { x: b.x, y: b.y - boardH };
    const aGlass = { x: a.x, y: a.y - boardH - glassH };
    const bGlass = { x: b.x, y: b.y - boardH - glassH };

    const ad = ARENA_ADS[panelOf[i] % ARENA_ADS.length];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);

    // Glass panel: faint, cool, translucent - just enough to read as plexi.
    polygonPath(ctx, [aBoard, bBoard, bGlass, aGlass]);
    ctx.fillStyle = isNear ? 'rgba(150, 205, 230, 0.14)' : 'rgba(150, 205, 230, 0.22)';
    ctx.fill();

    // Board face carrying the advertising band.
    polygonPath(ctx, [a, b, bBoard, aBoard]);
    ctx.fillStyle = ad.bg;
    ctx.fill();
    // Vertical shading so the boards feel cylindrical around the corners.
    const shade = ctx.createLinearGradient(0, a.y, 0, aBoard.y);
    shade.addColorStop(0, 'rgba(0,0,0,0.28)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    shade.addColorStop(1, 'rgba(0,0,0,0.14)');
    polygonPath(ctx, [a, b, bBoard, aBoard]);
    ctx.fillStyle = shade;
    ctx.fill();

    // Blue cap rail sitting on top of the boards.
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = Math.max(1.6, 2.4 * zoom * (0.6 + 0.4 * lift));
    ctx.beginPath();
    ctx.moveTo(aBoard.x, aBoard.y);
    ctx.lineTo(bBoard.x, bBoard.y);
    ctx.stroke();

    // Glass top edge highlight.
    ctx.strokeStyle = 'rgba(226, 245, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(aGlass.x, aGlass.y);
    ctx.lineTo(bGlass.x, bGlass.y);
    ctx.stroke();

    // Brand text, once per panel, only where the board faces us enough to read.
    if (panelOf[i] !== lastLabelPanel && segLen > 14) {
      lastLabelPanel = panelOf[i];
      const cxp = (a.x + b.x) / 2;
      const cyp = (a.y + b.y) / 2 - boardH * 0.5;
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save();
      ctx.translate(cxp, cyp);
      ctx.rotate(ang);
      ctx.fillStyle = ad.fg;
      const fs = Math.max(6, boardH * 0.5);
      ctx.font = `700 ${fs}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ad.label, 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();
}
