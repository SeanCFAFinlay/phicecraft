// ============================================================================
// ACTORS
//
// Skaters, goalies, coaches and the puck as real three.js objects, driven
// every frame from the playback frame stream. `createActor` never loads a
// model itself - it takes an already-parsed `{scene, animations}` pair
// (Board3D.tsx owns the GLTFLoader, the module-scope parsed-GLTF cache, and
// the per-player `SkeletonUtils.clone()`), which is what lets
// `actors.dom.test.ts` drive this with a hand-built minimal GLTF-shaped
// fixture instead of a real loader.
// ============================================================================

import * as THREE from 'three';
import type { PlaybackPlayerFrame, Point } from '@/core/types';
import { clamp } from '@/utils/geometry';
import { headingToYaw, rinkToWorld } from '../worldMap';
import { tintActorMaterials } from './tintMaterials';

/** Rink-units/second at which the `skate` clip plays at its authored (1x) speed. */
export const REFERENCE_SKATE_SPEED = 120;
/** Below this speed a skater reads as stopped: the stride freezes rather than crawling in slow motion. */
export const SKATE_FREEZE_SPEED = 4;
/** Where in the clip a frozen skater's pose sits - an athletic ready stance, not the clip's dead frame 0. */
export const SKATE_FROZEN_POSE_FRACTION = 0.15;
const SKATE_TIME_SCALE_MIN = 0.2;
const SKATE_TIME_SCALE_MAX = 2.5;

/**
 * Above this fraction of the full timeline, a progress delta reads as a loop
 * wrap/jump (e.g. the playhead resetting from ~1 back to ~0) rather than a
 * real forward/backward scrub, and is treated as a zero-dt tick instead.
 */
const PROGRESS_WRAP_THRESHOLD = 0.5;

/**
 * The dt Board3D.tsx feeds every `Actor.update` each frame, derived from the
 * playback PROGRESS delta (not wall-clock time) scaled by clip duration - see
 * Board3D's module header: scrubbing the timeline must move the stride
 * exactly as far as playing it would.
 *
 * The delta is signed on purpose: a backward scrub is a legitimate reverse
 * delta and must play the stride backward through `mixer.update`, not freeze
 * it. The one exception is a loop wrap - progress jumping from near 1 back to
 * near 0 (or vice versa) - which is not a real scrub and would otherwise spin
 * the rig through most of the clip in a single frame; that case is detected
 * by `|delta| > PROGRESS_WRAP_THRESHOLD` and reported as dt = 0 (a no-op
 * tick) instead.
 */
export function resolveMixerDelta(progress: number, lastProgress: number, durationSeconds: number): number {
  const progressDelta = progress - lastProgress;
  if (Math.abs(progressDelta) > PROGRESS_WRAP_THRESHOLD) return 0;
  return progressDelta * durationSeconds;
}

/**
 * Pants are not a jersey-tinted garment in this presentation: every actor
 * wears the same neutral pair, matching the existing tabletop 2D piece
 * (`src/canvas/PlayerRenderer.ts`'s `drawStandingPlayer`, `pants = '#182432'`).
 */
const PANTS_COLOR = '#182432';

export interface ParsedActorModel {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export interface CreateActorOptions {
  kind: 'skater' | 'goalie';
  jersey: string;
  accent: string;
}

export interface Actor {
  root: THREE.Object3D;
  update(pos: Point, frame: PlaybackPlayerFrame | undefined, dt: number): void;
  dispose(): void;
}

/** A non-GLB marker actor: coaches and the puck share this simpler shape. */
export interface MarkerActor {
  root: THREE.Object3D;
  setPosition(pos: Point): void;
  dispose(): void;
}

function findClip(animations: THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  return THREE.AnimationClip.findByName(animations, name) ?? animations[0];
}

function skateTimeScale(speed: number): number {
  return clamp(speed / REFERENCE_SKATE_SPEED, SKATE_TIME_SCALE_MIN, SKATE_TIME_SCALE_MAX);
}

/**
 * One skater or goalie: an already-cloned GLTF scene graph (Board3D.tsx does
 * the `SkeletonUtils.clone()` before calling this), tinted to this actor's
 * own jersey/accent, and advanced every frame by `update`.
 */
export function createActor(gltf: ParsedActorModel, opts: CreateActorOptions): Actor {
  const root = gltf.scene;
  const tintedMaterials = tintActorMaterials(root, {
    jersey: opts.jersey,
    accent: opts.accent,
    pants: PANTS_COLOR,
  });

  const mixer = new THREE.AnimationMixer(root);
  const clipName = opts.kind === 'goalie' ? 'goalie_idle' : 'skate';
  const clip = findClip(gltf.animations, clipName);
  const action = clip ? mixer.clipAction(clip) : null;
  action?.play();

  return {
    root,
    update(pos, frame, dt) {
      const world = rinkToWorld(pos);
      root.position.set(world.x, world.y, world.z);
      root.rotation.y = headingToYaw(frame?.heading ?? 0);

      if (!action || !clip) return;

      if (opts.kind === 'goalie') {
        action.timeScale = 1;
      } else {
        const speed = frame?.speed ?? 0;
        if (speed < SKATE_FREEZE_SPEED) {
          action.timeScale = 0;
          action.time = clip.duration * SKATE_FROZEN_POSE_FRACTION;
        } else {
          action.timeScale = skateTimeScale(speed);
        }
      }
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      // Only the per-actor tint clones are this actor's own to dispose - the
      // mesh geometries and every untinted named material (skin/white/dark/
      // steel/stick) are shared with the module-scope cached GLTF (and every
      // other actor cloned from it) and must survive this actor's disposal.
      for (const material of tintedMaterials) material.dispose();
    },
  };
}

// ----------------------------------------------------------------------------
// Coaches — no GLB. A plain capsule body on a disc base, in the same neutral
// grey as the 2D coach token's colourway (`src/canvas/CoachRenderer.ts`).
// ----------------------------------------------------------------------------

const COACH_COLOR = '#e5e7eb';
const COACH_CAPSULE_RADIUS = 0.5;
const COACH_CAPSULE_LENGTH = 1.1;
const COACH_DISC_RADIUS = 0.62;
const COACH_DISC_HEIGHT = 0.06;

export function createCoachMarker(): MarkerActor {
  const material = new THREE.MeshStandardMaterial({ color: COACH_COLOR, roughness: 0.7 });

  const capsuleGeometry = new THREE.CapsuleGeometry(COACH_CAPSULE_RADIUS, COACH_CAPSULE_LENGTH, 4, 12);
  const capsule = new THREE.Mesh(capsuleGeometry, material);
  capsule.name = 'coach-capsule';
  capsule.position.y = COACH_DISC_HEIGHT + COACH_CAPSULE_LENGTH / 2 + COACH_CAPSULE_RADIUS;

  const discGeometry = new THREE.CylinderGeometry(COACH_DISC_RADIUS, COACH_DISC_RADIUS, COACH_DISC_HEIGHT, 24);
  const disc = new THREE.Mesh(discGeometry, material);
  disc.name = 'coach-disc';
  disc.position.y = COACH_DISC_HEIGHT / 2;

  const root = new THREE.Group();
  root.name = 'coach';
  root.add(disc, capsule);

  return {
    root,
    setPosition(pos) {
      const world = rinkToWorld(pos);
      root.position.set(world.x, world.y, world.z);
    },
    dispose() {
      capsuleGeometry.dispose();
      discGeometry.dispose();
      material.dispose();
    },
  };
}

// ----------------------------------------------------------------------------
// Puck — a flat cylinder. Board3D.tsx positions it every frame from
// `frame.puck`'s own (x, y) when a puck action has fired, or from the
// designated initial carrier's blade position before then (`frame.puck` is
// null until the drill's first puck action - the same gap
// `src/canvas/PlayerRenderer.ts`'s `showInitialPuck` covers for the flat 2D
// view). Either way, this module only ever receives a resolved rink point.
// ----------------------------------------------------------------------------

const PUCK_RADIUS = 0.114;
const PUCK_HEIGHT = 0.03;
const PUCK_COLOR = '#111418';

export function createPuck(): MarkerActor {
  const geometry = new THREE.CylinderGeometry(PUCK_RADIUS, PUCK_RADIUS, PUCK_HEIGHT, 24);
  const material = new THREE.MeshStandardMaterial({ color: PUCK_COLOR, roughness: 0.5 });
  const root = new THREE.Mesh(geometry, material);
  root.name = 'puck';

  return {
    root,
    setPosition(pos) {
      const world = rinkToWorld(pos);
      root.position.set(world.x, world.y + PUCK_HEIGHT / 2, world.z);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
