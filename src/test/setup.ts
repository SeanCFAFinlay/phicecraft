// ============================================================================
// VITEST SETUP - shared across the node and jsdom environments
// ============================================================================

import { afterEach, vi } from 'vitest';

const isDom = typeof window !== 'undefined' && typeof document !== 'undefined';

if (isDom) {
  // Only the DOM projects need Testing Library's matchers and auto-cleanup.
  // The `/vitest` entry point both extends `expect` and augments its types.
  await import('@testing-library/jest-dom/vitest');

  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);

  // jsdom implements neither of these, and the responsive shell reads both on
  // first render. Default to a desktop-sized, motion-allowed environment; the
  // viewport helpers in `src/test/utils` override per test.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) =>
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)) as typeof cancelAnimationFrame;
  }

  // Canvas is not implemented in jsdom. Component tests assert on DOM, never
  // on pixels, so a no-op 2D context keeps the renderer from throwing.
  if (!HTMLCanvasElement.prototype.getContext) {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  }
}

afterEach(() => {
  vi.useRealTimers();
});
