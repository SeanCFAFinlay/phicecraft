// ============================================================================
// MODEL CACHE
//
// Mocks the GLTFLoader seam entirely - no network, no real GLB parsing - so
// this is a pure test of the cache's own contract: reuse the same in-flight/
// resolved promise for a repeat call, and never keep a REJECTED one around
// (see modelCache.ts's own doc comment on `loadModel` for why that matters:
// a transient load failure must be retryable, not permanently poisoned).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` factories are hoisted above every import in this file - a plain
// `const loadAsyncMock = vi.fn()` referenced inside one would be read before
// its own initializer runs. `vi.hoisted` runs (and is itself hoisted) ahead
// of that, so the factory below can safely close over the real mock.
const { loadAsyncMock } = vi.hoisted(() => ({ loadAsyncMock: vi.fn() }));

// A plain class, NOT `vi.fn()` - the project's `restoreMocks: true` (see
// vite.config.ts) calls `mockRestore()` on every `vi.fn()` after each test,
// which would wipe a `GLTFLoader = vi.fn().mockImplementation(...)`'s
// implementation right back to a no-op between tests. `loadAsyncMock` itself
// is still a real `vi.fn()`, reconfigured per test in `beforeEach` below.
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync(...args: unknown[]) {
      return loadAsyncMock(...args);
    }
  },
}));

import { loadModel, resetModelCacheForTests } from './modelCache';

describe('loadModel', () => {
  beforeEach(() => {
    resetModelCacheForTests();
    loadAsyncMock.mockReset();
  });

  it('parses a key exactly once - a second call before the first resolves reuses the same in-flight promise', async () => {
    let resolveLoad: (gltf: { scene: object; animations: unknown[] }) => void = () => {};
    loadAsyncMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolveLoad = resolve;
      })
    );

    const first = loadModel('skater');
    const second = loadModel('skater');
    expect(first).toBe(second);

    resolveLoad({ scene: {}, animations: [] });
    await first;
    expect(loadAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the resolved promise for a later call too, still without a second parse', async () => {
    loadAsyncMock.mockResolvedValueOnce({ scene: {}, animations: [] });

    await loadModel('goalie');
    await loadModel('goalie');

    expect(loadAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('evicts the cache entry on rejection, so the NEXT call retries instead of staying permanently poisoned', async () => {
    loadAsyncMock.mockRejectedValueOnce(new Error('network down'));

    await expect(loadModel('skater')).rejects.toThrow('network down');

    loadAsyncMock.mockResolvedValueOnce({ scene: {}, animations: [] });
    const retried = await loadModel('skater');

    expect(retried.scene).toBeDefined();
    expect(loadAsyncMock).toHaveBeenCalledTimes(2);
  });

  it('does not confuse one key rejecting with another key ever being touched', async () => {
    loadAsyncMock.mockRejectedValueOnce(new Error('skater failed'));
    await expect(loadModel('skater')).rejects.toThrow('skater failed');

    loadAsyncMock.mockResolvedValueOnce({ scene: {}, animations: [] });
    await loadModel('goalie');

    expect(loadAsyncMock).toHaveBeenCalledTimes(2);
  });
});
