import { SIMULATION } from '@/core/constants';
import type { AnimatedPuck, ID, PlaybackPlayerFrame, Player } from '@/core/types';

export function drawMechanicsDiagnostics(
  ctx: CanvasRenderingContext2D,
  players: Player[],
  frames: Record<ID, PlaybackPlayerFrame>,
  puck: AnimatedPuck | null
): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (const player of players) {
    const frame = frames[player.id];
    if (!frame) continue;
    const { position, velocity, bladePosition, heading } = frame;

    ctx.strokeStyle = 'rgba(0,210,255,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(position.x, position.y);
    ctx.lineTo(position.x + Math.cos(heading) * 34, position.y + Math.sin(heading) * 34);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,230,118,.75)';
    ctx.beginPath();
    ctx.moveTo(position.x, position.y);
    ctx.lineTo(position.x + velocity.x * 0.22, position.y + velocity.y * 0.22);
    ctx.stroke();

    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(bladePosition.x, bladePosition.y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (puck?.state === 'in_flight' && puck.intendedReceiverId) {
    const receiver = frames[puck.intendedReceiverId];
    if (receiver) {
      ctx.strokeStyle = 'rgba(255,214,10,.55)';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(receiver.bladePosition.x, receiver.bladePosition.y, SIMULATION.catchRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}
