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
import { CLIP_FADE_SECONDS, isMovementClip, selectClipName } from './clipSelector';
import { createNumberSprite } from './numberSprite';
import { applyJerseyNumber } from './jerseyNumber';
import type { RenderQuality } from '@/render/quality';

/** Rink-units/second at which the `skate` clip plays at its authored (1x) speed. */
export const REFERENCE_SKATE_SPEED = 120;
/** Below this speed a skater reads as stopped: the stride freezes rather than crawling in slow motion. */
export const SKATE_FREEZE_SPEED = 4;
/** Where in the clip a frozen skater's pose sits - an athletic ready stance, not the clip's dead frame 0. */
export const SKATE_FROZEN_POSE_FRACTION = 0.15;
const SKATE_TIME_SCALE_MIN = 0.2;
/**
 * Simulated frames this far apart (seconds) or further, or running
 * backward, are a seek rather than playback: the clip lands outright
 * instead of blending in from wherever the playhead jumped from.
 */
const CONTINUOUS_FRAME_GAP = 0.25;
/** Above this speed a braking skater holds the deepest point of the stop; below it they rise out of it. */
const STOP_HOLD_SPEED = 40;

/**
 * Where in the `stop` clip a braking skater at `speed` sits. The clip dips
 * into a two-skate side-on stop at its midpoint and rises out of it again;
 * looping it for the whole brake made a long stop bob up and down. Instead
 * a hard stop holds the dip, and the last of the speed bleeds off as the
 * skater straightens up - landing on the same standing pose `idle` starts
 * from.
 */
/** Share of an event's phase spent blending in at the start and out at the end. */
const EVENT_BLEND_PHASE = 0.2;

/**
 * How much of an event clip (pass, shot, save...) shows over the movement
 * pose at `phase`: easing in over the first fifth, fully committed through
 * stick contact at 0.5, easing back out over the last fifth.
 */
export function eventWeight(phase: number): number {
  const edge = Math.min(phase, 1 - phase) / EVENT_BLEND_PHASE;
  const t = clamp(edge, 0, 1);
  return t * t * (3 - 2 * t);
}

export function stopPhase(speed: number): number {
  if (speed >= STOP_HOLD_SPEED) return 0.5;
  return 0.5 + 0.5 * (1 - Math.max(0, speed) / STOP_HOLD_SPEED);
}
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
  number?: string;
  name?: string;
  quality?: RenderQuality;
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
 * Simulation frames use absolute clip sampling, including contact phases;
 * they never integrate a pose from previous renders. The delta-driven
 * crossfade path below remains for callers without simulation timestamps.
 * In that compatibility path, every named clip this actor has ever needed
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
  if (opts.quality === 'high') {
    root.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
      }
    });
  }

  const tintedMaterials = tintActorMaterials(root, {
    jersey: opts.jersey,
    accent: opts.accent,
    pants: PANTS_COLOR,
  });

  // The number on the back of the sweater itself, for this player only.
  const jerseyNumber = applyJerseyNumber(
    root,
    opts.number,
    { jersey: opts.jersey, accent: opts.accent },
    opts.quality
  );

  const numberSprite = opts.number
    ? createNumberSprite(opts.number, { jersey: opts.jersey }, opts.quality, opts.name)
    : null;
  if (numberSprite) {
    root.add(numberSprite.sprite);
  }

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

  /** The pose under a pass or a save: skating if the player is moving, set if not. */
  function baseClipName(frame: PlaybackPlayerFrame): string {
    if (opts.kind === 'goalie') return selectClipName('goalie', undefined, availableClipNames);
    const action = frame.speed < SKATE_FREEZE_SPEED ? 'idle' : 'stride';
    return selectClipName('skater', { ...frame, action }, availableClipNames);
  }

  let currentClipName = selectClipName(opts.kind, undefined, availableClipNames);
  // A clip change on simulated frames blends out of the outgoing clip over
  // `CLIP_FADE_SECONDS` of simulation time. Kept as data, not as a running
  // three.js fade, so the blend is a function of the playhead: pausing holds
  // it, and any seek simply drops it.
  let simFade: { from: ClipEntry; fromTime: number; start: number } | null = null;
  let lastSimTime: number | undefined;
  const initialEntry = getOrCreateEntry(currentClipName);
  if (initialEntry) activate(initialEntry);

  return {
    root,
    update(pos, frame, dt, wrapped = false) {
      const world = rinkToWorld(pos);
      root.position.set(world.x, world.y, world.z);
      root.rotation.order = 'YXZ';
      root.rotation.y = headingToYaw(frame?.heading ?? 0);

      // Kinetic banking into turns and forward athletic posture
      if (opts.kind === 'skater' && frame) {
        const speedFactor = Math.min((frame.speed ?? 0) / REFERENCE_SKATE_SPEED, 1.5);
        const bankAngle = clamp(-(frame.angularVelocity ?? 0) * speedFactor * 0.16, -0.32, 0.32);
        root.rotation.z = bankAngle;

        const forwardPitch = (frame.speed ?? 0) > SKATE_FREEZE_SPEED
          ? clamp(((frame.speed ?? 0) / REFERENCE_SKATE_SPEED) * 0.08, 0, 0.12)
          : 0;
        root.rotation.x = forwardPitch;
      } else {
        root.rotation.z = 0;
        root.rotation.x = 0;
      }

      const nextClipName = selectClipName(opts.kind, frame, availableClipNames);
      const nextEntry = getOrCreateEntry(nextClipName);
      if (!nextEntry) return; // No clips on this model at all - position/rotation only, same as before this change.

      // Simulation frames carry absolute time and contact phase. Setting the
      // action time directly makes direct seeks, reverse scrubs and replay
      // identical, including large jumps that the legacy dt guard ignores.
      if (frame?.animationTimeSeconds !== undefined) {
        const t = frame.animationTimeSeconds;
        const movement = isMovementClip(nextClipName);
        // Passes, shots, receptions and saves carry their own phase: they
        // blend from the skater's movement pose by that phase alone (below),
        // so seeking to any instant of one gives the pose playing reaches.
        const eventClip = frame.actionPhase !== undefined && !movement;
        const continuous = !wrapped && lastSimTime !== undefined && t >= lastSimTime && t - lastSimTime < CONTINUOUS_FRAME_GAP;
        if (eventClip) {
          simFade = null;
        } else if (nextClipName !== currentClipName) {
          const outgoing = entriesByName.get(currentClipName);
          simFade = continuous && outgoing ? { from: outgoing, fromTime: outgoing.action.time, start: t } : null;
        } else if (!continuous) {
          simFade = null;
        }
        lastSimTime = t;
        currentClipName = nextClipName;

        const duration = nextEntry.clip.duration;
        const phase = movement
          ? frame.speed < SKATE_FREEZE_SPEED ? SKATE_FROZEN_POSE_FRACTION : frame.stridePhase
          : nextClipName === 'stop' && frame.actionPhase === undefined
            ? stopPhase(frame.speed)
            : frame.actionPhase ?? ((t % duration) / duration);

        const blend = simFade ? clamp((t - simFade.start) / CLIP_FADE_SECONDS, 0, 1) : 1;
        if (blend >= 1) simFade = null;
        snapTo(nextClipName);
        if (simFade) {
          // The outgoing clip keeps moving through the blend instead of freezing.
          const from = simFade.from;
          from.action.enabled = true;
          from.action.weight = 1 - blend;
          from.action.timeScale = 1;
          from.action.time = (simFade.fromTime + (t - simFade.start)) % from.clip.duration;
          nextEntry.action.weight = blend;
        }
        if (eventClip) {
          const base = getOrCreateEntry(baseClipName(frame));
          const weight = eventWeight(frame.actionPhase ?? 0.5);
          if (base && base !== nextEntry && weight < 1) {
            base.action.enabled = true;
            base.action.weight = 1 - weight;
            base.action.timeScale = 1;
            const baseMoving = isMovementClip(base.name);
            const basePhase = baseMoving
              ? frame.speed < SKATE_FREEZE_SPEED ? SKATE_FROZEN_POSE_FRACTION : frame.stridePhase
              : (t % base.clip.duration) / base.clip.duration;
            base.action.time = clamp(basePhase, 0, 1 - 1e-7) * base.clip.duration;
            nextEntry.action.weight = weight;
          }
        }
        nextEntry.action.paused = false;
        nextEntry.action.timeScale = 1;
        nextEntry.action.time = clamp(phase, 0, 1 - 1e-7) * duration;
        mixer.update(0);
        return;
      }

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
      numberSprite?.dispose();
      jerseyNumber.dispose();
      // Only the per-actor tint clones are this actor's own to dispose - the
      // mesh geometries and every untinted named material (skin/white/dark/
      // steel/stick) are shared with the module-scope cached GLTF (and every
      // other actor cloned from it) and must survive this actor's disposal.
      for (const material of tintedMaterials) material.dispose();
    },
  };
}

// ----------------------------------------------------------------------------
// Coaches - no GLB. A simple figure built from primitives: track pants and
// skates, a team jacket with a white collar, a head and a toque, standing on
// a disc base so a coach still reads as a board marker from the overhead
// view. Roughly a skater's height, so the scale of a drill reads correctly
// when a coach stands among the players. The named `coach-capsule` (the
// jacket) and `coach-disc` meshes are the parts the tests and callers rely on.
// ----------------------------------------------------------------------------

const COACH_JACKET_COLOR = '#1e293b';
const COACH_COLLAR_COLOR = '#f8fafc';
const COACH_DISC_COLOR = '#0f172a';
const COACH_PANTS_COLOR = '#111827';
const COACH_SKIN_COLOR = '#d9a184';
const COACH_TOQUE_COLOR = '#0ea5e9';
const COACH_DISC_RADIUS = 0.62;
const COACH_DISC_HEIGHT = 0.06;

export function createCoachMarker(): MarkerActor {
  const materials = {
    jacket: new THREE.MeshStandardMaterial({ color: COACH_JACKET_COLOR, roughness: 0.7 }),
    collar: new THREE.MeshStandardMaterial({ color: COACH_COLLAR_COLOR, roughness: 0.5 }),
    disc: new THREE.MeshStandardMaterial({ color: COACH_DISC_COLOR, roughness: 0.7 }),
    pants: new THREE.MeshStandardMaterial({ color: COACH_PANTS_COLOR, roughness: 0.8 }),
    skin: new THREE.MeshStandardMaterial({ color: COACH_SKIN_COLOR, roughness: 0.6 }),
    toque: new THREE.MeshStandardMaterial({ color: COACH_TOQUE_COLOR, roughness: 0.9 }),
  };
  const geometries: THREE.BufferGeometry[] = [];
  const root = new THREE.Group();
  root.name = 'coach';

  const add = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    rotationZ = 0
  ): THREE.Mesh => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.z = rotationZ;
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };

  const base = COACH_DISC_HEIGHT;
  add('coach-disc', new THREE.CylinderGeometry(COACH_DISC_RADIUS, COACH_DISC_RADIUS, COACH_DISC_HEIGHT, 24), materials.disc, [0, base / 2, 0]);
  for (const side of [-1, 1]) {
    add(`coach-leg-${side < 0 ? 'l' : 'r'}`, new THREE.CapsuleGeometry(0.09, 0.62, 4, 10), materials.pants, [side * 0.12, base + 0.42, 0]);
    add(`coach-skate-${side < 0 ? 'l' : 'r'}`, new THREE.BoxGeometry(0.12, 0.1, 0.3), materials.pants, [side * 0.12, base + 0.06, 0.04]);
    add(`coach-arm-${side < 0 ? 'l' : 'r'}`, new THREE.CapsuleGeometry(0.075, 0.48, 4, 10), materials.jacket, [side * 0.29, base + 1.13, 0], side * 0.12);
  }
  add('coach-capsule', new THREE.CapsuleGeometry(0.24, 0.42, 6, 16), materials.jacket, [0, base + 1.17, 0]);
  add('coach-collar', new THREE.CylinderGeometry(0.13, 0.17, 0.08, 16), materials.collar, [0, base + 1.5, 0]);
  add('coach-head', new THREE.SphereGeometry(0.12, 16, 12), materials.skin, [0, base + 1.66, 0]);
  add('coach-toque', new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), materials.toque, [0, base + 1.69, 0]);

  return {
    root,
    setPosition(pos) {
      const world = rinkToWorld(pos);
      root.position.set(world.x, world.y, world.z);
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
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
  const geometry = new THREE.CylinderGeometry(PUCK_RADIUS, PUCK_RADIUS, PUCK_HEIGHT, 32);
  const material = new THREE.MeshStandardMaterial({
    color: PUCK_COLOR,
    roughness: 0.85,
    metalness: 0.1,
  });
  const root = new THREE.Mesh(geometry, material);
  root.name = 'puck';
  root.castShadow = true;
  root.receiveShadow = true;

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
