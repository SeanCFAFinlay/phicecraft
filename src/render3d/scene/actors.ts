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
import type { RenderQuality } from '@/render/quality';
import { clamp } from '@/utils/geometry';
import { headingToYaw, rinkToWorld } from '../worldMap';
import { tintActorMaterials } from './tintMaterials';
import { CLIP_FADE_SECONDS, isMovementClip, selectClipName } from './clipSelector';
import { createNumberSprite } from './numberSprite';

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
 * Whether a progress delta reads as a loop wrap/jump rather than a real
 * scrub - the same test `resolveMixerDelta` uses to zero out its returned
 * delta, exposed separately so Board3D.tsx can tell `Actor.update` "this
 * tick is a wrap" even though the resolved dt (correctly) comes out as a
 * plain 0, indistinguishable on its own from a genuinely paused (real dt-0)
 * tick. Actors need that distinction: a pause mid-crossfade must hold the
 * blend, but a wrap must snap it - see `Actor.update`'s `wrapped` param.
 */
export function isProgressWrap(progress: number, lastProgress: number): boolean {
  return Math.abs(progress - lastProgress) > PROGRESS_WRAP_THRESHOLD;
}

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
 * by `isProgressWrap` and reported as dt = 0 (a no-op tick) instead.
 */
export function resolveMixerDelta(progress: number, lastProgress: number, durationSeconds: number): number {
  if (isProgressWrap(progress, lastProgress)) return 0;
  return (progress - lastProgress) * durationSeconds;
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
  /** Jersey number drawn on the over-the-head billboard - see `createNumberSprite`. */
  number: string;
  /** Texture resolution for the number billboard - see `createNumberSprite`'s own quality-tier doc comment. */
  quality: RenderQuality;
}

export interface Actor {
  root: THREE.Object3D;
  /**
   * `wrapped` defaults to false so every pre-existing call site (and every
   * pre-existing test) that only ever knew about `dt` keeps compiling and
   * behaving identically - see `isProgressWrap`'s doc comment for why a
   * separate boolean is needed alongside `dt` at all.
   */
  update(pos: Point, frame: PlaybackPlayerFrame | undefined, dt: number, wrapped?: boolean): void;
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

/** One named clip's live `THREE.AnimationAction`, plus its clip (for `.duration`), lazily created per actor. */
interface ClipEntry {
  name: string;
  clip: THREE.AnimationClip;
  action: THREE.AnimationAction;
}

/**
 * One skater or goalie: an already-cloned GLTF scene graph (Board3D.tsx does
 * the `SkeletonUtils.clone()` before calling this), tinted to this actor's
 * own jersey/accent, and advanced every frame by `update`.
 *
 * Clip selection/cross-fading: every named clip this actor has ever needed
 * gets its own `THREE.AnimationAction`, created once and left `.play()`-ing
 * forever - only its `weight` (baseline influence) and `enabled` flag turn
 * it on or off. Switching clips is therefore never "stop one, start
 * another"; it is `THREE.AnimationAction.crossFadeTo`, which ramps the
 * outgoing action's weight 1->0 and the incoming one's 0->1 using the
 * mixer's OWN accumulated time - i.e. driven by exactly the same
 * `dt` this module already receives from `resolveMixerDelta` (progress
 * derived, never wall-clock), with no extra timer of this module's own.
 * That is also why a paused timeline (dt = 0) correctly holds a crossfade
 * mid-blend rather than snapping or continuing it - three.js has nothing
 * new to advance.
 */
export function createActor(gltf: ParsedActorModel, opts: CreateActorOptions): Actor {
  const root = gltf.scene;
  const tintedMaterials = tintActorMaterials(root, {
    jersey: opts.jersey,
    accent: opts.accent,
    pants: PANTS_COLOR,
  });

  // Reuses the SAME jersey colour string just tinted onto the model above -
  // not a separate palette lookup - so a jersey recolour can never leave the
  // chip and the model out of sync (see numberSprite.ts's own header).
  const numberSprite = createNumberSprite(opts.number, { jersey: opts.jersey }, opts.quality);
  root.add(numberSprite.sprite);

  const mixer = new THREE.AnimationMixer(root);
  const availableClipNames = new Set(gltf.animations.map(c => c.name));
  const entriesByName = new Map<string, ClipEntry>();

  /** Creates (once) and plays the action for `name`, or returns the existing one. `undefined` only if this model has no clips at all. */
  function getOrCreateEntry(name: string): ClipEntry | undefined {
    const existing = entriesByName.get(name);
    if (existing) return existing;
    const clip = findClip(gltf.animations, name);
    if (!clip) return undefined;
    const action = mixer.clipAction(clip);
    action.play();
    // Silent until this entry is explicitly activated (below) - a freshly
    // authored action must never contribute before it is chosen.
    action.weight = 0;
    const entry: ClipEntry = { name, clip, action };
    entriesByName.set(name, entry);
    return entry;
  }

  /** Makes `entry` a full (weight 1) contributor - the crossfade/snap target, or the very first clip at creation. */
  function activate(entry: ClipEntry): void {
    entry.action.enabled = true;
    entry.action.weight = 1;
  }

  /** Wrap/jump: cancel any in-flight fade and land on exactly one clip, no lingering blend (design requirement 2). */
  function snapTo(targetName: string): void {
    for (const entry of entriesByName.values()) {
      entry.action.stopFading();
      const isTarget = entry.name === targetName;
      entry.action.enabled = isTarget;
      entry.action.weight = isTarget ? 1 : 0;
    }
  }

  /** This entry's speed rule (design requirement 3): movement clips speed-scale + freeze; everything else plays at a flat 1x. */
  function applyClipRules(entry: ClipEntry, frame: PlaybackPlayerFrame | undefined): void {
    if (opts.kind === 'goalie' || !isMovementClip(entry.name)) {
      entry.action.timeScale = 1;
      return;
    }
    const speed = frame?.speed ?? 0;
    if (speed < SKATE_FREEZE_SPEED) {
      entry.action.timeScale = 0;
      entry.action.time = entry.clip.duration * SKATE_FROZEN_POSE_FRACTION;
    } else {
      entry.action.timeScale = skateTimeScale(speed);
    }
  }

  let currentClipName = selectClipName(opts.kind, undefined, availableClipNames);
  const initialEntry = getOrCreateEntry(currentClipName);
  if (initialEntry) activate(initialEntry);

  return {
    root,
    update(pos, frame, dt, wrapped = false) {
      const world = rinkToWorld(pos);
      root.position.set(world.x, world.y, world.z);
      root.rotation.y = headingToYaw(frame?.heading ?? 0);

      const nextClipName = selectClipName(opts.kind, frame, availableClipNames);
      const nextEntry = getOrCreateEntry(nextClipName);
      if (!nextEntry) return; // No clips on this model at all - position/rotation only, same as before this change.

      if (wrapped) {
        snapTo(nextClipName);
      } else if (nextClipName !== currentClipName) {
        const currentEntry = entriesByName.get(currentClipName);
        activate(nextEntry);
        currentEntry?.action.crossFadeTo(nextEntry.action, CLIP_FADE_SECONDS, false);
      }
      currentClipName = nextClipName;

      for (const entry of entriesByName.values()) applyClipRules(entry, frame);
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
      // The number sprite's canvas/texture/material are this actor's own -
      // never shared - so they are always safe (and required) to dispose here.
      numberSprite.dispose();
    },
  };
}

// ----------------------------------------------------------------------------
// Coaches — no GLB. A plain capsule body on a disc base, in a flat neutral
// grey per the brief - NOT a match for the 2D coach token, which is a
// detailed bearded-man illustration with its own jacket/skin/beard/toque
// palette (`src/canvas/CoachRenderer.ts`); this presentation has no GLB coach
// model to render instead, and a plain marker was the brief-mandated
// placeholder rather than an attempt to mirror the 2D token's colourway.
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
