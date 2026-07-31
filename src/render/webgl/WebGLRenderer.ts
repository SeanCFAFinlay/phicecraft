// ============================================================================
// WEBGL RENDERER (skeleton)
//
// The second BoardRenderer implementation, behind Task 4's experimental
// toggle. It exists to prove the GPU pipeline is wired end-to-end - a Pixi
// renderer per canvas, resized and disposed exactly like Canvas2DRenderer -
// without yet delegating any drawing to Pixi display objects. That is later
// phase 3 work.
//
// For now, every draw call still runs the exact same Canvas2D pure functions
// (drawStaticLayer / drawDynamicLayer) that Canvas2DRenderer uses, but against
// a detached, in-memory 2D canvas rather than the real one - the real canvas
// already has a `webgl2` context (a canvas that has ever had a context taken
// from it can never change type, so it can never go back to `2d`). That
// buffer's pixels are then uploaded to the GPU as a texture and blitted onto
// the real canvas by Pixi. Visually this is byte-for-byte the Canvas2D
// renderer; only the pipeline underneath has changed, which is what makes
// flipping the toggle safe on day one.
//
// No PIXI.Application and no ticker here, by design (see Task 4's brief):
// draws stay synchronous, driven by the same rAF-triggered effects
// CanvasSurface already runs, so Pixi's own scheduler never gets a chance to
// fight it.
// ============================================================================

import { WebGLRenderer as PixiWebGLRenderer, Sprite, Texture } from 'pixi.js';
import type { BoardRenderer, RendererHost } from '@/render/BoardRenderer';
import { drawStaticLayer, staticLayerKey, type StaticLayerInput } from '@/components/canvas/renderStatic';
import { drawDynamicLayer, type DynamicLayerInput } from '@/components/canvas/renderDynamic';

interface PassThroughLayer {
  renderer: PixiWebGLRenderer;
  /**
   * Never attached to the DOM. The pure Canvas2D draw functions target this
   * buffer; its pixels are what the sprite below uploads to the GPU.
   */
  buffer: HTMLCanvasElement;
  bufferCtx: CanvasRenderingContext2D;
  sprite: Sprite;
}

async function buildLayer(canvas: HTMLCanvasElement): Promise<PassThroughLayer> {
  const buffer = document.createElement('canvas');
  buffer.width = canvas.width || 1;
  buffer.height = canvas.height || 1;
  const bufferCtx = buffer.getContext('2d');
  if (!bufferCtx) {
    throw new Error('2d context unavailable for the WebGL renderer pass-through buffer');
  }

  const renderer = new PixiWebGLRenderer();
  // resolution 1: the buffer is resized to the exact device-pixel dimensions
  // Canvas2DRenderer would use, so nothing here needs its own DPR scaling.
  await renderer.init({ canvas, backgroundAlpha: 0, antialias: false, resolution: 1 });

  const sprite = new Sprite(Texture.from(buffer));
  return { renderer, buffer, bufferCtx, sprite };
}

export class WebGLRenderer implements BoardRenderer {
  readonly kind = 'webgl' as const;

  private lastStaticKey = '';
  private staticLayer: PassThroughLayer | null = null;
  private dynamicLayer: PassThroughLayer | null = null;
  private readonly readyPromise: Promise<void>;

  constructor(private readonly host: RendererHost) {
    this.readyPromise = this.init();
  }

  private async init(): Promise<void> {
    const [staticLayer, dynamicLayer] = await Promise.all([
      buildLayer(this.host.staticCanvas),
      buildLayer(this.host.dynamicCanvas),
    ]);
    this.staticLayer = staticLayer;
    this.dynamicLayer = dynamicLayer;
  }

  /** Resolves once both canvases have a Pixi renderer attached; rejects if either failed. */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  drawStatic(input: StaticLayerInput): void {
    const layer = this.staticLayer;
    if (!layer) return;

    const key = staticLayerKey(input);
    if (key === this.lastStaticKey) return;
    this.lastStaticKey = key;

    drawStaticLayer(layer.bufferCtx, input);
    layer.sprite.texture.source.update();
    layer.renderer.render(layer.sprite);
    this.host.onPaint('static');
  }

  drawDynamic(input: DynamicLayerInput): void {
    const layer = this.dynamicLayer;
    if (!layer) return;

    drawDynamicLayer(layer.bufferCtx, input);
    layer.sprite.texture.source.update();
    layer.renderer.render(layer.sprite);
    this.host.onPaint('dynamic');
  }

  resize(width: number, height: number, dpr: number): void {
    for (const [canvas, layer] of [
      [this.host.staticCanvas, this.staticLayer],
      [this.host.dynamicCanvas, this.dynamicLayer],
    ] as const) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (!layer) continue;
      // Both the real (webgl2) canvas and the pass-through buffer are kept at
      // the same device-pixel size Canvas2DRenderer would use.
      layer.renderer.resize(width, height, dpr);
      layer.sprite.texture.source.resize(width, height, dpr);
    }
  }

  dispose(): void {
    this.staticLayer?.renderer.destroy();
    this.dynamicLayer?.renderer.destroy();
    this.staticLayer = null;
    this.dynamicLayer = null;
  }
}
