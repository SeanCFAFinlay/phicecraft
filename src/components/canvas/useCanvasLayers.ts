// ============================================================================
// CANVAS LAYERS
//
// Two persistent canvases in one container: a static rink underneath and a
// dynamic game layer on top. Sizing, device-pixel-ratio policy, and the
// ResizeObserver live here so the surface component does not.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { effectiveDevicePixelRatio } from '@/camera/cameraMath';
import type { BoardRenderer } from '@/render/BoardRenderer';
import { Canvas2DRenderer } from '@/render/canvas2d/Canvas2DRenderer';
import { recordPaint } from '@/render/paintCounters';

export type RenderQuality = 'high' | 'medium' | 'low';

export interface CanvasLayers {
  containerRef: React.RefObject<HTMLDivElement>;
  staticCanvasRef: React.RefObject<HTMLCanvasElement>;
  dynamicCanvasRef: React.RefObject<HTMLCanvasElement>;
  width: number;
  height: number;
  dpr: number;
  quality: RenderQuality;
  /** Report a frame time so the renderer can shed pixels under sustained load. */
  reportFrameTime: (ms: number) => void;
  /**
   * The active renderer, or null before the two canvas elements have mounted.
   * A function, not a value, so its identity is stable across renders — the
   * renderer itself lives in a ref and must never join the memo below.
   */
  getRenderer: () => BoardRenderer | null;
}

/** Frames above this are over the 60fps budget with no headroom to spare. */
const FRAME_BUDGET_MS = 16.7;
/** How many consecutive over-budget frames before dropping a quality step. */
const DEGRADE_AFTER = 30;
/** How many consecutive comfortable frames before stepping back up. */
const RECOVER_AFTER = 120;

export function useCanvasLayers(onResize?: (width: number, height: number) => void): CanvasLayers {
  const containerRef = useRef<HTMLDivElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const dynamicCanvasRef = useRef<HTMLCanvasElement>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [quality, setQuality] = useState<RenderQuality>('high');

  const overBudget = useRef(0);
  const underBudget = useRef(0);

  const rendererRef = useRef<BoardRenderer | null>(null);
  const getRenderer = useCallback(() => rendererRef.current, []);

  // The seam every renderer implementation reports through; recordPaint owns
  // the app's `window.__phicecraftPaint` counters (src/render/paintCounters.ts).
  const onPaint = useCallback(recordPaint, []);

  const dpr = effectiveDevicePixelRatio(
    typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    quality
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      setSize(current =>
        current.width === width && current.height === height ? current : { width, height }
      );
      onResize?.(width, height);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [onResize]);

  // The renderer is constructed once both canvas elements exist. It lives in
  // a ref, not in state or the memo below, so choosing (or later swapping)
  // one never forces every subscriber of the memoized object to re-run.
  useEffect(() => {
    const staticCanvas = staticCanvasRef.current;
    const dynamicCanvas = dynamicCanvasRef.current;
    if (!staticCanvas || !dynamicCanvas) return;

    const renderer = new Canvas2DRenderer({ staticCanvas, dynamicCanvas, onPaint });
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [onPaint]);

  // Apply the backing-store size whenever the layout size or DPR changes.
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    rendererRef.current?.resize(size.width, size.height, dpr);
  }, [size, dpr]);

  const reportFrameTime = useCallback((ms: number) => {
    if (ms > FRAME_BUDGET_MS) {
      overBudget.current += 1;
      underBudget.current = 0;
    } else {
      underBudget.current += 1;
      overBudget.current = 0;
    }

    if (overBudget.current >= DEGRADE_AFTER) {
      overBudget.current = 0;
      setQuality(current => (current === 'high' ? 'medium' : 'low'));
    } else if (underBudget.current >= RECOVER_AFTER) {
      underBudget.current = 0;
      setQuality(current => (current === 'low' ? 'medium' : 'high'));
    }
  }, []);

  // Memoized: this object is a dependency of the draw callbacks, which are in
  // turn dependencies of subscriptions. A fresh object every render would
  // re-subscribe the canvas to the camera and frame stores continuously.
  // getRenderer's identity never changes (useCallback, no deps), so adding it
  // here does not add a new invalidation source.
  return useMemo(
    () => ({
      containerRef,
      staticCanvasRef,
      dynamicCanvasRef,
      width: size.width,
      height: size.height,
      dpr,
      quality,
      reportFrameTime,
      getRenderer,
    }),
    [size.width, size.height, dpr, quality, reportFrameTime, getRenderer]
  );
}
