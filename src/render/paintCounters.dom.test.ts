// ============================================================================
// paintCounters — unit test
//
// jsdom (`.dom.test.ts`) because the module reads/writes `window`.
// ============================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { installPaintCounters, recordPaint, setRendererKind } from './paintCounters';

describe('paintCounters', () => {
  beforeEach(() => {
    delete window.__phicecraftPaint;
  });

  it('increments the two layer counters independently via recordPaint', () => {
    recordPaint('static');
    recordPaint('static');
    recordPaint('dynamic');

    expect(window.__phicecraftPaint?.staticPaints).toBe(2);
    expect(window.__phicecraftPaint?.dynamicPaints).toBe(1);
  });

  it('reset zeroes both counters', () => {
    recordPaint('static');
    recordPaint('dynamic');

    window.__phicecraftPaint?.reset();

    expect(window.__phicecraftPaint?.staticPaints).toBe(0);
    expect(window.__phicecraftPaint?.dynamicPaints).toBe(0);
  });

  it('installing twice does not create a second object or reset counts already recorded', () => {
    const first = installPaintCounters();
    recordPaint('static');

    const second = installPaintCounters();

    expect(second).toBe(first);
    expect(second.staticPaints).toBe(1);
  });

  it('kind starts null, before any renderer has been selected', () => {
    expect(installPaintCounters().kind).toBeNull();
  });

  it('setRendererKind records which BoardRenderer actually won selection', () => {
    setRendererKind('webgl');
    expect(window.__phicecraftPaint?.kind).toBe('webgl');

    setRendererKind('canvas2d');
    expect(window.__phicecraftPaint?.kind).toBe('canvas2d');
  });

  it('reset() zeroes the paint counts but leaves kind untouched', () => {
    setRendererKind('webgl');
    recordPaint('static');

    window.__phicecraftPaint?.reset();

    expect(window.__phicecraftPaint?.staticPaints).toBe(0);
    expect(window.__phicecraftPaint?.kind).toBe('webgl');
  });
});
