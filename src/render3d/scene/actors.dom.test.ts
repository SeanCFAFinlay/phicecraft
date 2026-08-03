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

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RINK } from '@/core/constants';
import type { PlaybackPlayerFrame } from '@/core/types';
import { rinkToWorld, headingToYaw } from '../worldMap';
import { createActor, createCoachMarker, createPuck, REFERENCE_SKATE_SPEED } from './actors';

const CLIP_DURATION = 1;
const CENTER_ICE = { x: RINK.centerX, y: RINK.centerY };

/**
 * A hand-built stand-in for a parsed GLTF: a "Rig" node whose rotation.y the
 * clip ramps linearly from 0 to 1 radian over `CLIP_DURATION` seconds - just
 * enough to observe where in the clip the mixer has landed - plus a "Body"
 * mesh carrying the four material names the shipped GLBs use.
 */
function buildFakeGltf(clipName: string): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } {
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

  const track = new THREE.NumberKeyframeTrack('Rig.rotation[y]', [0, CLIP_DURATION], [0, 1]);
  const clip = new THREE.AnimationClip(clipName, CLIP_DURATION, [track]);

  return { scene, animations: [clip] };
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
    });

    actor.update(CENTER_ICE, playerFrame({ speed: REFERENCE_SKATE_SPEED }), CLIP_DURATION * 0.5);

    expect(rigYaw(actor.root)).toBeCloseTo(0.5, 5);
  });

  it('clamps timeScale to 2.5x above the reference speed', () => {
    const actor = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#e63946',
      accent: '#ffffff',
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
    });
    const actorB = createActor(buildFakeGltf('skate'), {
      kind: 'skater',
      jersey: '#2f80ed',
      accent: '#ffffff',
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

describe('createCoachMarker', () => {
  it('builds a capsule + disc marker positioned via rinkToWorld', () => {
    const marker = createCoachMarker();
    const pos = { x: RINK.centerX + 10, y: RINK.centerY + 5 };

    marker.setPosition(pos);

    const world = rinkToWorld(pos);
    expect(marker.root.position.x).toBeCloseTo(world.x, 10);
    expect(marker.root.position.z).toBeCloseTo(world.z, 10);
    expect(marker.root.getObjectByName('coach-capsule')).toBeInstanceOf(THREE.Mesh);
    expect(marker.root.getObjectByName('coach-disc')).toBeInstanceOf(THREE.Mesh);
  });
});

describe('createPuck', () => {
  it('builds a small dark cylinder positioned via rinkToWorld', () => {
    const puck = createPuck();

    puck.setPosition(CENTER_ICE);

    const world = rinkToWorld(CENTER_ICE);
    expect(puck.root.position.x).toBeCloseTo(world.x, 10);
    expect(puck.root.position.z).toBeCloseTo(world.z, 10);
    expect((puck.root as THREE.Mesh).geometry).toBeInstanceOf(THREE.CylinderGeometry);
  });
});
