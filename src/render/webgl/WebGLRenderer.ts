// ============================================================================
// WEBGL RENDERER
//
// The second BoardRenderer implementation. A Pixi renderer per canvas,
// resized and disposed exactly like Canvas2DRenderer, with no PIXI.Application
// and no ticker: draws stay synchronous, driven by the same rAF-triggered
// effects CanvasSurface already runs, so Pixi's own scheduler never gets a
// chance to fight it.
//
// Static layer: the flat rink is a real Pixi scene graph (`rinkScene.ts`),
// built once and re-rendered every frame under a camera transform
// (`container.setFromMatrix`).
//
// Dynamic layer: the game scene (`gameScene.ts`) is built once and updated in
// place every frame from the same `DynamicLayerInput` the Canvas2D path
// reads, mirroring its paint order group by group.
//
// Phase 4 Task 6 removed the tabletop pseudo-3D pass entirely (the raised-
// boards "spin around" arena that used to live behind `camera.tilt` on this
// same static/dynamic pair, rendered via a Canvas2D pass-through buffer
// blitted onto the canvas as a texture): true 3D (`src/render3d/Board3D.tsx`)
// is now the unconditional tabletop presentation, mounted by AppShell instead
// of this renderer once tilted. `drawStatic`/`drawDynamic` below are
// therefore unconditionally Pixi - camera.tilt never routes anywhere else.
// ============================================================================

import { WebGLRenderer as PixiWebGLRenderer, Matrix, type Container } from 'pixi.js';
import type { BoardRenderer, RendererHost } from '@/render/BoardRenderer';
import { staticLayerKey, type StaticLayerInput } from '@/components/canvas/renderStatic';
import type { DynamicLayerInput } from '@/components/canvas/renderDynamic';
import { cameraMatrix } from '@/utils/geometry';
import { buildRinkScene } from './rinkScene';
import { buildGameScene, destroyGameScene, updateGameScene, type GameScene } from './gameScene';

/**
 * `preserveDrawingBuffer` (review finding, carried forward from Task 5):
 * without it, WebGL is free to clear the drawing buffer after the browser
 * composites a frame. There is no ticker here (draws are synchronous, driven
 * only by actual camera/key changes - see the file header), so the STATIC
 * layer in particular can sit for a long time between `render()` calls;
 * without this flag the browser's next composite would show a blank canvas
 * even though nothing was ever told to clear it. The DYNAMIC layer has no
 * such gap - it repaints on every playback frame and every authoring change
 * up to 60x/s (see BoardRenderer.ts) - so it pays preservation's real
 * per-frame cost (the driver keeps last frame's buffer around instead of
 * discarding it) for no benefit; only the static layer opts in.
 */
async function buildRenderer(
  canvas: HTMLCanvasElement,
  preserveDrawingBuffer: boolean
): Promise<PixiWebGLRenderer> {
  const renderer = new PixiWebGLRenderer();
  // resolution 1: the canvas is resized to the exact device-pixel dimensions
  // Canvas2DRenderer would use (see `resize` below), so nothing here needs
  // its own DPR scaling.
  await renderer.init({
    canvas,
    backgroundAlpha: 0,
    antialias: false,
    resolution: 1,
    preserveDrawingBuffer,
  });
  return renderer;
}

export class WebGLRenderer implements BoardRenderer {
  readonly kind = 'webgl' as const;

  private lastStaticKey = '';
  private staticRenderer: PixiWebGLRenderer | null = null;
  private dynamicRenderer: PixiWebGLRenderer | null = null;
  /** Built once; re-rendered every frame under the camera transform. */
  private readonly rinkScene: Container = buildRinkScene();
  /** Built once; updated in place every frame. */
  private readonly gameScene: GameScene = buildGameScene();
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
      buildRenderer(this.host.staticCanvas, true),
      buildRenderer(this.host.dynamicCanvas, false),
    ]);

    if (staticResult.status === 'fulfilled') this.staticRenderer = staticResult.value;
    if (dynamicResult.status === 'fulfilled') this.dynamicRenderer = dynamicResult.value;

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
    const renderer = this.staticRenderer;
    if (!renderer) return;

    const key = staticLayerKey(input);
    if (key === this.lastStaticKey) return;
    this.lastStaticKey = key;

    const m = cameraMatrix(input.camera);
    this.rinkScene.setFromMatrix(new Matrix(m.a, m.b, m.c, m.d, m.e, m.f));
    renderer.render(this.rinkScene);
    this.host.onPaint('static');
  }

  drawDynamic(input: DynamicLayerInput): void {
    const renderer = this.dynamicRenderer;
    if (!renderer) return;

    updateGameScene(this.gameScene, input);
    const m = cameraMatrix(input.camera);
    this.gameScene.root.setFromMatrix(new Matrix(m.a, m.b, m.c, m.d, m.e, m.f));
    renderer.render(this.gameScene.root);
    this.host.onPaint('dynamic');
  }

  resize(width: number, height: number, dpr: number): void {
    for (const [canvas, renderer] of [
      [this.host.staticCanvas, this.staticRenderer],
      [this.host.dynamicCanvas, this.dynamicRenderer],
    ] as const) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (!renderer) continue;
      renderer.resize(width, height, dpr);
    }
  }

  dispose(): void {
    this.staticRenderer?.destroy();
    this.dynamicRenderer?.destroy();
    this.staticRenderer = null;
    this.dynamicRenderer = null;
    this.rinkScene.destroy({ children: true });
    destroyGameScene(this.gameScene);
  }
}
