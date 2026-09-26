import { describe, it, expect, vi } from 'vitest';
import { drawEquipment, drawCone, drawTire, drawMiniNet, drawBarrier, drawPuckPile } from './EquipmentRenderer';
import type { EquipmentItem } from '@/core/types';

function createMockCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
  } as unknown as CanvasRenderingContext2D;
}

describe('EquipmentRenderer', () => {
  it('draws a cone at its position with orange fill and border', () => {
    const ctx = createMockCtx();
    drawCone(ctx, { x: 100, y: 150 });
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.translate).toHaveBeenCalledWith(100, 150);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('draws a tire with dark rubber and tread rings', () => {
    const ctx = createMockCtx();
    drawTire(ctx, { x: 200, y: 250 });
    expect(ctx.translate).toHaveBeenCalledWith(200, 250);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws a mini net with red frame and white netting', () => {
    const ctx = createMockCtx();
    drawMiniNet(ctx, { x: 300, y: 350 }, Math.PI / 4);
    expect(ctx.translate).toHaveBeenCalledWith(300, 350);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws a barrier with rounded padding', () => {
    const ctx = createMockCtx();
    drawBarrier(ctx, { x: 400, y: 450 }, { width: 80, height: 20 }, 0);
    expect(ctx.translate).toHaveBeenCalledWith(400, 450);
    expect(ctx.roundRect).toHaveBeenCalled();
  });

  it('draws a puck pile with small puck discs', () => {
    const ctx = createMockCtx();
    drawPuckPile(ctx, { x: 50, y: 50 }, 3);
    expect(ctx.translate).toHaveBeenCalledWith(50, 50);
    expect(ctx.arc).toHaveBeenCalled();
  });

  it('drawEquipment delegates to drawEquipmentItem for every item in list', () => {
    const ctx = createMockCtx();
    const items: EquipmentItem[] = [
      { id: 'c1', kind: 'cone', position: { x: 10, y: 10 } },
      { id: 't1', kind: 'tire', position: { x: 20, y: 20 } },
      { id: 'm1', kind: 'mini-net', position: { x: 30, y: 30 } },
    ];
    drawEquipment(ctx, items);
    expect(ctx.translate).toHaveBeenCalledWith(10, 10);
    expect(ctx.translate).toHaveBeenCalledWith(20, 20);
    expect(ctx.translate).toHaveBeenCalledWith(30, 30);
  });
});
