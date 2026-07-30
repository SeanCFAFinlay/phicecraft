// ============================================================================
// Canvas2DRenderer — adapter test
//
// drawStaticLayer/drawDynamicLayer are mocked (kept real: staticLayerKey) so
// this test isolates the adapter's own control flow — the repaint guard,
// onPaint reporting, and resize's backing-store writes — from the rink/game
// drawing code, which has its own coverage.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaticLayerInput } from '@/components/canvas/renderStatic';
import type { DynamicLayerInput } from '@/components/canvas/renderDynamic';
import type { Camera, Drill } from '@/core/types';
import type { RendererHost } from '@/render/BoardRenderer';
import { EMPTY_TRAILS } from '@/playback/playbackFrame';

const drawStaticLayerMock = vi.fn();
const drawDynamicLayerMock = vi.fn();

vi.mock('@/components/canvas/renderStatic', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/canvas/renderStatic')>();
  return { ...actual, drawStaticLayer: (...args: unknown[]) => drawStaticLayerMock(...args) };
});

vi.mock('@/components/canvas/renderDynamic', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/canvas/renderDynamic')>();
  return { ...actual, drawDynamicLayer: (...args: unknown[]) => drawDynamicLayerMock(...args) };
});

const { Canvas2DRenderer } = await import('./Canvas2DRenderer');

function camera(overrides: Partial<Camera> = {}): Camera {
  return { x: 0, y: 0, zoom: 1, rotation: 0, tilt: 0, ...overrides };
}

function staticInput(overrides: Partial<StaticLayerInput> = {}): StaticLayerInput {
  return { camera: camera(), width: 800, height: 600, dpr: 1, ...overrides };
}

const drill: Drill = {
  id: 'drill-1',
  name: 'Test drill',
  createdAt: 0,
  updatedAt: 0,
  players: [],
  skatePaths: [],
  events: [],
};

function dynamicInput(overrides: Partial<DynamicLayerInput> = {}): DynamicLayerInput {
  return {
    camera: camera(),
    width: 800,
    height: 600,
    dpr: 1,
    drill,
    positions: {},
    playerFrames: {},
    puck: null,
    ghostTrails: EMPTY_TRAILS,
    isPlaying: false,
    suppressEditAffordances: false,
    progress: 0,
    selectedPlayerId: null,
    selectedEventId: null,
    passFromPlayerId: null,
    movingPlayerId: null,
    transientRoute: null,
    draggedPlayer: null,
    dragPreview: null,
    passCandidates: null,
    showDiagnostics: false,
    reducedEffects: false,
    ...overrides,
  };
}

/**
 * A recording stub standing in for CanvasRenderingContext2D. The adapter
 * never inspects it, only forwards it to the (mocked) draw function, so an
 * opaque marker is enough to prove identity across the call.
 */
function canvasWithStubbedContext(): { canvas: HTMLCanvasElement; ctx: object } {
  const canvas = document.createElement('canvas');
  const ctx = { marker: Symbol('2d-context') };
  canvas.getContext = vi.fn(() => ctx) as unknown as HTMLCanvasElement['getContext'];
  return { canvas, ctx };
}

describe('Canvas2DRenderer', () => {
  let staticCanvas: HTMLCanvasElement;
  let dynamicCanvas: HTMLCanvasElement;
  let staticCtx: object;
  let dynamicCtx: object;
  let onPaint: ReturnType<typeof vi.fn>;
  let renderer: InstanceType<typeof Canvas2DRenderer>;

  beforeEach(() => {
    drawStaticLayerMock.mockClear();
    drawDynamicLayerMock.mockClear();

    const staticPair = canvasWithStubbedContext();
    const dynamicPair = canvasWithStubbedContext();
    staticCanvas = staticPair.canvas;
    staticCtx = staticPair.ctx;
    dynamicCanvas = dynamicPair.canvas;
    dynamicCtx = dynamicPair.ctx;

    onPaint = vi.fn();
    const host: RendererHost = { staticCanvas, dynamicCanvas, onPaint };
    renderer = new Canvas2DRenderer(host);
  });

  it('reports its kind as canvas2d', () => {
    expect(renderer.kind).toBe('canvas2d');
  });

  describe('drawStatic', () => {
    it('paints through to drawStaticLayer and reports a paint', () => {
      renderer.drawStatic(staticInput());

      expect(drawStaticLayerMock).toHaveBeenCalledTimes(1);
      expect(drawStaticLayerMock).toHaveBeenCalledWith(staticCtx, staticInput());
      expect(onPaint).toHaveBeenCalledTimes(1);
      expect(onPaint).toHaveBeenCalledWith('static');
    });

    it('skips an identical repaint (the staticLayerKey guard)', () => {
      renderer.drawStatic(staticInput());
      renderer.drawStatic(staticInput());

      expect(drawStaticLayerMock).toHaveBeenCalledTimes(1);
      expect(onPaint).toHaveBeenCalledTimes(1);
    });

    it('repaints when the camera changes', () => {
      renderer.drawStatic(staticInput());
      renderer.drawStatic(staticInput({ camera: camera({ zoom: 2 }) }));

      expect(drawStaticLayerMock).toHaveBeenCalledTimes(2);
      expect(onPaint).toHaveBeenCalledTimes(2);
    });
  });

  describe('drawDynamic', () => {
    it('always paints, even for identical input', () => {
      renderer.drawDynamic(dynamicInput());
      renderer.drawDynamic(dynamicInput());

      expect(drawDynamicLayerMock).toHaveBeenCalledTimes(2);
      expect(drawDynamicLayerMock).toHaveBeenNthCalledWith(1, dynamicCtx, dynamicInput());
      expect(onPaint).toHaveBeenCalledTimes(2);
      expect(onPaint).toHaveBeenCalledWith('dynamic');
    });
  });

  describe('resize', () => {
    it('writes backing-store dimensions and style sizes on both canvases', () => {
      renderer.resize(400, 300, 2);

      for (const canvas of [staticCanvas, dynamicCanvas]) {
        expect(canvas.width).toBe(800);
        expect(canvas.height).toBe(600);
        expect(canvas.style.width).toBe('400px');
        expect(canvas.style.height).toBe('300px');
      }
    });

    it('rounds a fractional device pixel ratio', () => {
      renderer.resize(401, 301, 1.5);

      expect(staticCanvas.width).toBe(Math.round(401 * 1.5));
      expect(staticCanvas.height).toBe(Math.round(301 * 1.5));
    });
  });

  it('dispose does not throw', () => {
    expect(() => renderer.dispose()).not.toThrow();
  });
});
