import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvalidationScheduler, type RenderFlags } from './invalidationScheduler';

describe('InvalidationScheduler', () => {
  let callbacks: (() => void)[] = [];
  let scheduler: InvalidationScheduler;
  let nextFrameId = 1;

  beforeEach(() => {
    callbacks = [];
    nextFrameId = 1;
    scheduler = new InvalidationScheduler({
      requestFrame: cb => {
        const id = nextFrameId++;
        callbacks.push(cb);
        return id;
      },
      cancelFrame: _id => {
        callbacks = [];
      },
    });
  });

  const runScheduledFrames = () => {
    const queue = [...callbacks];
    callbacks = [];
    for (const cb of queue) cb();
  };

  it('coalesces multiple requests into a single frame', () => {
    const render = vi.fn();
    scheduler.setCallback(render);

    scheduler.requestStatic();
    scheduler.requestDynamic();
    scheduler.requestDynamic();
    scheduler.requestStatic();

    expect(render).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);

    runScheduledFrames();

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ static: true, dynamic: true });
  });

  it('supports single-layer invalidation', () => {
    const render = vi.fn();
    scheduler.setCallback(render);

    scheduler.requestDynamic();
    runScheduledFrames();

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ static: false, dynamic: true });

    scheduler.requestStatic();
    runScheduledFrames();

    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith({ static: true, dynamic: false });
  });

  it('retains dirty work raised during rendering for next frame', () => {
    const renders: RenderFlags[] = [];
    scheduler.setCallback(flags => {
      renders.push(flags);
      if (renders.length === 1) {
        scheduler.requestDynamic();
      }
    });

    scheduler.requestStatic();
    runScheduledFrames();

    expect(renders).toHaveLength(1);
    expect(renders[0]).toEqual({ static: true, dynamic: false });

    expect(callbacks).toHaveLength(1);
    runScheduledFrames();

    expect(renders).toHaveLength(2);
    expect(renders[1]).toEqual({ static: false, dynamic: true });
  });

  it('cleanly cancels pending frames', () => {
    const render = vi.fn();
    scheduler.setCallback(render);

    scheduler.requestAll();
    scheduler.cancel();

    runScheduledFrames();
    expect(render).not.toHaveBeenCalled();
  });

  it('flush executes pending invalidations immediately', () => {
    const render = vi.fn();
    scheduler.setCallback(render);

    scheduler.requestDynamic();
    scheduler.flush();

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ static: false, dynamic: true });
  });
});
