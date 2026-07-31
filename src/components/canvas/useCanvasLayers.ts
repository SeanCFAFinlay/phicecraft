// ============================================================================
// CANVAS LAYERS
//
// Two persistent canvases in one container: a static rink underneath and a
// dynamic game layer on top. Sizing, device-pixel-ratio policy, and the
// ResizeObserver live here so the surface component does not.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { effectiveDevicePixelRatio } from '@/camera/cameraMath';
import type { BoardRenderer, RendererHost } from '@/render/BoardRenderer';
import { recordPaint } from '@/render/paintCounters';
import { resolveRendererPreference, selectRenderer } from '@/render/selectRenderer';

/** Default `announce` when a caller has no live region to report through. */
const NOOP_ANNOUNCE = (): void => {};

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

export function useCanvasLayers(
  onResize?: (width: number, height: number) => void,
  announce: (message: string) => void = NOOP_ANNOUNCE
): CanvasLayers {
  const containerRef = useRef<HTMLDivElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const dynamicCanvasRef = useRef<HTMLCanvasElement>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [quality, setQuality] = useState<RenderQuality>('high');

  const overBudget = useRef(0);
  const underBudget = useRef(0);

  const rendererRef = useRef<BoardRenderer | null>(null);
  const getRenderer = useCallback(() => rendererRef.current, []);

  // selectRenderer resolves asynchronously (it may dynamic-import the WebGL
  // chunk), so by the time it settles, `size`/`dpr` from this render's
  // closure may already be stale - these refs always read the latest values.
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // The seam every renderer implementation reports through; recordPaint owns
  // the app's `window.__phicecraftPaint` counters (src/render/paintCounters.ts).
  const onPaint = useCallback(recordPaint, []);

  const dpr = effectiveDevicePixelRatio(
    typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    quality
  );
  const dprRef = useRef(dpr);
  dprRef.current = dpr;

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

  // The renderer is selected (and, for WebGL, dynamic-imported) once both
  // canvas elements exist, and lives in a ref, not in state or the memo
  // below, so choosing (or later swapping) one never forces every subscriber
  // of the memoized object to re-run.
  //
  // Selection is async, so nothing may acquire a context on either canvas
  // before it resolves - a canvas that has ever had a context taken from it
  // can never change type (see selectRenderer.ts). getRenderer() stays null
  // until then; CanvasSurface's draw effects already tolerate that by
  // skipping, so no frame is drawn before the choice is final.
  useEffect(() => {
    const staticCanvas = staticCanvasRef.current;
    const dynamicCanvas = dynamicCanvasRef.current;
    if (!staticCanvas || !dynamicCanvas) return;

    let cancelled = false;
    const host: RendererHost = { staticCanvas, dynamicCanvas, onPaint };
    const pref = resolveRendererPreference(window.location.search);

    void selectRenderer(pref, host, announce).then(renderer => {
      if (cancelled) {
        renderer.dispose();
        return;
      }
      rendererRef.current = renderer;
      // The size/DPR effect below may already have run once with nothing to
      // resize (the renderer did not exist yet); apply the latest known
      // values now so the new renderer is never left at its native default.
      if (sizeRef.current.width > 0 && sizeRef.current.height > 0) {
        renderer.resize(sizeRef.current.width, sizeRef.current.height, dprRef.current);
      }
    });

    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [onPaint, announce]);

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
