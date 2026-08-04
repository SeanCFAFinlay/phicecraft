// ============================================================================
// ACTORS — animated skater/goalie unit tests
//
// Exercises `createActor` against a hand-built, minimal GLTF-shaped fixture
// (a Group with one rig node, one mesh carrying the four named
// MeshStandardMaterials the shipped GLBs use, and a single named
// AnimationClip) - never the real GLTFLoader, which needs a network fetch
// and a real binary decoder. This mirrors `buildArena.dom.test.ts`'s
// approach to unit-testing three.js scene assembly without a renderer.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RINK } from '@/core/constants';
import type { PlaybackPlayerFrame } from '@/core/types';
import { rinkToWorld, headingToYaw } from '../worldMap';
import {
  createActor,
  createCoachMarker,
  createPuck,
  isProgressWrap,
  resolveMixerDelta,
  REFERENCE_SKATE_SPEED,
} from './actors';
import { CLIP_FADE_SECONDS } from './clipSelector';

const CLIP_DURATION = 1;
const CENTER_ICE = { x: RINK.centerX, y: RINK.centerY };

/**
 * A hand-built stand-in for a parsed GLTF: a "Rig" node whose rotation.y each
 * clip ramps linearly from 0 to its own `endRotationY` over `CLIP_DURATION`
 * seconds - just enough to observe where in the clip (and, with more than
 * one clip active, how BLENDED between clips) the mixer has landed - plus a
 * "Body" mesh carrying the four material names the shipped GLBs use.
 */
function buildFakeGltfMulti(
  clips: { name: string; endRotationY: number }[]
): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } {
  const scene = new THREE.Group();
  scene.name = 'Root';

  const rig = new THREE.Object3D();
  rig.name = 'Rig';
  scene.add(rig);

  const materials = ['jersey', 'accent', 'pants', 'skin'].map(name => {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    material.name = name;
    return material;
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);
  mesh.name = 'Body';
  scene.add(mesh);

  const animations = clips.map(({ name, endRotationY }) => {
    const track = new THREE.NumberKeyframeTrack('Rig.rotation[y]', [0, CLIP_DURATION], [0, endRotationY]);
    return new THREE.AnimationClip(name, CLIP_DURATION, [track]);
  });

  return { scene, animations };
}

/**
 * Today's/existing single-clip fixture - kept as its own name (rather than
 * inlining `buildFakeGltfMulti([{ name: clipName, endRotationY: 1 }])`
 * everywhere) purely so every pre-existing test below reads unchanged.
 */
function buildFakeGltf(clipName: string): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } {
  return buildFakeGltfMulti([{ name: clipName, endRotationY: 1 }]);
}

/**
 * A stand-in for a FUTURE, fully-authored model: a canonical `stride`
 * movement loop (end 2 rad) and a `pass` one-shot-in-the-sim's-own-timing
 * clip (end -4 rad, deliberately a different sign and magnitude so a
 * mid-fade blend of the two is never ambiguous with either clip played
 * alone) - no legacy `skate` name, matching what an author would actually
 * ship once `stride` exists (docs/v2/AUTHORING_CLIPS.md's `stride` always
 * shadows `skate` in the fallback chain, so a fixture carrying both would
 * never be able to select `skate` at all).
 */
function buildFutureGltf(): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } {
  return buildFakeGltfMulti([
    { name: 'stride', endRotationY: 2 },
    { name: 'pass', endRotationY: -4 },
  ]);
}

function playerFrame(overrides: Partial<PlaybackPlayerFrame>): PlaybackPlayerFrame {
  return {
    id: 'p1',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    heading: 0,
    angularVelocity: 0,
    speed: 0,
    routeProgress: 0,
    stridePhase: 0,
    action: 'stride',
    bladePosition: { x: 0, y: 0 },
    ...overrides,
  };
}

function rigYaw(root: THREE.Object3D): number {
  const rig = root.getObjectByName('Rig');
  if (!rig) throw new Error('expected a "Rig" node under the actor root');
  return rig.rotation.y;
}

describe('createActor - position and yaw', () => {
  it('places the root at rinkToWorld(pos) and yaws it to headingToYaw(frame.heading)', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });
    const pos = { x: RINK.centerX + 50, y: RINK.centerY - 20 };

    actor.update(pos, playerFrame({ heading: 0.4, speed: 60 }), 0);

    const world = rinkToWorld(pos);
    expect(actor.root.position.x).toBeCloseTo(world.x, 10);
    expect(actor.root.position.y).toBeCloseTo(world.y, 10);
    expect(actor.root.position.z).toBeCloseTo(world.z, 10);
    expect(actor.root.rotation.y).toBeCloseTo(headingToYaw(0.4), 10);
  });

  it('defaults heading to 0 (yaw = PI/2) when the frame is undefined', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    actor.update(CENTER_ICE, undefined, 0);

    expect(actor.root.rotation.y).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe('createActor - skater clip timeScale', () => {
  it('plays at 1x at the reference speed', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    actor.update(CENTER_ICE, playerFrame({ speed: REFERENCE_SKATE_SPEED }), CLIP_DURATION * 0.5);

    expect(rigYaw(actor.root)).toBeCloseTo(0.5, 5);
  });

  it('clamps timeScale to 2.5x above the reference speed', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    // 10x the reference speed would ask for timeScale 10 - clamped to 2.5.
    // 2.5x over 0.2s of a 1s clip lands the rig exactly halfway (0.5 rad).
    actor.update(CENTER_ICE, playerFrame({ speed: REFERENCE_SKATE_SPEED * 10 }), CLIP_DURATION * 0.2);

    expect(rigYaw(actor.root)).toBeCloseTo(0.5, 5);
  });

  it('clamps timeScale to 0.2x at a slow (but not frozen) speed', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    // speed 5 is above the freeze floor (4) but far under the reference
    // speed - clamped up to 0.2x. 0.2x over 2.5s of a 1s clip lands halfway.
    actor.update(CENTER_ICE, playerFrame({ speed: 5 }), CLIP_DURATION * 2.5);

    expect(rigYaw(actor.root)).toBeCloseTo(0.5, 5);
  });

  it('freezes the pose at 15% of the clip when speed drops under 4', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    actor.update(CENTER_ICE, playerFrame({ speed: 3.9 }), 0);
    expect(rigYaw(actor.root)).toBeCloseTo(0.15, 6);

    // A large dt at the same sub-threshold speed must not advance the pose.
    actor.update(CENTER_ICE, playerFrame({ speed: 3.9 }), 10);
    expect(rigYaw(actor.root)).toBeCloseTo(0.15, 6);
  });

  it('treats a missing frame as stopped (frozen at 15%)', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    actor.update(CENTER_ICE, undefined, 1);

    expect(rigYaw(actor.root)).toBeCloseTo(0.15, 6);
  });
});

describe('createActor - goalie clip', () => {
  it('always plays goalie_idle at 1x, ignoring speed entirely', () => {
    const actor = createActor(buildFakeGltf('goalie_idle'), {
      kind: 'goalie',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    // Speed 0 would freeze a skater - a goalie must still advance at 1x.
    actor.update(CENTER_ICE, playerFrame({ speed: 0 }), CLIP_DURATION * 0.5);

    expect(rigYaw(actor.root)).toBeCloseTo(0.5, 5);
  });
});

describe('createActor - material tinting', () => {
  it('clones jersey materials so two actors never share an instance', () => {
    const actorA = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });
    const actorB = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#2f80ed',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    const meshA = actorA.root.getObjectByName('Body') as THREE.Mesh;
    const meshB = actorB.root.getObjectByName('Body') as THREE.Mesh;
    const jerseyA = (meshA.material as THREE.MeshStandardMaterial[])[0];
    const jerseyB = (meshB.material as THREE.MeshStandardMaterial[])[0];

    expect(jerseyA).not.toBe(jerseyB);
    expect(jerseyA.color.getHexString()).toBe('e63946');
    expect(jerseyB.color.getHexString()).toBe('2f80ed');
  });
});

describe('createActor - number sprite', () => {
  it('attaches a THREE.Sprite named "number-sprite" to the actor root, over the head', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '27',
      quality: 'high',
    });

    const sprite = actor.root.getObjectByName('number-sprite');
    expect(sprite).toBeInstanceOf(THREE.Sprite);
    expect(sprite?.position.y).toBeCloseTo(2.05, 5);
  });

  it('gives two actors distinct number-sprite instances, never sharing a texture', () => {
    const actorA = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });
    const actorB = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#2f80ed',
      accent: '#ffffff',
      number: '27',
      quality: 'high',
    });

    const spriteA = actorA.root.getObjectByName('number-sprite') as THREE.Sprite;
    const spriteB = actorB.root.getObjectByName('number-sprite') as THREE.Sprite;
    expect(spriteA).not.toBe(spriteB);
    expect(spriteA.material).not.toBe(spriteB.material);
    expect((spriteA.material as THREE.SpriteMaterial).map).not.toBe(
      (spriteB.material as THREE.SpriteMaterial).map
    );
  });
});

describe('createActor - dispose', () => {
  it('disposes the per-actor cloned tint materials (jersey/accent/pants) but leaves the shared, untinted one alone', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    const mesh = actor.root.getObjectByName('Body') as THREE.Mesh;
    // Fixture order is ['jersey', 'accent', 'pants', 'skin'] - the first
    // three are per-actor clones tintActorMaterials made; 'skin' has no
    // palette entry and is still the original shared instance.
    const [jersey, accent, pants, skin] = mesh.material as THREE.MeshStandardMaterial[];
    const disposeSpies = [jersey, accent, pants, skin].map(material => vi.spyOn(material, 'dispose'));
    const geometryDisposeSpy = vi.spyOn(mesh.geometry, 'dispose');

    actor.dispose();

    expect(disposeSpies[0]).toHaveBeenCalledTimes(1); // jersey clone - this actor's own
    expect(disposeSpies[1]).toHaveBeenCalledTimes(1); // accent clone - this actor's own
    expect(disposeSpies[2]).toHaveBeenCalledTimes(1); // pants clone - this actor's own
    expect(disposeSpies[3]).not.toHaveBeenCalled(); // skin - shared, never cloned, must survive
    // Geometry is shared with the module-scope cached GLTF - must never be
    // disposed by a single actor.
    expect(geometryDisposeSpy).not.toHaveBeenCalled();
  });

  it('disposes the number sprite\'s own texture and material', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    const sprite = actor.root.getObjectByName('number-sprite') as THREE.Sprite;
    const material = sprite.material as THREE.SpriteMaterial;
    const texture = material.map as THREE.CanvasTexture;
    const textureDisposeSpy = vi.spyOn(texture, 'dispose');
    const materialDisposeSpy = vi.spyOn(material, 'dispose');

    actor.dispose();

    expect(textureDisposeSpy).toHaveBeenCalledTimes(1);
    expect(materialDisposeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('resolveMixerDelta', () => {
  it('returns the signed progress delta scaled by duration for a normal (forward or backward) scrub', () => {
    expect(resolveMixerDelta(0.5, 0.3, 10)).toBeCloseTo(2, 10);
    expect(resolveMixerDelta(0.3, 0.5, 10)).toBeCloseTo(-2, 10);
  });

  it('treats a large jump (loop wrap) as a zero-dt tick instead of a huge delta', () => {
    expect(resolveMixerDelta(0.02, 0.98, 10)).toBe(0);
    expect(resolveMixerDelta(0.98, 0.02, 10)).toBe(0);
  });
});

describe('isProgressWrap', () => {
  it('is false for a normal (forward or backward) scrub delta', () => {
    expect(isProgressWrap(0.5, 0.3)).toBe(false);
    expect(isProgressWrap(0.3, 0.5)).toBe(false);
  });

  it('is true for exactly the jumps resolveMixerDelta zeroes out - the two must never disagree', () => {
    expect(isProgressWrap(0.02, 0.98)).toBe(true);
    expect(isProgressWrap(0.98, 0.02)).toBe(true);
  });
});

describe('createActor - reverse scrub (negative dt) through the real AnimationMixer', () => {
  it('worked example: a negative dt plays the stride backward (rig rotation decreases)', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    // Scrub forward to the clip's midpoint first (timeScale 1x at the
    // reference speed, matching the existing "plays at 1x" test above).
    actor.update(CENTER_ICE, playerFrame({ speed: REFERENCE_SKATE_SPEED }), CLIP_DURATION * 0.5);
    expect(rigYaw(actor.root)).toBeCloseTo(0.5, 5);

    // A backward scrub of 0.2s at the same speed must move the rig BACK by
    // 0.2 rad, not freeze it at 0.5 - the exact bug this finding fixes.
    actor.update(CENTER_ICE, playerFrame({ speed: REFERENCE_SKATE_SPEED }), -CLIP_DURATION * 0.2);
    expect(rigYaw(actor.root)).toBeCloseTo(0.3, 5);
  });

  it('wrap-guard case: a dt resolved from a loop-wrap progress jump leaves the pose exactly where it was', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    actor.update(CENTER_ICE, playerFrame({ speed: REFERENCE_SKATE_SPEED }), CLIP_DURATION * 0.5);
    expect(rigYaw(actor.root)).toBeCloseTo(0.5, 5);

    // Progress jumping from 0.98 back to 0.02 (a loop wrap, not a real
    // scrub) resolves to dt = 0 - the pose must not move at all.
    const wrapDt = resolveMixerDelta(0.02, 0.98, CLIP_DURATION);
    actor.update(CENTER_ICE, playerFrame({ speed: REFERENCE_SKATE_SPEED }), wrapDt);
    expect(rigYaw(actor.root)).toBeCloseTo(0.5, 5);
  });
});

describe("createActor - fallback chain end-to-end (zero drift with today's single-clip models)", () => {
  it.each(['idle', 'stride', 'glide', 'turn', 'stop', 'receive', 'recover', 'pass', 'shot'] as const)(
    "resolves frame.action %s to the model's only clip ('skate') and speed-scales it identically to the default case",
    action => {
      const actor = createActor(buildFakeGltf('skate'), {
        kind: 'skater',
        jersey: '#e63946',
        accent: '#ffffff',
        number: '9',
        quality: 'high',
      });

      // Same assertion as "plays at 1x at the reference speed" above, just
      // with every other SkaterAction substituted in - with only 'skate'
      // shipped, the fallback chain (action -> 'stride' -> 'skate') always
      // bottoms out on 'skate', so every action must look identical.
      actor.update(CENTER_ICE, playerFrame({ action, speed: REFERENCE_SKATE_SPEED }), CLIP_DURATION * 0.5);

      expect(rigYaw(actor.root)).toBeCloseTo(0.5, 5);
    }
  );
});

describe('createActor - clip cross-fade on action change', () => {
  it('worked example: an action change selects the new clip and cross-fades, blending both rigs at the hand-computed weight', () => {
    const actor = createActor(buildFutureGltf(), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    // Tick 1: frame.action = 'stride' matches the actor's initial guess (an
    // undefined-frame skater defaults to 'idle', whose chain lands on
    // 'stride' since it exists on this model) - no cross-fade yet, just
    // advances 'stride' 0.3s into its 0->2rad ramp.
    actor.update(CENTER_ICE, playerFrame({ action: 'stride', speed: REFERENCE_SKATE_SPEED }), CLIP_DURATION * 0.3);
    expect(rigYaw(actor.root)).toBeCloseTo(0.6, 5); // 0.3/1 * 2

    // Tick 2: action changes to 'pass' ('pass' exists on this model, so it
    // is selected verbatim, no fallback) - this is the tick the cross-fade
    // begins on, driven by the SAME dt as everything else this tick (0.05s
    // of a 0.15s fade => 1/3 of the way through).
    //
    // Hand-computed: fraction f = 0.05 / CLIP_FADE_SECONDS = 1/3.
    //   stride (fading OUT, still speed-scaled at 1x): local time 0.3->0.35,
    //     ramp value = 0.35 * 2 = 0.7, weight = 1 - f = 2/3.
    //   pass (fading IN, non-movement, flat 1x): local time 0->0.05,
    //     ramp value = 0.05 * -4 = -0.2, weight = f = 1/3.
    //   blended = (2/3 * 0.7) + (1/3 * -0.2) = 0.4
    actor.update(CENTER_ICE, playerFrame({ action: 'pass', speed: REFERENCE_SKATE_SPEED }), CLIP_FADE_SECONDS / 3);

    expect(rigYaw(actor.root)).toBeCloseTo(0.4, 4);
  });
});

describe('createActor - wrap snaps an in-flight cross-fade', () => {
  it('worked example: a wrap tick cancels the fade and lands on exactly the selected clip, with no residual blend afterwards', () => {
    const actor = createActor(buildFutureGltf(), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    // Establish 'stride' 0.4s into its ramp, then begin a fade to 'pass'
    // (same shape as the cross-fade worked example above).
    actor.update(CENTER_ICE, playerFrame({ action: 'stride', speed: REFERENCE_SKATE_SPEED }), CLIP_DURATION * 0.4);
    expect(rigYaw(actor.root)).toBeCloseTo(0.8, 5); // 0.4 * 2

    actor.update(CENTER_ICE, playerFrame({ action: 'pass', speed: REFERENCE_SKATE_SPEED }), CLIP_FADE_SECONDS / 3);
    // Mid-fade (not itself asserted - the cross-fade test above already
    // proves this shape); the point of this test is what happens next.

    // A wrap tick: Board3D.tsx passes `wrapped = true` whenever
    // `isProgressWrap` fires, always alongside dt = 0 (resolveMixerDelta's
    // own wrap case) - the fade must be cancelled outright, not left to
    // keep ramping across the loop boundary.
    actor.update(CENTER_ICE, playerFrame({ action: 'pass', speed: REFERENCE_SKATE_SPEED }), 0, true);

    // 'pass' is now the ONLY contributor (stride snapped to weight 0 and
    // disabled) - the rig reads pass's own pose exactly (time 0.05 into its
    // 0->-4rad ramp), not some blended leftover of stride's ~0.53rad.
    expect(rigYaw(actor.root)).toBeCloseTo(-0.2, 5); // 0.05 * -4

    // A further normal tick confirms the fade stays cancelled - stride
    // never re-contributes on its own.
    actor.update(CENTER_ICE, playerFrame({ action: 'pass', speed: REFERENCE_SKATE_SPEED }), 0.1);
    expect(rigYaw(actor.root)).toBeCloseTo(-0.6, 5); // 0.15 * -4
  });
});

describe('createActor - movement vs non-movement timeScale rules on future clips', () => {
  it("freezes a movement clip other than 'skate' (stride) below SKATE_FREEZE_SPEED, exactly like skate does", () => {
    const actor = createActor(buildFutureGltf(), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    actor.update(CENTER_ICE, playerFrame({ action: 'stride', speed: 3.9 }), 0);
    expect(rigYaw(actor.root)).toBeCloseTo(0.3, 6); // 0.15 * 2 (SKATE_FROZEN_POSE_FRACTION * stride's end rotation)

    // A large dt at the same sub-threshold speed must not advance the pose.
    actor.update(CENTER_ICE, playerFrame({ action: 'stride', speed: 3.9 }), 10);
    expect(rigYaw(actor.root)).toBeCloseTo(0.3, 6);
  });

  it('plays a non-movement clip (pass) at a flat 1x and never freezes it, even at speed 0', () => {
    const actor = createActor(buildFutureGltf(), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    // Tick 1 (dt=0) just moves 'pass' into the current-clip slot; tick 2's
    // dt (0.4s) comfortably exceeds CLIP_FADE_SECONDS (0.15s) so the fade
    // has fully resolved to 'pass' alone by the time it's asserted.
    //
    // If 'pass' were mistakenly treated as a movement clip, speed 0 would
    // freeze it at 0.15 * -4 = -0.6 regardless of dt; instead, being
    // non-movement, it ignores speed entirely and plays straight through:
    // ramp value = 0.4 * -4 = -1.6.
    actor.update(CENTER_ICE, playerFrame({ action: 'pass', speed: 0 }), 0);
    actor.update(CENTER_ICE, playerFrame({ action: 'pass', speed: 0 }), 0.4);

    expect(rigYaw(actor.root)).toBeCloseTo(-1.6, 4);
  });
});

describe('createActor - scrub-backward during a cross-fade stays deterministic', () => {
  it('worked example: a negative dt mid-fade moves both the blend weights and each clip\'s own pose backward, matching hand-computed values exactly', () => {
    const actor = createActor(buildFutureGltf(), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    actor.update(CENTER_ICE, playerFrame({ action: 'stride', speed: REFERENCE_SKATE_SPEED }), CLIP_DURATION * 0.5);
    expect(rigYaw(actor.root)).toBeCloseTo(1.0, 5); // 0.5 * 2

    // Begin the fade to 'pass', forward 0.06s (f = 0.06/0.15 = 0.4 through the fade).
    //   stride: local time 0.5->0.56, ramp = 1.12, weight = 0.6
    //   pass:   local time 0->0.06,   ramp = -0.24, weight = 0.4
    //   blended = 0.6*1.12 + 0.4*-0.24 = 0.576
    actor.update(CENTER_ICE, playerFrame({ action: 'pass', speed: REFERENCE_SKATE_SPEED }), CLIP_FADE_SECONDS * 0.4);
    expect(rigYaw(actor.root)).toBeCloseTo(0.576, 5);

    // Scrub BACKWARD by 0.03s. Still no new selection change (action stays
    // 'pass'), so this is the SAME in-flight fade continuing with a
    // negative dt - both the weights and each clip's own local time move
    // backward together, driven only by mixer time (never wall clock):
    //   stride: local time 0.56->0.53, ramp = 1.06, weight (f=0.2) = 0.8
    //   pass:   local time 0.06->0.03, ramp = -0.12, weight (f=0.2) = 0.2
    //   blended = 0.8*1.06 + 0.2*-0.12 = 0.824
    actor.update(CENTER_ICE, playerFrame({ action: 'pass', speed: REFERENCE_SKATE_SPEED }), -CLIP_FADE_SECONDS * 0.2);
    expect(rigYaw(actor.root)).toBeCloseTo(0.824, 5);
  });
});

describe('createActor - shadows', () => {
  it('casts shadows on every mesh at high quality', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    const mesh = actor.root.getObjectByName('Body') as THREE.Mesh;
    expect(mesh.castShadow).toBe(true);
  });

  it.each(['medium', 'low'] as const)('does not cast shadows at %s quality', quality => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality,
    });

    const mesh = actor.root.getObjectByName('Body') as THREE.Mesh;
    expect(mesh.castShadow).toBe(false);
  });

  it('never sets castShadow on the number sprite, even at high quality', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'high',
    });

    const sprite = actor.root.getObjectByName('number-sprite') as THREE.Sprite;
    expect(sprite.castShadow).toBe(false);
  });

  it('setShadows flips castShadow on every mesh for a tier change without rebuilding the actor', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
      number: '9',
      quality: 'low',
    });
    const mesh = actor.root.getObjectByName('Body') as THREE.Mesh;
    expect(mesh.castShadow).toBe(false);

    actor.setShadows(true);
    expect(mesh.castShadow).toBe(true);

    actor.setShadows(false);
    expect(mesh.castShadow).toBe(false);
  });
});

describe('createCoachMarker', () => {
  it('builds a capsule + disc marker positioned via rinkToWorld', () => {
    const marker = createCoachMarker('high');
    const pos = { x: RINK.centerX + 10, y: RINK.centerY + 5 };

    marker.setPosition(pos);

    const world = rinkToWorld(pos);
    expect(marker.root.position.x).toBeCloseTo(world.x, 10);
    expect(marker.root.position.z).toBeCloseTo(world.z, 10);
    expect(marker.root.getObjectByName('coach-capsule')).toBeInstanceOf(THREE.Mesh);
    expect(marker.root.getObjectByName('coach-disc')).toBeInstanceOf(THREE.Mesh);
  });

  it('casts shadows only at high quality', () => {
    const highMarker = createCoachMarker('high');
    const capsuleHigh = highMarker.root.getObjectByName('coach-capsule') as THREE.Mesh;
    expect(capsuleHigh.castShadow).toBe(true);

    const lowMarker = createCoachMarker('low');
    const capsuleLow = lowMarker.root.getObjectByName('coach-capsule') as THREE.Mesh;
    expect(capsuleLow.castShadow).toBe(false);
  });
});

describe('createPuck', () => {
  it('builds a small dark cylinder positioned via rinkToWorld', () => {
    const puck = createPuck('high');

    puck.setPosition(CENTER_ICE);

    const world = rinkToWorld(CENTER_ICE);
    expect(puck.root.position.x).toBeCloseTo(world.x, 10);
    expect(puck.root.position.z).toBeCloseTo(world.z, 10);
    expect((puck.root as THREE.Mesh).geometry).toBeInstanceOf(THREE.CylinderGeometry);
  });

  it('casts shadows only at high quality', () => {
    const puckHigh = createPuck('high');
    expect((puckHigh.root as THREE.Mesh).castShadow).toBe(true);

    const puckLow = createPuck('low');
    expect((puckLow.root as THREE.Mesh).castShadow).toBe(false);
  });
});
