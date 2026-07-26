import type { AnimatedPuck, PlaybackPlayerFrame, Player } from '@/core/types';
import { getSkaterPalette } from './skaterPalette';
import { getHockeySpriteAtlas, HOCKEY_SPRITES } from '../HockeySpriteAtlas';
import { drawCarrierRing, drawPuckMarker } from '../puckMarker';
import { PLAYER_RADIUS } from '@/core/constants';

export function drawDetailedGoalie(
  ctx: CanvasRenderingContext2D,
  player: Player,
  frame: PlaybackPlayerFrame,
  isPuckHolder: boolean,
  puck?: AnimatedPuck | null,
  jersey?: string
): void {
  const palette = getSkaterPalette(player.team, jersey);
  const trackedHeading = puck?.visible
    ? Math.atan2(puck.y - player.y, puck.x - player.x)
    : frame.heading;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(trackedHeading);

  ctx.save();
  ctx.filter = 'blur(1.6px)';
  ctx.fillStyle = 'rgba(7, 18, 27, .3)';
  ctx.beginPath();
  ctx.ellipse(-2, 4, 28, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const defaultHex = player.team === 'home' ? '#e63946' : '#2f80ed';
  const customJersey = !!jersey && jersey.toLowerCase() !== defaultHex;
  const atlas = customJersey ? null : getHockeySpriteAtlas();
  if (atlas) {
    const source = player.team === 'home' ? HOCKEY_SPRITES.homeGoalie : HOCKEY_SPRITES.awayGoalie;
    const drawWidth = 66;
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

    ctx.save();
    ctx.rotate(-trackedHeading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, .8)';
    ctx.lineWidth = 2.8;
    ctx.font = '900 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(player.number, -1, -2);
    ctx.fillText(player.number, -1, -2);
    ctx.restore();
    ctx.restore();
  } else {

  // Goalie skates remain visible beneath the pads.
  ctx.fillStyle = '#111b24';
  ctx.strokeStyle = '#d8e4eb';
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(-16, side * 12 - 4, 22, 8, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-15, side * 12 + 5);
    ctx.lineTo(6, side * 12 + 5);
    ctx.stroke();
  }

  // Regulation-style wide leg pads with knee rolls and vertical channels.
  for (const side of [-1, 1]) {
    const pad = ctx.createLinearGradient(-18, side * 17, 12, side * 8);
    pad.addColorStop(0, '#dbe6ed');
    pad.addColorStop(0.45, '#ffffff');
    pad.addColorStop(1, '#c3d0d9');
    ctx.fillStyle = pad;
    ctx.strokeStyle = palette.jerseyDark;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-15, side * 14 - 6.5, 30, 13, 4.5);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(74, 96, 112, .48)';
    ctx.lineWidth = 1;
    for (let x = -8; x <= 7; x += 7.5) {
      ctx.beginPath();
      ctx.moveTo(x, side * 14 - 5.5);
      ctx.lineTo(x, side * 14 + 5.5);
      ctx.stroke();
    }
    ctx.fillStyle = palette.jersey;
    ctx.beginPath();
    ctx.roundRect(-3, side * 14 - 5.5, 7, 11, 2.5);
    ctx.fill();
  }

  // Pants and oversized chest/arm protector.
  ctx.fillStyle = palette.pants;
  ctx.beginPath();
  ctx.roundRect(-11, -15, 17, 30, 6);
  ctx.fill();

  const chest = ctx.createLinearGradient(-10, -16, 16, 16);
  chest.addColorStop(0, palette.jerseyDark);
  chest.addColorStop(0.5, palette.jersey);
  chest.addColorStop(1, palette.jerseyLight);
  ctx.fillStyle = chest;
  ctx.strokeStyle = 'rgba(7, 20, 31, .72)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-7, -17);
  ctx.quadraticCurveTo(8, -22, 16, -13);
  ctx.lineTo(16, 13);
  ctx.quadraticCurveTo(8, 22, -7, 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = palette.trim;
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(6, -18);
  ctx.lineTo(6, 18);
  ctx.stroke();

  // Catching glove and blocker are deliberately asymmetric.
  ctx.fillStyle = '#f8fbfd';
  ctx.strokeStyle = palette.jerseyDark;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(8, -24, 8.5, 6.5, -0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60, 80, 95, .62)';
  ctx.beginPath();
  ctx.arc(8, -24, 4, -1.2, 1.2);
  ctx.stroke();

  ctx.fillStyle = '#f8fbfd';
  ctx.strokeStyle = palette.jerseyDark;
  ctx.beginPath();
  ctx.roundRect(5, 19, 13, 10, 2.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.jersey;
  ctx.fillRect(8, 21, 7, 6);

  // Goalie stick, paddle and blade.
  ctx.strokeStyle = '#885c36';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(10, 24);
  ctx.lineTo(31, 28);
  ctx.stroke();
  ctx.fillStyle = '#f4f7f9';
  ctx.strokeStyle = '#8a5a34';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(21, 25.8);
  ctx.lineTo(34, 28.6);
  ctx.lineTo(38, 25.5);
  ctx.lineTo(27, 23.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Mask with shell graphics and a full cage.
  const mask = ctx.createRadialGradient(15, -2, 1, 18, 0, 9);
  mask.addColorStop(0, palette.helmetLight);
  mask.addColorStop(1, palette.helmet);
  ctx.fillStyle = mask;
  ctx.strokeStyle = '#101b24';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(18, 0, 8.5, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#d3dde4';
  ctx.lineWidth = 1;
  for (const offset of [-4, 0, 4]) {
    ctx.beginPath();
    ctx.moveTo(13, offset);
    ctx.lineTo(25, offset * 0.68);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(15, -7);
  ctx.lineTo(23, 7);
  ctx.moveTo(15, 7);
  ctx.lineTo(23, -7);
  ctx.stroke();

  // Large readable jersey number on the chest protector.
  ctx.save();
  ctx.rotate(-trackedHeading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,.62)';
  ctx.lineWidth = 2.2;
  ctx.font = '900 13px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(player.number, 0, 0);
  ctx.fillText(player.number, 0, 0);
  ctx.restore();
  ctx.restore();
  }

  if (isPuckHolder) {
    drawCarrierRing(ctx, player.x, player.y, PLAYER_RADIUS + 5);
    drawPuckMarker(ctx, frame.bladePosition.x, frame.bladePosition.y, trackedHeading);
  }
}
