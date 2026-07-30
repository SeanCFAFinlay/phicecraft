// ============================================================================
// CANVAS 2D RENDERER
//
// The first BoardRenderer implementation: a thin adapter over the existing
// pure draw functions. It owns the one piece of state those functions never
// had a home for — the staticLayerKey repaint guard — so every future
// implementation (WebGL) owns its own skip logic instead of sharing a ref
// that used to live in CanvasSurface.
// ============================================================================

import type { BoardRenderer, RendererHost } from '@/render/BoardRenderer';
import { drawStaticLayer, staticLayerKey, type StaticLayerInput } from '@/components/canvas/renderStatic';
import { drawDynamicLayer, type DynamicLayerInput } from '@/components/canvas/renderDynamic';

export class Canvas2DRenderer implements BoardRenderer {
  readonly kind = 'canvas2d' as const;

  private lastStaticKey = '';

  constructor(private readonly host: RendererHost) {}

  drawStatic(input: StaticLayerInput): void {
    // Acquired lazily, on every draw, rather than cached at construction: a
    // canvas that has never had a context taken from it can still become
    // `webgl2` later (Task 4's renderer-selection ordering constraint).
    const ctx = this.host.staticCanvas.getContext('2d');
    if (!ctx) return;

    const key = staticLayerKey(input);
    if (key === this.lastStaticKey) return;
    this.lastStaticKey = key;

    drawStaticLayer(ctx, input);
    this.host.onPaint('static');
  }

  drawDynamic(input: DynamicLayerInput): void {
    const ctx = this.host.dynamicCanvas.getContext('2d');
    if (!ctx) return;

    drawDynamicLayer(ctx, input);
    this.host.onPaint('dynamic');
  }

  resize(width: number, height: number, dpr: number): void {
    for (const canvas of [this.host.staticCanvas, this.host.dynamicCanvas]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
  }

  dispose(): void {
    // Canvas 2D holds no resources beyond the DOM elements it was given.
  }
}
