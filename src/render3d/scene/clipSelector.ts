// ============================================================================
// CLIP SELECTOR
//
// Pure per-tick clip-NAME selection and clip-category rules for actors.ts.
// Nothing here touches THREE.AnimationMixer/AnimationAction - just data in,
// a name or boolean out - so this stays trivially unit-testable and
// actors.ts owns all the mixer wiring (crossfades, weights, per-action
// timeScale). See docs/v2/AUTHORING_CLIPS.md for the authoring contract this
// implements.
// ============================================================================

import type { PlaybackPlayerFrame, SkaterAction } from '@/core/types';

/**
 * Duration of a `THREE.AnimationAction.crossFadeTo()` when the selected clip
 * changes (actors.ts). 0.15s reads as an instant weight shift, not a visible
 * blend, at typical stride cadence.
 */
export const CLIP_FADE_SECONDS = 0.15;

/**
 * Clip names that read as skating/moving and therefore speed-scale via
 * `skateTimeScale` and freeze at the ready pose below `SKATE_FREEZE_SPEED`
 * (actors.ts). `stride` is the canonical future Blender-authored name for
 * this loop (docs/v2/AUTHORING_CLIPS.md); `skate` is what today's shipped
 * GLB actually calls it - both must be treated identically so a rename from
 * `skate` to `stride` in a future export is a no-op for this rule. `glide`
 * and `turn` are the guide's two other authored movement loops. Every other
 * `SkaterAction` (`pass`/`shot`/`stop`/`receive`/`recover`/`idle`) plays at a
 * flat 1x regardless of speed.
 */
const MOVEMENT_CLIP_NAMES: ReadonlySet<string> = new Set(['skate', 'stride', 'glide', 'turn']);

export function isMovementClip(clipName: string): boolean {
  return MOVEMENT_CLIP_NAMES.has(clipName);
}

/**
 * The fallback chain tried, in order, for one `SkaterAction`: the action
 * itself, then `'stride'` (the canonical future movement-loop name), then
 * `'skate'` (today's shipped name for that same loop). Every `SkaterAction`
 * therefore always bottoms out at whichever movement clip the model
 * actually ships, which is what keeps today's single-clip GLBs looking
 * identical to before this change - with only `skate` present, every action
 * resolves to it.
 */
function skaterFallbackChain(action: SkaterAction): readonly string[] {
  return [action, 'stride', 'skate'];
}

/**
 * The clip name to play this tick - a pure function of frame data only, no
 * event/one-shot state, so scrubbing to the same frame twice always yields
 * the same clip and the same fade decision in actors.ts.
 *
 * Goalie is unconditional: always `'goalie_idle'`, unaffected by the frame.
 * Skater tries `frame.action` verbatim, then falls back through
 * `skaterFallbackChain` to the first name that exists on this model. This
 * deliberately ignores AUTHORING_CLIPS.md's original LoopOnce suggestion for
 * `pass`/`shot`/`stop`: the sim's `action` field already times those windows
 * frame-by-frame, so looping every clip and following `frame.action` here
 * keeps clip choice - and thus scrubbing - a pure function of the frame,
 * with no "has this one-shot already fired" state to get out of sync with
 * the timeline.
 */
export function selectClipName(
  kind: 'skater' | 'goalie',
  frame: PlaybackPlayerFrame | undefined,
  availableClipNames: ReadonlySet<string>
): string {
  if (kind === 'goalie') return 'goalie_idle';

  const action: SkaterAction = frame?.action ?? 'idle';
  for (const name of skaterFallbackChain(action)) {
    if (availableClipNames.has(name)) return name;
  }
  // Nothing in the chain exists on this model (e.g. a fixture with neither
  // 'stride' nor 'skate') - actors.ts's own findClip() falls back further to
  // animations[0], so the chain's last link is still a meaningful request.
  return 'skate';
}
