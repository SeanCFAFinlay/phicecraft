// ============================================================================
// BOARD RENDERER
//
// The render surface is two pure draw functions — drawStaticLayer (the rink)
// and drawDynamicLayer (the game) — this interface formalizes them so a
// second implementation (WebGL, Phase 3) can stand behind the same two
// canvases without CanvasSurface or useCanvasLayers knowing which one is
// live.
// ============================================================================

import type { StaticLayerInput } from '@/components/canvas/renderStatic';
import type { DynamicLayerInput } from '@/components/canvas/renderDynamic';

export interface BoardRenderer {
  /** Draw the rink layer. Implementations self-skip when nothing changed (staticLayerKey). */
  drawStatic(input: StaticLayerInput): void;
  /** Draw the game layer. Called synchronously up to 60×/s. */
  drawDynamic(input: DynamicLayerInput): void;
  /** Resize backing stores. Called from the ResizeObserver/DPR effect. */
  resize(width: number, height: number, dpr: number): void;
  /** Release GPU/2D resources. */
  dispose(): void;
  readonly kind: 'canvas2d' | 'webgl';
}

export interface RendererHost {
  staticCanvas: HTMLCanvasElement;
  dynamicCanvas: HTMLCanvasElement;
  onPaint: (layer: 'static' | 'dynamic') => void;
}

export type RendererFactory = (host: RendererHost) => BoardRenderer;
