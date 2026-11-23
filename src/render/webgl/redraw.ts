// ============================================================================
// REDRAW ONLY ON CHANGE
//
// Rebuilding a Pixi Graphics re-runs its tessellator. Doing that for every
// token on every playback frame was most of the per-frame cost, while almost
// nothing about a token's SHAPE changes as it moves - position and rotation
// are container transforms. Each Graphics remembers the key it was last drawn
// for and is rebuilt only when that key changes.
// ============================================================================

import type { Graphics } from 'pixi.js';

const drawnAs = new WeakMap<Graphics, string>();

export function redraw(g: Graphics, key: string, draw: (g: Graphics) => void): void {
  if (drawnAs.get(g) === key) return;
  drawnAs.set(g, key);
  g.clear();
  draw(g);
}

/** Forget the cached shape, for a Graphics something else just drew into directly. */
export function invalidateDrawn(g: Graphics): void {
  drawnAs.delete(g);
}
