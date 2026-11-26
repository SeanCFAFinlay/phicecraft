// ============================================================================
// GOAL NETS
//
// A regulation goal: 6 ft x 4 ft mouth, red 2 3/8 in steel posts and
// crossbar, a top frame running back to a rear bar, shoulders sloping down to
// the base frame on the ice, and the base itself padded in white. The bag is
// real netting: a knotted-mesh alpha texture on lofted surfaces (top, both
// sides, back), so it reads as mesh up close and as a soft white haze from
// the stands, plus the white skirt along the inside of the base.
//
// Built in a local frame where +x points out of the goal mouth (toward
// centre ice) and the net extends behind the goal line toward -x; the right
// goal is the same object turned around.
// ============================================================================

import * as THREE from 'three';
import { RINK } from '@/core/constants';
import type { RenderQuality } from '@/render/quality';
import { rinkToWorld } from '../worldMap';

export const GOAL_MOUTH_WIDTH = 1.83;
export const GOAL_HEIGHT = 1.22;
const HALF = GOAL_MOUTH_WIDTH / 2;
const POST_R = 0.03;
const SHELF_X = -0.55;
const BASE_BACK_X = -1.12;
const SHOULDER_BOTTOM = { x: -0.98, z: HALF * 0.62 };
const SHELF_Z = HALF * 0.92;

export interface GoalNets {
  root: THREE.Group;
  dispose(): void;
}

/** A knotted nylon mesh: white strands on transparent, tiling. */
function createMeshTexture(): THREE.Texture | null {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  // Diamonds: two diagonals per tile, wrapping cleanly.
  for (const offset of [-size, 0, size]) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    ctx.moveTo(offset + size, 0);
    ctx.lineTo(offset, size);
    ctx.stroke();
  }
  // Knots.
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of [[0, 0], [size, 0], [0, size], [size, size], [size / 2, size / 2]]) {
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** A lofted quad patch between two edges, sagging along `sag` at its middle. UVs are metres. */
function loft(
  a: (u: number) => THREE.Vector3,
  b: (u: number) => THREE.Vector3,
  sag: (u: number, v: number) => THREE.Vector3,
  uSteps: number,
  vSteps: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const grid: THREE.Vector3[][] = [];
  for (let i = 0; i <= uSteps; i++) {
    const u = i / uSteps;
    const pa = a(u);
    const pb = b(u);
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= vSteps; j++) {
      const v = j / vSteps;
      row.push(pa.clone().lerp(pb, v).add(sag(u, v)));
    }
    grid.push(row);
  }
  // Metre UVs: accumulated distance along each direction.
  for (let i = 0; i <= uSteps; i++) {
    let along = 0;
    for (let j = 0; j <= vSteps; j++) {
      if (j > 0) along += grid[i][j].distanceTo(grid[i][j - 1]);
      let across = 0;
      for (let k = 1; k <= i; k++) across += grid[k][j].distanceTo(grid[k - 1][j]);
      const p = grid[i][j];
      positions.push(p.x, p.y, p.z);
      uvs.push(across, along);
    }
  }
  for (let i = 0; i < uSteps; i++) {
    for (let j = 0; j < vSteps; j++) {
      const a0 = i * (vSteps + 1) + j;
      const b0 = (i + 1) * (vSteps + 1) + j;
      indices.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);

/** The base frame on the ice, from the left post round the back to the right post. */
function baseCurve(): THREE.CatmullRomCurve3 {
  const y = POST_R;
  return new THREE.CatmullRomCurve3([
    v3(0, y, -HALF),
    v3(-0.45, y, -HALF * 0.82),
    v3(SHOULDER_BOTTOM.x, y, -SHOULDER_BOTTOM.z),
    v3(BASE_BACK_X + 0.04, y, -HALF * 0.3),
    v3(BASE_BACK_X, y, 0),
    v3(BASE_BACK_X + 0.04, y, HALF * 0.3),
    v3(SHOULDER_BOTTOM.x, y, SHOULDER_BOTTOM.z),
    v3(-0.45, y, HALF * 0.82),
    v3(0, y, HALF),
  ], false, 'centripetal');
}

export function createSingleGoal(direction: 1 | -1, quality: RenderQuality = 'high'): { root: THREE.Group; dispose(): void } {
  const root = new THREE.Group();
  root.name = `goal-net-${direction === 1 ? 'left' : 'right'}`;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => (geometries.push(x), x);
  const m = <T extends THREE.Material>(x: T) => (materials.push(x), x);
  const shadows = quality === 'high';
  const radial = quality === 'low' ? 8 : 14;

  const red = m(new THREE.MeshPhysicalMaterial({ color: 0xc8102e, roughness: 0.28, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  const white = m(new THREE.MeshStandardMaterial({ color: 0xf5f7f9, roughness: 0.75 }));

  const tube = (points: THREE.Vector3[], radius: number, material: THREE.Material, name: string) => {
    const curve = points.length === 2 ? new THREE.LineCurve3(points[0], points[1]) : new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(g(new THREE.TubeGeometry(curve, points.length === 2 ? 2 : 24, radius, radial, false)), material);
    mesh.name = name;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const joint = (p: THREE.Vector3, r: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(g(new THREE.SphereGeometry(r, radial, Math.max(6, radial / 2))), material);
    mesh.position.copy(p);
    mesh.castShadow = shadows;
    root.add(mesh);
  };

  const H = GOAL_HEIGHT;
  // Posts and crossbar.
  tube([v3(0, 0, -HALF), v3(0, H, -HALF)], POST_R, red, 'post-left');
  tube([v3(0, 0, HALF), v3(0, H, HALF)], POST_R, red, 'post-right');
  tube([v3(0, H, -HALF), v3(0, H, HALF)], POST_R, red, 'crossbar');
  joint(v3(0, H, -HALF), POST_R * 1.02, red);
  joint(v3(0, H, HALF), POST_R * 1.02, red);
  // Top frame, rear bar and shoulders: thinner tubing.
  const r2 = POST_R * 0.62;
  for (const s of [-1, 1]) {
    tube([v3(0, H, s * HALF), v3(SHELF_X, H, s * SHELF_Z)], r2, red, 'top-frame');
    tube([v3(SHELF_X, H, s * SHELF_Z), v3(SHOULDER_BOTTOM.x, POST_R, s * SHOULDER_BOTTOM.z)], r2, red, 'shoulder');
    joint(v3(SHELF_X, H, s * SHELF_Z), r2 * 1.05, red);
  }
  tube([v3(SHELF_X, H, -SHELF_Z), v3(SHELF_X, H, SHELF_Z)], r2, red, 'rear-bar');
  // Base frame, wrapped in white padding.
  const base = baseCurve();
  const baseMesh = new THREE.Mesh(g(new THREE.TubeGeometry(base, 48, POST_R * 1.35, radial, false)), white);
  baseMesh.name = 'base-pad';
  baseMesh.receiveShadow = true;
  baseMesh.castShadow = shadows;
  root.add(baseMesh);
  // Small peg caps where the posts meet the ice.
  for (const s of [-1, 1]) {
    const peg = new THREE.Mesh(g(new THREE.CylinderGeometry(POST_R * 1.6, POST_R * 1.8, 0.03, radial)), red);
    peg.position.set(0, 0.015, s * HALF);
    root.add(peg);
  }

  // --- Netting ----------------------------------------------------------------
  const meshTexture = createMeshTexture();
  if (meshTexture) {
    textures.push(meshTexture);
    meshTexture.repeat.set(1 / 0.055, 1 / 0.055);
  }
  const net = m(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      alphaMap: meshTexture,
      transparent: true,
      opacity: meshTexture ? 0.95 : 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.9,
    })
  );
  const steps = quality === 'low' ? 6 : 12;
  const none = () => v3(0, 0, 0);
  // Top: crossbar to rear bar, with a little sag.
  const top = loft(
    u => v3(0, H, -HALF + u * 2 * HALF),
    u => v3(SHELF_X, H, -SHELF_Z + u * 2 * SHELF_Z),
    (u, v) => v3(0, -Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.04, 0),
    steps,
    Math.max(3, steps / 3)
  );
  // Sides: from the post (front) back to the shoulder, bellying outward.
  const side = (s: number) =>
    loft(
      u => v3(0, u * H, s * HALF),
      u => lerpV(v3(SHOULDER_BOTTOM.x, POST_R, s * SHOULDER_BOTTOM.z), v3(SHELF_X, H, s * SHELF_Z), u),
      (u, v) => v3(0, 0, s * Math.sin(v * Math.PI) * Math.sin(Math.max(0.15, u) * Math.PI) * 0.05),
      steps,
      steps
    );
  // Back: rear bar down to the back of the base frame.
  const back = loft(
    u => v3(SHELF_X, H, -SHELF_Z + u * 2 * SHELF_Z),
    u => base.getPoint(0.25 + u * 0.5).setY(POST_R),
    (u, v) => v3(-Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.08, 0, 0),
    steps,
    steps
  );
  for (const [geometry, name] of [[top, 'net-top'], [side(-1), 'net-side-left'], [side(1), 'net-side-right'], [back, 'net-back']] as const) {
    const mesh = new THREE.Mesh(g(geometry), net);
    mesh.name = name;
    mesh.renderOrder = 5;
    root.add(mesh);
  }
  // The white skirt along the inside of the base.
  const skirt = loft(
    u => base.getPoint(0.04 + u * 0.92).setY(0.005),
    u => base.getPoint(0.04 + u * 0.92).setY(0.2).multiply(v3(0.97, 1, 0.97)),
    none,
    32,
    1
  );
  const skirtMesh = new THREE.Mesh(g(skirt), m(new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.85, side: THREE.DoubleSide })));
  skirtMesh.name = 'skirt';
  skirtMesh.receiveShadow = true;
  root.add(skirtMesh);

  if (direction === -1) root.rotation.y = Math.PI;

  return {
    root,
    dispose() {
      for (const x of geometries) x.dispose();
      for (const x of materials) x.dispose();
      for (const x of textures) x.dispose();
    },
  };
}

export function createGoalNets(quality: RenderQuality = 'high'): GoalNets {
  const root = new THREE.Group();
  root.name = 'goal-nets';
  const left = createSingleGoal(1, quality);
  const right = createSingleGoal(-1, quality);
  const lp = rinkToWorld({ x: RINK.goalLineLeftX, y: RINK.centerY });
  const rp = rinkToWorld({ x: RINK.goalLineRightX, y: RINK.centerY });
  left.root.position.set(lp.x, 0, lp.z);
  right.root.position.set(rp.x, 0, rp.z);
  root.add(left.root, right.root);
  return {
    root,
    dispose() {
      left.dispose();
      right.dispose();
    },
  };
}
