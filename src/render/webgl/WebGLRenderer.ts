// ============================================================================
// WEBGL RENDERER
//
// The second BoardRenderer implementation, behind Task 4's experimental
// toggle. A Pixi renderer per canvas, resized and disposed exactly like
// Canvas2DRenderer, with no PIXI.Application and no ticker (see Task 4's
// brief): draws stay synchronous, driven by the same rAF-triggered effects
// CanvasSurface already runs, so Pixi's own scheduler never gets a chance to
// fight it.
//
// Static layer (Task 5): the flat rink is a real Pixi scene graph
// (`rinkScene.ts`), built once and re-rendered every frame under a camera
// transform (`container.setFromMatrix`) - see `drawStatic` below.
//
// Tabletop fallback: the raised-boards "spin around" arena is Canvas2D-only
// (`rinkScene.ts` never modelled it - see its header) and, once a canvas has
// been handed a `webgl2` context, it can never yield a `2d` one again, so
// Canvas2D can never draw straight onto `host.staticCanvas` again either. The
// brief poses this as a choice between two DOM-level workarounds (swap in a
// second, hidden pair of `2d` canvases, or swap the whole BoardRenderer
// instance out for a session). Both would touch CanvasSurface's pointer
// handlers, which are wired to the specific `dynamicCanvas` element the app
// mounted (`useCanvasLayers.ts`) - swapping or hiding that element mid-session
// risks silently detaching gestures from hit-testing, which is exactly the
// contract this task must not break.
//
// This renderer instead reuses the pass-through buffer/sprite pipeline Task 4
// already built (still the dynamic layer's only pipeline, and now also the
// static layer's tabletop-only one): `drawStaticLayer` - the SAME Canvas2D
// function `Canvas2DRenderer` calls, `elevated` arena and all - draws onto the
// buffer canvas, which was never locked to any context and is happy to stay
// `2d` forever; its pixels are uploaded to the GPU as a texture and blitted
// onto the real, permanently-`webgl2` canvas by Pixi. No DOM node changes
// identity, so every pointer handler keeps pointing at the same element it
// always has. The flat rink (the common case) still renders as a native Pixi
// scene; only the tabletop range of `camera.tilt` takes this path.
// ============================================================================

import { WebGLRenderer as PixiWebGLRenderer, Sprite, Texture, Matrix, type Container } from 'pixi.js';
import type { BoardRenderer, RendererHost } from '@/render/BoardRenderer';
import { drawStaticLayer, staticLayerKey, type StaticLayerInput } from '@/components/canvas/renderStatic';
import { drawDynamicLayer, type DynamicLayerInput } from '@/components/canvas/renderDynamic';
import { TABLETOP_MIN_TILT } from '@/core/constants';
import { cameraMatrix } from '@/utils/geometry';
import { buildRinkScene } from './rinkScene';

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
  //
  // preserveDrawingBuffer: true - without it, WebGL is free to clear the
  // drawing buffer after the browser composites a frame. There is no ticker
  // here (draws are synchronous, driven only by actual camera/key changes -
  // see the file header), so the static layer in particular can sit for a
  // long time between `render()` calls; without this flag the browser's next
  // composite would show a blank canvas even though nothing was ever told to
  // clear it.
  await renderer.init({ canvas, backgroundAlpha: 0, antialias: false, resolution: 1, preserveDrawingBuffer: true });

  const sprite = new Sprite(Texture.from(buffer));
  return { renderer, buffer, bufferCtx, sprite };
}

export class WebGLRenderer implements BoardRenderer {
  readonly kind = 'webgl' as const;

  private lastStaticKey = '';
  private staticLayer: PassThroughLayer | null = null;
  private dynamicLayer: PassThroughLayer | null = null;
  /** Built once; re-rendered every frame under the camera transform. Tabletop frames bypass it entirely. */
  private readonly rinkScene: Container = buildRinkScene();
  private readonly readyPromise: Promise<void>;

  constructor(private readonly host: RendererHost) {
    this.readyPromise = this.init();
  }

  private async init(): Promise<void> {
    // allSettled, not all: a real GPU can hand out a context for one canvas
    // and then refuse the other (context limit, driver reset, shader/
    // extension failure). `Promise.all` would reject the moment the second
    // one throws while the first canvas has ALREADY been irreversibly handed
    // a `webgl2` context - a context type, once granted, can never change for
    // that canvas element. Settling both first means the succeeded layer is
    // known and can be disposed (its GPU resources released) before this
    // renderer is discarded, rather than left dangling. The canvas itself
    // stays locked to `webgl2` either way - only selectRenderer, which still
    // holds the host, can detect that and warn accurately instead of
    // silently handing the coach a Canvas2DRenderer that can't draw it.
    const [staticResult, dynamicResult] = await Promise.allSettled([
      buildLayer(this.host.staticCanvas),
      buildLayer(this.host.dynamicCanvas),
    ]);

    if (staticResult.status === 'fulfilled') this.staticLayer = staticResult.value;
    if (dynamicResult.status === 'fulfilled') this.dynamicLayer = dynamicResult.value;

    if (staticResult.status === 'rejected' || dynamicResult.status === 'rejected') {
      this.dispose();
      const reason =
        staticResult.status === 'rejected'
          ? staticResult.reason
          : dynamicResult.status === 'rejected'
            ? dynamicResult.reason
            : undefined;
      throw reason instanceof Error
        ? reason
        : new Error('WebGL renderer failed to initialize on one or both canvases');
    }
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

    const tilt = input.camera.tilt ?? 0;
    if (tilt > TABLETOP_MIN_TILT) {
      // Tabletop: canvasFallback path (see file header) - the exact same
      // Canvas2D draw Canvas2DRenderer would do, blitted onto the real,
      // permanently-webgl2 canvas via the pass-through buffer/sprite.
      drawStaticLayer(layer.bufferCtx, input);
      layer.sprite.texture.source.update();
      layer.renderer.render(layer.sprite);
    } else {
      const m = cameraMatrix(input.camera);
      this.rinkScene.setFromMatrix(new Matrix(m.a, m.b, m.c, m.d, m.e, m.f));
      layer.renderer.render(this.rinkScene);
    }
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
    this.rinkScene.destroy({ children: true });
  }
}
