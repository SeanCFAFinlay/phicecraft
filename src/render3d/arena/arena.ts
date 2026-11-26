// ============================================================================
// ARENA
//
// Assembles the whole static building around the ice and owns the two things
// that depend on the camera:
//
//   - `update(camera)`, called before every frame: lifts the roof and
//     scoreboard away when the camera is above them (the tabletop views look
//     down through an open roof) and hides any section of the seating bowl
//     that stands between the camera and the ice (low broadcast angles).
//   - `captureEnvironment(renderer, scene)`: renders the finished arena -
//     lights, roof, stands, boards - into a prefiltered environment map, so
//     the ice, glass, helmets and visors reflect THIS building instead of a
//     generic studio.
//
// Lighting follows a real rink: an even wash from overhead sports lights. One
// near-vertical key light casts the short, soft shadows players throw under
// arena lights; a sky/ground hemisphere and the captured environment do the
// rest.
// ============================================================================

import * as THREE from 'three';
import type { RenderQuality } from '@/render/quality';
import { subscribeCentreIceLogo } from '@/render/teamLogo';
import { BOARD_HEIGHT, BOARD_THICKNESS, END_GLASS_HEIGHT, ICE_LENGTH, ICE_WIDTH, LIGHT_GRID_Y, SCOREBOARD_BOTTOM_Y } from './layout';
import { createIceSurface } from './iceSurface';
import { createRinkside } from './rinkside';
import { createBowl, BOWL_BACK } from './bowl';
import { createRoof } from './roof';
import { createGoalNets } from './goalNet';
import { createIceReflection, excludeFromReflection, type IceReflection } from './iceReflection';

/** The colour around and beyond the building. */
export const ARENA_BACKGROUND = 0x05080c;

export interface Arena {
  root: THREE.Group;
  /** Show or hide the parts that would block this camera's view of the ice. */
  update(camera: THREE.Camera): void;
  /** High tier: renders the mirrored view the ice reflects. Call after `update`, before the main render. */
  renderReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  /** Drawing-buffer size, in pixels. */
  setSize(width: number, height: number): void;
  /** Lights the red goal light behind the left or right net (or neither). */
  setGoalLight(side: 'left' | 'right' | null): void;
  /** Bakes the arena into `scene.environment`. Returns its cleanup. */
  captureEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): () => void;
  /** Called when the centre-ice logo changes; the caller re-renders. */
  onLogoChange(listener: () => void): () => void;
  dispose(): void;
}

function buildLights(quality: RenderQuality): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lights';
  const hemisphere = new THREE.HemisphereLight(0xe8f0fa, 0x2a3038, 0.75);
  group.add(hemisphere);

  const key = new THREE.DirectionalLight(0xfffaf2, 1.55);
  key.name = 'key-light';
  key.position.set(ICE_LENGTH * 0.08, 40, ICE_WIDTH * 0.12);
  key.target.position.set(0, 0, 0);
  key.castShadow = quality === 'high';
  if (key.castShadow) {
    key.shadow.mapSize.set(4096, 2048);
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    const cam = key.shadow.camera;
    cam.left = -ICE_LENGTH * 0.56;
    cam.right = ICE_LENGTH * 0.56;
    cam.top = ICE_WIDTH * 0.62;
    cam.bottom = -ICE_WIDTH * 0.62;
    cam.near = 20;
    cam.far = 60;
  }
  group.add(key, key.target);

  // A second, shadowless bank from the opposite diagonal: arenas are lit from
  // many fixtures, so nothing has a fully dark side.
  const fill = new THREE.DirectionalLight(0xe6efff, 0.45);
  fill.name = 'fill-light';
  fill.position.set(-ICE_LENGTH * 0.2, 30, -ICE_WIDTH * 0.5);
  fill.target.position.set(0, 0, 0);
  group.add(fill, fill.target);
  return group;
}

function buildFloor(): THREE.Mesh {
  const size = (Math.max(ICE_LENGTH, ICE_WIDTH) / 2 + BOWL_BACK) * 2 + 10;
  const geometry = new THREE.PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.95 }));
  mesh.name = 'arena-floor';
  mesh.position.y = -0.02;
  mesh.receiveShadow = true;
  return mesh;
}

export function createArena(quality: RenderQuality): Arena {
  const root = new THREE.Group();
  root.name = 'arena';

  const floor = buildFloor();
  const ice = createIceSurface(quality);
  const rinkside = createRinkside(quality);
  const bowl = createBowl(quality);
  const roof = createRoof(quality);
  const nets = createGoalNets(quality);
  const lights = buildLights(quality);

  root.add(floor, ice.mesh, rinkside.boards, rinkside.glass, rinkside.benches, nets.root, bowl.root, roof.roof, roof.scoreboard, lights);

  // Goal lights: a red lamp on top of the end glass behind each net.
  const goalLights = new THREE.Group();
  goalLights.name = 'goal-lights';
  const lampHousing = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.5, metalness: 0.4 });
  const lensOff = new THREE.MeshStandardMaterial({ color: 0x5a0d12, roughness: 0.25, emissive: 0x000000 });
  const lensOn = new THREE.MeshStandardMaterial({ color: 0xff2a2a, roughness: 0.25, emissive: 0xff1a1a, emissiveIntensity: 9 });
  const housingGeometry = new THREE.CylinderGeometry(0.16, 0.2, 0.14, 20);
  const lensGeometry = new THREE.SphereGeometry(0.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const lenses: Record<'left' | 'right', THREE.Mesh> = {} as Record<'left' | 'right', THREE.Mesh>;
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? -1 : 1;
    const lamp = new THREE.Group();
    lamp.position.set(sign * (ICE_LENGTH / 2 + BOARD_THICKNESS * 0.55), BOARD_HEIGHT + END_GLASS_HEIGHT, 0);
    const housing = new THREE.Mesh(housingGeometry, lampHousing);
    housing.position.y = 0.07;
    const lens = new THREE.Mesh(lensGeometry, lensOff);
    lens.position.y = 0.14;
    lenses[side] = lens;
    lamp.add(housing, lens);
    goalLights.add(lamp);
  }
  root.add(goalLights);
  let litSide: 'left' | 'right' | null = null;

  let reflection: IceReflection | null = null;
  /** Turned on after the environment capture, whose cube camera only sees layer 0. */
  const enableReflection = () => {
    if (quality !== 'high' || reflection) return;
    excludeFromReflection(ice.mesh);
    excludeFromReflection(bowl.root);
    reflection = createIceReflection(ice.mesh, ice.mesh.material as THREE.MeshPhysicalMaterial);
  };

  // Nothing here moves: compute every matrix once.
  root.updateMatrixWorld(true);
  root.traverse(node => {
    if (node !== lights && !(node instanceof THREE.Light)) node.matrixAutoUpdate = false;
  });

  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const cameraPos = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const forward = new THREE.Vector3();

  /** Points on the ice whose view must stay clear: where the camera looks, and the rink edge nearest it. */
  const probes = (camera: THREE.Camera): THREE.Vector3[] => {
    camera.getWorldDirection(forward);
    const points: THREE.Vector3[] = [];
    if (forward.y < -0.01) {
      const t = -cameraPos.y / forward.y;
      const look = cameraPos.clone().addScaledVector(forward, t);
      look.x = THREE.MathUtils.clamp(look.x, -ICE_LENGTH / 2, ICE_LENGTH / 2);
      look.z = THREE.MathUtils.clamp(look.z, -ICE_WIDTH / 2, ICE_WIDTH / 2);
      points.push(look);
    } else {
      points.push(new THREE.Vector3(0, 0, 0));
    }
    const hl = ICE_LENGTH / 2;
    const hw = ICE_WIDTH / 2;
    const edge = new THREE.Vector3(THREE.MathUtils.clamp(cameraPos.x, -hl, hl), 1.2, THREE.MathUtils.clamp(cameraPos.z, -hw, hw));
    points.push(edge);
    // The two ends of the nearest long side, so a broadcast angle keeps both corners.
    points.push(new THREE.Vector3(-hl * 0.7, 0.5, edge.z), new THREE.Vector3(hl * 0.7, 0.5, edge.z));
    return points;
  };

  return {
    root,
    update(camera) {
      camera.getWorldPosition(cameraPos);
      roof.roof.visible = cameraPos.y < LIGHT_GRID_Y - 1;
      roof.scoreboard.visible = cameraPos.y < SCOREBOARD_BOTTOM_Y - 0.5;
      const targets = probes(camera);
      for (const section of bowl.sections) {
        let blocks = false;
        for (const target of targets) {
          probe.copy(target).sub(cameraPos);
          const length = probe.length();
          ray.set(cameraPos, probe.normalize());
          if (ray.intersectBox(section.box, hit) && hit.distanceTo(cameraPos) < length) {
            // Inside the box is not "in the way" unless the stands rise above the line of sight there.
            blocks = true;
            break;
          }
        }
        section.group.visible = !blocks;
      }
    },
    renderReflection(renderer, scene, camera) {
      reflection?.update(renderer, scene, camera);
    },
    setSize(width, height) {
      reflection?.setSize(width, height);
    },
    setGoalLight(side) {
      if (side === litSide) return;
      litSide = side;
      lenses.left.material = side === 'left' ? lensOn : lensOff;
      lenses.right.material = side === 'right' ? lensOn : lensOff;
    },
    captureEnvironment(renderer, scene) {
      if (quality === 'low') return () => {};
      let target: THREE.WebGLRenderTarget | null = null;
      // Capture from just above centre ice with the whole building in place.
      const saved = [roof.roof.visible, roof.scoreboard.visible, ...bowl.sections.map(s => s.group.visible)];
      roof.roof.visible = true;
      roof.scoreboard.visible = true;
      for (const s of bowl.sections) s.group.visible = true;
      // Individual seats are far too small to matter in a blurred reflection
      // and are most of the triangles: leave them out of the six-sided capture.
      const seats: THREE.Object3D[] = [];
      bowl.root.traverse(node => {
        if (node.name === 'seats' && node.visible) seats.push(node);
      });
      for (const node of seats) node.visible = false;
      const previousEnvironment = scene.environment;
      scene.environment = null;
      try {
        const generator = new THREE.PMREMGenerator(renderer);
        target = generator.fromScene(scene, 0.04, 0.1, 400, { size: quality === 'high' ? 256 : 128, position: new THREE.Vector3(0, 6, 0) });
        generator.dispose();
        scene.environment = target.texture;
        scene.environmentIntensity = 0.55;
      } catch {
        // No prefilter on this context: the arena still draws lit by its own lights.
        target?.dispose();
        target = null;
        scene.environment = previousEnvironment;
      }
      for (const node of seats) node.visible = true;
      roof.roof.visible = saved[0];
      roof.scoreboard.visible = saved[1];
      bowl.sections.forEach((s, i) => (s.group.visible = saved[2 + i]));
      enableReflection();
      return () => {
        if (target && scene.environment === target.texture) scene.environment = null;
        target?.dispose();
      };
    },
    onLogoChange(listener) {
      return subscribeCentreIceLogo(() => {
        ice.redraw();
        listener();
      });
    },
    dispose() {
      reflection?.dispose();
      for (const disposable of [lampHousing, lensOff, lensOn, housingGeometry, lensGeometry]) disposable.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      ice.dispose();
      rinkside.dispose();
      bowl.dispose();
      roof.dispose();
      nets.dispose();
    },
  };
}
