// ============================================================================
// QUALITY STORE
//
// The auto-degrade render-quality tier, extracted out of useCanvasLayers.ts
// so it can be a live AppServices store (created once per AppProvider,
// injectable in tests, exactly like CameraStore/PlaybackStore) instead of
// component-local state.
//
// This is what lets Board3D (the true-3D presentation, src/render3d/Board3D.tsx)
// share ONE tier with the flat 2D canvas path rather than always starting at
// 'high': a coach who has already degraded to 'medium' on the 2D board (a
// sustained over-budget frame rate) tilts into 3D still at 'medium', and time
// spent in Board3D that is itself over budget degrades the SAME tier the 2D
// path reads back from on the way out - not a second, independent counter
// that resets on every remount between the two.
// ============================================================================

import type { RenderQuality } from './quality';

export type { RenderQuality };

/** Frames above this are over the 60fps budget with no headroom to spare. */
const FRAME_BUDGET_MS = 16.7;
/** How many consecutive over-budget frames before dropping a quality step. */
const DEGRADE_AFTER = 30;
/** How many consecutive comfortable frames before stepping back up. */
const RECOVER_AFTER = 120;

export class QualityStore {
  private tier: RenderQuality = 'high';
  private overBudget = 0;
  private underBudget = 0;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RenderQuality => this.tier;

  /** Report one frame's paint time (ms). May step the tier down or up. */
  reportFrameTime = (ms: number): void => {
    if (ms > FRAME_BUDGET_MS) {
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

  private setTier(next: RenderQuality): void {
    if (next === this.tier) return;
    this.tier = next;
    for (const listener of this.listeners) listener();
  }
}
