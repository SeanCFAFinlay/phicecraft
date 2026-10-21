import { describe, it, expect, vi } from 'vitest';
import { QualityStore, DEGRADE_AFTER, RECOVER_AFTER } from './qualityStore';

describe('QualityStore', () => {
  it('starts at high quality', () => {
    const store = new QualityStore();
    expect(store.getSnapshot()).toBe('high');
  });

  it('degrades to medium after sustained draw cost over budget', () => {
    const store = new QualityStore();
    const listener = vi.fn();
    store.subscribe(listener);

    for (let i = 0; i < DEGRADE_AFTER - 1; i++) {
      store.reportFrameTime(20);
      expect(store.getSnapshot()).toBe('high');
    }

    store.reportFrameTime(20);
    expect(store.getSnapshot()).toBe('medium');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('degrades to low after further sustained draw cost over budget', () => {
    const store = new QualityStore();
    for (let i = 0; i < DEGRADE_AFTER * 2; i++) {
      store.reportFrameTime(25);
    }
    expect(store.getSnapshot()).toBe('low');
  });

  it('degrades on frame pacing interval drops even if draw code is fast', () => {
    const store = new QualityStore();
    // draw code is 2ms (fast), but interval is 30ms (stutter / jank)
    for (let i = 0; i < DEGRADE_AFTER; i++) {
      store.reportFrameTime(2, 30);
    }
    expect(store.getSnapshot()).toBe('medium');
  });

  it('recovers with hysteresis after sustained under-budget frames', () => {
    const store = new QualityStore();
    // Degrade to low
    for (let i = 0; i < DEGRADE_AFTER * 2; i++) {
      store.reportFrameTime(30);
    }
    expect(store.getSnapshot()).toBe('low');

    // 119 good frames -> still low
    for (let i = 0; i < RECOVER_AFTER - 1; i++) {
      store.reportFrameTime(8, 16.6);
      expect(store.getSnapshot()).toBe('low');
    }

    // 120th good frame -> steps up to medium
    store.reportFrameTime(8, 16.6);
    expect(store.getSnapshot()).toBe('medium');

    // another 120 good frames -> steps up to high
    for (let i = 0; i < RECOVER_AFTER; i++) {
      store.reportFrameTime(8, 16.6);
    }
    expect(store.getSnapshot()).toBe('high');
  });
});
