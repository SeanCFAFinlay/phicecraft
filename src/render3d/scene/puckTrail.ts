// ============================================================================
// PUCK TRAIL
//
// The 3D counterpart to the 2D board's ghost trails (`drawGhostTrails`,
// gameSceneOverlays.ts) - a fading ribbon behind the puck's recent
// positions, fed by `PlaybackStore.puckTrail` (a second `GhostTrailBuffer`
// accumulated alongside `trails` in the SAME `seek`/`clear` lifecycle - see
// PlaybackStore.ts's own header). This module only ever turns already-
// accumulated points into geometry; it holds no playback state of its own.
//
// Zero per-frame allocation, mirroring `numberSprite.ts`/`actors.ts`'s own
// three.js patterns: the `BufferGeometry`'s position/color attributes are
// allocated ONCE at `GHOST_TRAIL_MAX_LENGTH` capacity, and every `update()`
// call writes into the SAME typed arrays and adjusts `drawRange` rather than
// building new geometry per frame.
// ============================================================================

import * as THREE from 'three';
import { GHOST_TRAIL_MAX_LENGTH } from '@/core/constants';
import type { Point } from '@/core/types';
import { rinkToWorld } from '../worldMap';

/** Matches the plan's brief exactly - a cool blue distinct from the puck's own near-black. */
export const PUCK_TRAIL_COLOR = '#8ab4d8';
/** Lifts the trail line just off the ice plane (y = 0) to avoid z-fighting with the ice mesh. */
export const PUCK_TRAIL_Y_LIFT = 0.02;
/** The tail's dimmest fraction of the base color - never fully black/invisible, just faded. */
const TAIL_MIN_FRACTION = 0.15;

export interface PuckTrail {
  line: THREE.Line;
  /**
   * `points` is oldest-first (the same contract `GhostTrailBuffer.read`/
   * `forEach` already promise the 2D path) - the newest sample renders at
   * full color, the oldest fades toward `TAIL_MIN_FRACTION`.
   */
  update(points: readonly Point[]): void;
  dispose(): void;
}

/**
 * Builds one puck-trail line, ready to add to the scene. Every call
 * allocates its own geometry/material/typed arrays - never shared - so
 * `dispose()` only ever frees this one instance's own GPU resources.
 */
export function createPuckTrail(): PuckTrail {
  const capacity = GHOST_TRAIL_MAX_LENGTH;
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const baseColor = new THREE.Color(PUCK_TRAIL_COLOR);

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colorAttribute);
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });

  const line = new THREE.Line(geometry, material);
  line.name = 'puck-trail';
  // The trail's bounding sphere is never recomputed per update (that would
  // itself be a per-frame allocation/walk) - frustum culling against a stale
  // bounds would eventually clip a trail that has moved. The trail is a thin
  // ribbon near the puck, cheap enough to always draw.
  line.frustumCulled = false;

  return {
    line,
    update(points) {
      const count = Math.min(points.length, capacity);

      for (let i = 0; i < count; i++) {
        const world = rinkToWorld(points[i]);
        positions[i * 3] = world.x;
        positions[i * 3 + 1] = world.y + PUCK_TRAIL_Y_LIFT;
        positions[i * 3 + 2] = world.z;

        // i=0 is the oldest sample (the tail); the newest (last) point
        // reaches full brightness. A single-point trail draws at full color.
        const fraction =
          count > 1 ? TAIL_MIN_FRACTION + (1 - TAIL_MIN_FRACTION) * (i / (count - 1)) : 1;
        colors[i * 3] = baseColor.r * fraction;
        colors[i * 3 + 1] = baseColor.g * fraction;
        colors[i * 3 + 2] = baseColor.b * fraction;
      }

      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
      geometry.setDrawRange(0, count);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
