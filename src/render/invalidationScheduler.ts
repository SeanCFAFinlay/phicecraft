// ============================================================================
// INVALIDATION SCHEDULER
//
// Coalesces static and dynamic scene redraw requests to at most one render
// per display animation frame, retaining dirty flags raised during painting.
// ============================================================================

export interface RenderFlags {
  static: boolean;
  dynamic: boolean;
}

export type RenderCallback = (flags: RenderFlags) => void;

export interface SchedulerOptions {
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (id: number) => void;
}

export class InvalidationScheduler {
  private dirtyStatic = false;
  private dirtyDynamic = false;
  private frameId: number | null = null;
  private isRendering = false;
  private callback: RenderCallback | null = null;

  private readonly requestFrame: (cb: () => void) => number;
  private readonly cancelFrame: (id: number) => void;

  constructor(options: SchedulerOptions = {}) {
    this.requestFrame = options.requestFrame ?? (cb => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(cb) : setTimeout(cb, 16) as unknown as number));
    this.cancelFrame = options.cancelFrame ?? (id => (typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame(id) : clearTimeout(id)));
  }

  setCallback(callback: RenderCallback): void {
    this.callback = callback;
  }

  requestStatic(): void {
    this.dirtyStatic = true;
    this.scheduleFrame();
  }

  requestDynamic(): void {
    this.dirtyDynamic = true;
    this.scheduleFrame();
  }

  requestAll(): void {
    this.dirtyStatic = true;
    this.dirtyDynamic = true;
    this.scheduleFrame();
  }

  isDirty(): boolean {
    return this.dirtyStatic || this.dirtyDynamic;
  }

  cancel(): void {
    if (this.frameId !== null) {
      this.cancelFrame(this.frameId);
      this.frameId = null;
    }
  }

  flush(): void {
    this.cancel();
    this.triggerFrame();
  }

  private scheduleFrame(): void {
    if (this.frameId !== null || this.isRendering) return;
    this.frameId = this.requestFrame(() => {
      this.frameId = null;
      this.triggerFrame();
    });
  }

  private triggerFrame(): void {
    if (!this.dirtyStatic && !this.dirtyDynamic) return;
    if (!this.callback) return;

    const flags: RenderFlags = {
      static: this.dirtyStatic,
      dynamic: this.dirtyDynamic,
    };

    this.dirtyStatic = false;
    this.dirtyDynamic = false;

    this.isRendering = true;
    try {
      this.callback(flags);
    } finally {
      this.isRendering = false;
      // If work was dirtied during callback, schedule next frame
      if (this.dirtyStatic || this.dirtyDynamic) {
        this.scheduleFrame();
      }
    }
  }
}
