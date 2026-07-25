// ============================================================================
// CANVAS LAYERS
//
// Two persistent canvases in one container: a static rink underneath and a
// dynamic game layer on top. Sizing, device-pixel-ratio policy, and the
// ResizeObserver live here so the surface component does not.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { effectiveDevicePixelRatio } from '@/camera/cameraMath';

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

  // Apply the backing-store size whenever the layout size or DPR changes.
  useEffect(() => {
    for (const ref of [staticCanvasRef, dynamicCanvasRef]) {
      const canvas = ref.current;
      if (!canvas || size.width === 0 || size.height === 0) continue;
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
    }
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
    }),
    [size.width, size.height, dpr, quality, reportFrameTime]
  );
}
