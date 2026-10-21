// ============================================================================
// QUALITY STORE
//
// The auto-degrade render-quality tier, shared between the 2D canvas/WebGL
// pipeline and Board3D. Measures full frame pacing (inter-frame intervals
// and draw duration) under sustained pressure with hysteresis.
// ============================================================================

import type { RenderQuality } from './quality';

export type { RenderQuality };

/** Target 60fps frame budget in ms. */
export const FRAME_BUDGET_MS = 16.7;
/** Frame interval threshold indicating a dropped frame / compositor stall. */
export const JANK_INTERVAL_MS = 24.0;
/** How many consecutive over-budget frames before dropping a quality step. */
export const DEGRADE_AFTER = 30;
/** How many consecutive comfortable frames before stepping back up. */
export const RECOVER_AFTER = 120;

export class QualityStore {
  private tier: RenderQuality = 'high';
  private overBudget = 0;
  private underBudget = 0;
  private lastFrameTimestamp = 0;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RenderQuality => this.tier;

  /**
   * Report one frame's measurement.
   * @param drawDurationMs Time spent in synchronous drawing code.
   * @param intervalMs Optional elapsed time since last frame (full frame pacing).
   */
  reportFrameTime = (drawDurationMs: number, intervalMs?: number): void => {
    const isOverBudget = drawDurationMs > FRAME_BUDGET_MS || (intervalMs !== undefined && intervalMs > JANK_INTERVAL_MS);

    if (isOverBudget) {
      this.overBudget += 1;
      this.underBudget = 0;
    } else {
      this.underBudget += 1;
      this.overBudget = 0;
    }

    if (this.overBudget >= DEGRADE_AFTER) {
      this.overBudget = 0;
      this.setTier(this.tier === 'high' ? 'medium' : 'low');
    } else if (this.underBudget >= RECOVER_AFTER) {
      this.underBudget = 0;
      this.setTier(this.tier === 'low' ? 'medium' : 'high');
    }
  };

  /**
   * Report frame pacing directly using performance timestamp.
   */
  reportFrameTimestamp = (now: number, drawDurationMs: number): void => {
    const interval = this.lastFrameTimestamp > 0 ? now - this.lastFrameTimestamp : 16.6;
    this.lastFrameTimestamp = now;
    this.reportFrameTime(drawDurationMs, interval);
  };

  resetPacing = (): void => {
    this.lastFrameTimestamp = 0;
    this.overBudget = 0;
    this.underBudget = 0;
  };

  private setTier(next: RenderQuality): void {
    if (next === this.tier) return;
    this.tier = next;
    for (const listener of this.listeners) listener();
  }
}
