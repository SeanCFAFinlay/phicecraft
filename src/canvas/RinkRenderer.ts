// ============================================================================
// RINK RENDERER - NHL regulation hockey rink
//
// Every measurement comes from `RINK` / `RINK_MARKS`, which model the sheet at
// true NHL scale (200 x 85 ft). Nothing here should invent its own proportions:
// if a dimension is missing, add it to the spec rather than guessing a fraction
// of the rink size.
// ============================================================================

import { RINK, RINK_MARKS as M, COLORS, FT } from '@/core/constants';

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

/**
 * Draw the complete hockey rink
 */
export function drawRink(ctx: CanvasRenderingContext2D): void {
  const { x: rx, y: ry, width: rw, height: rh, cornerRadius: cr, centerX, centerY } = RINK;

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

  // Goals sit on top of the boards clip so the mesh stays crisp.
  drawGoal(ctx, RINK.goalLineLeftX, 1);
  drawGoal(ctx, RINK.goalLineRightX, -1);
}
