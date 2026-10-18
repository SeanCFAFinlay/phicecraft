// ============================================================================
// 3D GOAL NETS
//
// Procedural NHL regulation 3D goal nets for Board3D: red steel posts,
// crossbar, curved rear frame, and white nylon netting bag.
// ============================================================================

import * as THREE from 'three';
import { RINK } from '@/core/constants';
import { rinkToWorld, RINK_SCALE } from '../worldMap';
import type { RenderQuality } from '@/render/quality';

export interface GoalNetObject {
  root: THREE.Group;
  dispose(): void;
}

// NHL Goal regulation scale: 6 ft wide, 4 ft high, 40 in deep
const GOAL_WIDTH = 30 * RINK_SCALE; // ~1.83m
const GOAL_HEIGHT = 20 * RINK_SCALE; // ~1.22m
const GOAL_DEPTH = 16.5 * RINK_SCALE; // ~1.01m
const POST_RADIUS = 0.024; // ~2 in diameter pipe

export function createSingleGoal(direction: 1 | -1, quality: RenderQuality = 'high'): GoalNetObject {
  const root = new THREE.Group();
  root.name = `goal-net-${direction === 1 ? 'left' : 'right'}`;

  const redMaterial = new THREE.MeshStandardMaterial({
    color: 0xd62839,
    roughness: 0.35,
    metalness: 0.25,
  });

  const netMaterial = new THREE.LineBasicMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.58, depthWrite: false });

  const geometries: THREE.BufferGeometry[] = [];

  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = false): THREE.Mesh => {
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    if (cast && quality === 'high') {
      mesh.castShadow = true;
    }
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  const halfWidth = GOAL_WIDTH / 2;

  // 1. Vertical Posts (Left & Right)
  const postGeo = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HEIGHT, 16);
  // Left post
  const leftPost = addMesh(postGeo, redMaterial, true);
  leftPost.position.set(0, GOAL_HEIGHT / 2, -halfWidth);

  // Right post
  const rightPost = addMesh(postGeo, redMaterial, true);
  rightPost.position.set(0, GOAL_HEIGHT / 2, halfWidth);

  // 2. Crossbar
  const crossbarGeo = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_WIDTH, 16);
  crossbarGeo.rotateX(Math.PI / 2);
  const crossbar = addMesh(crossbarGeo, redMaterial, true);
  crossbar.position.set(0, GOAL_HEIGHT, 0);

  // 3. Lower Back Frame (curved rear rail running along ice)
  const rearDist = -direction * GOAL_DEPTH;
  const baseCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, POST_RADIUS, -halfWidth),
    new THREE.Vector3(rearDist * 1.05, POST_RADIUS, 0),
    new THREE.Vector3(0, POST_RADIUS, halfWidth)
  );
  const baseFrameGeo = new THREE.TubeGeometry(baseCurve, 16, POST_RADIUS * 0.85, 8, false);
  addMesh(baseFrameGeo, redMaterial, true);

  // 4. Center Top Shelf Strut (running from crossbar center to top rear apex)
  const apexPos = new THREE.Vector3(rearDist * 0.75, GOAL_HEIGHT * 0.85, 0);
  const topShelfCurve = new THREE.LineCurve3(
    new THREE.Vector3(0, GOAL_HEIGHT, 0),
    apexPos
  );
  const topShelfGeo = new THREE.TubeGeometry(topShelfCurve, 6, POST_RADIUS * 0.7, 8, false);
  addMesh(topShelfGeo, redMaterial, true);

  // 5. Rear Vertical Center Strut (from top apex to ice base)
  const rearStrutCurve = new THREE.LineCurve3(
    apexPos,
    new THREE.Vector3(rearDist, POST_RADIUS, 0)
  );
  const rearStrutGeo = new THREE.TubeGeometry(rearStrutCurve, 6, POST_RADIUS * 0.7, 8, false);
  addMesh(rearStrutGeo, redMaterial, true);

  // Open nylon mesh, not opaque triangular panels. One line batch per net
  // gives the actual grid silhouette without hundreds of separate objects.
  const strands: THREE.Vector3[] = [];
  const spacing = quality === 'high' ? 0.075 : quality === 'medium' ? 0.12 : 0.18;
  const panel = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    const across = Math.max(2, Math.ceil(Math.max(a.distanceTo(b), d.distanceTo(c)) / spacing));
    const down = Math.max(2, Math.ceil(Math.max(a.distanceTo(d), b.distanceTo(c)) / spacing));
    for (let index = 0; index <= across; index++) {
      strands.push(a.clone().lerp(b, index / across), d.clone().lerp(c, index / across));
    }
    for (let index = 0; index <= down; index++) {
      strands.push(a.clone().lerp(d, index / down), b.clone().lerp(c, index / down));
    }
  };
  const frontLeft = new THREE.Vector3(0, 0, -halfWidth);
  const frontRight = new THREE.Vector3(0, 0, halfWidth);
  const topLeft = new THREE.Vector3(0, GOAL_HEIGHT, -halfWidth);
  const topRight = new THREE.Vector3(0, GOAL_HEIGHT, halfWidth);
  const backLeft = new THREE.Vector3(rearDist, 0, -halfWidth * 0.65);
  const backRight = new THREE.Vector3(rearDist, 0, halfWidth * 0.65);
  const backTopLeft = new THREE.Vector3(rearDist * 0.75, GOAL_HEIGHT * 0.85, -halfWidth * 0.65);
  const backTopRight = new THREE.Vector3(rearDist * 0.75, GOAL_HEIGHT * 0.85, halfWidth * 0.65);
  panel(frontLeft, topLeft, backTopLeft, backLeft);
  panel(frontRight, topRight, backTopRight, backRight);
  panel(topLeft, topRight, backTopRight, backTopLeft);
  panel(backLeft, backRight, backTopRight, backTopLeft);
  const netGeometry = new THREE.BufferGeometry().setFromPoints(strands);
  geometries.push(netGeometry);
  const netting = new THREE.LineSegments(netGeometry, netMaterial);
  netting.name = 'nylon-netting';
  root.add(netting);

  return {
    root,
    dispose() {
      for (const geo of geometries) geo.dispose();
      redMaterial.dispose();
      netMaterial.dispose();
    },
  };
}

export function createGoalNets(quality: RenderQuality = 'high'): GoalNetObject {
  const root = new THREE.Group();
  root.name = 'goal-nets';

  const leftNet = createSingleGoal(1, quality);
  const leftPos = rinkToWorld({ x: RINK.goalLineLeftX, y: RINK.centerY });
  leftNet.root.position.set(leftPos.x, 0, leftPos.z);
  root.add(leftNet.root);

  const rightNet = createSingleGoal(-1, quality);
  const rightPos = rinkToWorld({ x: RINK.goalLineRightX, y: RINK.centerY });
  rightNet.root.position.set(rightPos.x, 0, rightPos.z);
  root.add(rightNet.root);

  return {
    root,
    dispose() {
      leftNet.dispose();
      rightNet.dispose();
    },
  };
}
