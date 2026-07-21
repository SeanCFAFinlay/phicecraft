import { PLAYER_RADIUS } from '@/core/constants';
import type { PlaybackPlayerFrame, Player, Point } from '@/core/types';
import { drawSkaterEffects } from './SkaterEffects';
import { deriveSkaterPose } from './SkaterPose';
import { getSkaterPalette } from './skaterPalette';
import { getHockeySpriteAtlas, HOCKEY_SPRITES } from '../HockeySpriteAtlas';

interface DetailedSkaterOptions {
  isSelected: boolean;
  isHighlighted: boolean;
  isPuckHolder: boolean;
  isPreparingReceive: boolean;
  reducedEffects: boolean;
  jersey?: string;
}

function localPoint(player: Player, frame: PlaybackPlayerFrame, point: Point): Point {
  const dx = point.x - player.x;
  const dy = point.y - player.y;
  const cos = Math.cos(frame.heading);
  const sin = Math.sin(frame.heading);
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

function mixPoint(from: Point, to: Point, amount: number): Point {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export function drawDetailedSkater(
  ctx: CanvasRenderingContext2D,
  player: Player,
  frame: PlaybackPlayerFrame,
  options: DetailedSkaterOptions
): void {
  const pose = deriveSkaterPose(frame);
  const palette = getSkaterPalette(player.team, options.jersey);
  // The mechanics retain the regulation interaction radius, while the visual
  // model is slightly enlarged so equipment remains readable in full-rink view.
  const r = PLAYER_RADIUS * 1.12;
  const handSign = (player.visual?.handedness ?? (player.team === 'home' ? 'right' : 'left')) === 'right' ? 1 : -1;
  const blade = localPoint(player, frame, frame.bladePosition);
  const shaftStart = { x: -r * 0.38, y: -handSign * r * 0.34 };
  const rearHand = mixPoint(shaftStart, blade, 0.28);
  const leadHand = mixPoint(shaftStart, blade, 0.53);

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(pose.heading);
  drawSkaterEffects(ctx, frame, options.reducedEffects);

  // A long soft shadow grounds the model and makes its direction obvious.
  ctx.save();
  ctx.filter = 'blur(1.5px)';
  ctx.fillStyle = 'rgba(9, 22, 31, 0.28)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.08, r * 0.18, r * 1.28, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The pre-rendered atlas bakes in the classic red/blue jerseys, so a custom
  // jersey colour falls back to the procedural body, which honours the palette.
  const defaultHex = player.team === 'home' ? '#e63946' : '#2f80ed';
  const customJersey = !!options.jersey && options.jersey.toLowerCase() !== defaultHex;
  const atlas = customJersey ? null : getHockeySpriteAtlas();
  if (atlas) {
    const source = player.team === 'home' ? HOCKEY_SPRITES.homeSkater : HOCKEY_SPRITES.awaySkater;
    const drawWidth = 62;
    const drawHeight = drawWidth * source.height / source.width;
    const drawX = -source.anchorX * drawWidth / source.width;
    const drawY = -source.anchorY * drawHeight / source.height;
    ctx.save();
    if (player.team === 'away') ctx.scale(1, -1);
    ctx.drawImage(
      atlas,
      source.x,
      source.y,
      source.width,
      source.height,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );
    ctx.restore();

    // Assignment number stays screen-upright over the jersey.
    ctx.save();
    ctx.rotate(-pose.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, .78)';
    ctx.lineWidth = 2.8;
    ctx.font = '900 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(player.number, -3, -2);
    ctx.fillText(player.number, -3, -2);
    ctx.restore();
    ctx.restore();
  } else {

  // Stick sits underneath the hands but ends at the authoritative puck socket.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#8a5a34';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(shaftStart.x, shaftStart.y);
  ctx.lineTo(blade.x - r * 0.24, blade.y);
  ctx.quadraticCurveTo(
    blade.x - r * 0.08,
    blade.y + handSign * r * 0.16,
    blade.x,
    blade.y
  );
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.32)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(shaftStart.x, shaftStart.y - 0.8);
  ctx.lineTo(blade.x - r * 0.26, blade.y - 0.8);
  ctx.stroke();

  // Legs, socks, boots and steel. The stride offsets oppose one another.
  for (const [side, angle] of [[-1, pose.leftLegAngle], [1, pose.rightLegAngle]] as const) {
    ctx.save();
    ctx.translate(-r * 0.34, side * r * 0.34);
    ctx.rotate(angle);

    ctx.strokeStyle = palette.pants;
    ctx.lineWidth = r * 0.42;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-r * 0.48, side * r * 0.12);
    ctx.stroke();

    ctx.strokeStyle = palette.sock;
    ctx.lineWidth = r * 0.31;
    ctx.beginPath();
    ctx.moveTo(-r * 0.38, side * r * 0.1);
    ctx.lineTo(-r * 0.72, side * r * 0.16);
    ctx.stroke();

    ctx.fillStyle = '#111b26';
    ctx.strokeStyle = '#05090d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-r * 0.94, side * r * 0.05 - r * 0.16, r * 0.5, r * 0.32, r * 0.08);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#d7e3ec';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, side * r * 0.05 + r * 0.18);
    ctx.lineTo(-r * 0.43, side * r * 0.05 + r * 0.18);
    ctx.stroke();
    ctx.restore();
  }

  // Hockey pants and lower-back protection.
  ctx.fillStyle = palette.pants;
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.roundRect(-r * 0.58, -r * 0.58, r * 0.72, r * 1.16, r * 0.23);
  ctx.fill();
  ctx.stroke();

  // Padded jersey body with a directional shoulder silhouette.
  ctx.save();
  ctx.rotate(pose.lean);
  const jersey = ctx.createLinearGradient(-r * 0.7, -r, r * 0.9, r);
  jersey.addColorStop(0, palette.jerseyDark);
  jersey.addColorStop(0.48, palette.jersey);
  jersey.addColorStop(1, palette.jerseyLight);
  ctx.fillStyle = jersey;
  ctx.strokeStyle = options.isHighlighted
    ? '#ffd60a'
    : options.isSelected
      ? '#ffffff'
      : 'rgba(10, 28, 42, .72)';
  ctx.lineWidth = options.isHighlighted ? 2.6 : 1.25;
  ctx.beginPath();
  ctx.moveTo(-r * 0.42, -r * 0.7);
  ctx.quadraticCurveTo(r * 0.1, -r * 0.98, r * 0.58, -r * 0.72);
  ctx.quadraticCurveTo(r * 0.82, -r * 0.42, r * 0.68, 0);
  ctx.quadraticCurveTo(r * 0.82, r * 0.42, r * 0.58, r * 0.72);
  ctx.quadraticCurveTo(r * 0.1, r * 0.98, -r * 0.42, r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shoulder yoke, sleeve stripes and centre jersey stripe.
  ctx.strokeStyle = palette.trim;
  ctx.lineWidth = r * 0.15;
  ctx.beginPath();
  ctx.moveTo(r * 0.25, -r * 0.72);
  ctx.quadraticCurveTo(r * 0.56, 0, r * 0.25, r * 0.72);
  ctx.stroke();
  ctx.lineWidth = r * 0.1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.05, side * r * 0.78);
    ctx.lineTo(r * 0.36, side * r * 0.82);
    ctx.stroke();
  }

  // Sleeves connect the padded shoulders to both hands on the stick.
  ctx.strokeStyle = palette.jerseyDark;
  ctx.lineWidth = r * 0.32;
  ctx.beginPath();
  ctx.moveTo(r * 0.22, handSign * r * 0.76);
  ctx.quadraticCurveTo(r * 0.5, handSign * r * 0.94, leadHand.x, leadHand.y);
  ctx.moveTo(r * 0.12, -handSign * r * 0.72);
  ctx.quadraticCurveTo(r * 0.42, -handSign * r * 0.78, rearHand.x, rearHand.y);
  ctx.stroke();

  ctx.fillStyle = palette.glove;
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.lineWidth = 1;
  for (const hand of [leadHand, rearHand]) {
    ctx.beginPath();
    ctx.roundRect(hand.x - r * 0.14, hand.y - r * 0.12, r * 0.28, r * 0.24, r * 0.08);
    ctx.fill();
    ctx.stroke();
  }

  // Neck, helmet shell, face opening and visor/cage.
  ctx.fillStyle = '#d7a77e';
  ctx.beginPath();
  ctx.ellipse(r * 0.61, 0, r * 0.2, r * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  const helmet = ctx.createRadialGradient(r * 0.77, -r * 0.18, 1, r * 0.84, 0, r * 0.45);
  helmet.addColorStop(0, palette.helmetLight);
  helmet.addColorStop(1, palette.helmet);
  ctx.fillStyle = helmet;
  ctx.strokeStyle = 'rgba(5,16,25,.82)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(r * 0.83, 0, r * 0.43, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(214, 165, 126, .82)';
  ctx.beginPath();
  ctx.ellipse(r * 1.03, 0, r * 0.16, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  if (player.visual?.visor !== false) {
    ctx.strokeStyle = 'rgba(180, 235, 255, .95)';
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.arc(r * 0.97, 0, r * 0.3, -0.85, 0.85);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.48)';
    ctx.beginPath();
    ctx.moveTo(r * 0.91, -r * 0.22);
    ctx.lineTo(r * 1.13, -r * 0.1);
    ctx.stroke();
  }

  // Jersey number remains large enough to identify the drill assignment.
  ctx.save();
  ctx.rotate(-pose.heading - pose.lean);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,.62)';
  ctx.lineWidth = 2.4;
  ctx.font = `900 ${Math.max(12, r * 0.72)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(player.number, 0, 0);
  ctx.fillText(player.number, 0, 0);
  ctx.restore();
  ctx.restore();
  ctx.restore();
  }

  if (options.isPreparingReceive) {
    ctx.save();
    ctx.strokeStyle = '#00e676';
    ctx.fillStyle = 'rgba(0, 230, 118, .08)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, r + 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (options.isPuckHolder) {
    ctx.save();
    ctx.shadowColor = 'rgba(255, 214, 10, .85)';
    ctx.shadowBlur = 7;
    ctx.fillStyle = '#0b1117';
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.ellipse(frame.bladePosition.x, frame.bladePosition.y, 5.5, 3.7, frame.heading, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
