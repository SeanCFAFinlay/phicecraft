// ============================================================================
// board3dCounters — unit test
//
// jsdom (`.dom.test.ts`) because the module reads/writes `window`.
// ============================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { installBoard3DCounters, markBoard3DActorsBuilt, recordBoard3DFrame } from './board3dCounters';

describe('board3dCounters', () => {
  beforeEach(() => {
    delete window.__phicecraftBoard3d;
  });

  it('starts with no frames rendered and actors not built', () => {
    const counters = installBoard3DCounters();
    expect(counters.framesRendered).toBe(0);
    expect(counters.actorsBuilt).toBe(false);
  });

  it('increments framesRendered on every recordBoard3DFrame() call', () => {
    recordBoard3DFrame();
    recordBoard3DFrame();
    recordBoard3DFrame();

    expect(window.__phicecraftBoard3d?.framesRendered).toBe(3);
  });

  it('markBoard3DActorsBuilt flips actorsBuilt to true', () => {
    expect(window.__phicecraftBoard3d?.actorsBuilt).toBeUndefined();
    markBoard3DActorsBuilt();
    expect(window.__phicecraftBoard3d?.actorsBuilt).toBe(true);
  });

  it('reset zeroes framesRendered and clears actorsBuilt', () => {
    recordBoard3DFrame();
    markBoard3DActorsBuilt();

    window.__phicecraftBoard3d?.reset();

    expect(window.__phicecraftBoard3d?.framesRendered).toBe(0);
    expect(window.__phicecraftBoard3d?.actorsBuilt).toBe(false);
  });

  it('installing twice does not create a second object or reset counts already recorded', () => {
    const first = installBoard3DCounters();
    recordBoard3DFrame();

    const second = installBoard3DCounters();

    expect(second).toBe(first);
    expect(second.framesRendered).toBe(1);
  });
});
