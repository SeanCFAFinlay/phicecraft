// ============================================================================
// CANVAS HOOK - Canvas setup and rendering utilities
// ============================================================================

import { useRef, useEffect, useCallback } from 'react';

interface UseCanvasOptions {
  onResize?: (width: number, height: number) => void;
}

export function useCanvas(options: UseCanvasOptions = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Handle resize and setup
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;

      if (width === 0 || height === 0) return;

      // Set canvas size (with device pixel ratio for sharp rendering)
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Get fresh context and scale for DPR
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        contextRef.current = ctx;
      }

      options.onResize?.(width, height);
    };

    // Initial size with a small delay to ensure DOM is ready
    setTimeout(handleResize, 0);

    // Watch for resize
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => observer.disconnect();
  }, [options.onResize]);

  // Get canvas dimensions (CSS pixels, not device pixels)
  const getCanvasSize = useCallback(() => {
    const container = containerRef.current;
    if (!container) return { width: 0, height: 0 };

    return {
      width: container.clientWidth,
      height: container.clientHeight,
    };
  }, []);

  // Get pointer position relative to canvas
  const getPointerPosition = useCallback((event: React.PointerEvent | PointerEvent | React.TouchEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;

    if ('touches' in event) {
      const touch = event.touches[0] || event.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  return {
    canvasRef,
    containerRef,
    contextRef,
    getCanvasSize,
    getPointerPosition,
  };
}
