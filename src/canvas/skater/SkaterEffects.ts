import type { PlaybackPlayerFrame } from '@/core/types';

export function drawSkaterEffects(
  ctx: CanvasRenderingContext2D,
  frame: PlaybackPlayerFrame,
  reducedEffects: boolean
): void {
  if (reducedEffects || frame.action !== 'stop' || frame.speed < 5) return;
  ctx.save();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-16, -8);
  ctx.quadraticCurveTo(-30, -18, -42, -12);
  ctx.quadraticCurveTo(-28, 0, -43, 12);
  ctx.quadraticCurveTo(-26, 16, -16, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
