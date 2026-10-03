// ============================================================================
// 3D ON-ICE TRAINING EQUIPMENT
//
// Procedural 3D models for coaching equipment placed on the ice:
// cones/pylons, tires, passing gates/hurdles, mini-nets, divider bumpers,
// puck piles, and station markers.
// ============================================================================

import * as THREE from 'three';
import type { Drill, EquipmentItem } from '@/core/types';
import type { RenderQuality } from '@/render/quality';
import { rinkToWorld, RINK_SCALE } from '../worldMap';

export interface EquipmentOverlay3D {
  root: THREE.Group;
  dispose(): void;
}

/**
 * Procedural 3D Cone / Training Pylon with rubber base, conical body & reflective collar.
 */
function create3DCone(
  quality: RenderQuality,
  sharedMaterials: { rubber: THREE.Material; orange: THREE.Material; collar: THREE.Material },
  disposables: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cone-3d';

  // 1. Square rubber weighted base
  const baseGeo = new THREE.BoxGeometry(0.22, 0.018, 0.22);
  disposables.push(baseGeo);
  const baseMesh = new THREE.Mesh(baseGeo, sharedMaterials.rubber);
  baseMesh.position.y = 0.009;
  baseMesh.receiveShadow = true;
  if (quality === 'high') baseMesh.castShadow = true;
  group.add(baseMesh);

  // 2. Conical fluorescent orange body
  const bodyGeo = new THREE.ConeGeometry(0.085, 0.35, 16);
  disposables.push(bodyGeo);
  const bodyMesh = new THREE.Mesh(bodyGeo, sharedMaterials.orange);
  bodyMesh.position.y = 0.018 + 0.175;
  bodyMesh.receiveShadow = true;
  if (quality === 'high') bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // 3. Reflective white safety collar band
  const collarGeo = new THREE.CylinderGeometry(0.055, 0.068, 0.07, 16, 1, true);
  disposables.push(collarGeo);
  const collarMesh = new THREE.Mesh(collarGeo, sharedMaterials.collar);
  collarMesh.position.y = 0.018 + 0.18;
  group.add(collarMesh);

  return group;
}

/**
 * Procedural 3D Practice Tire with rubber sidewall and hollow center.
 */
function create3DTire(
  quality: RenderQuality,
  rubberMat: THREE.Material,
  disposables: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tire-3d';

  const tireGeo = new THREE.TorusGeometry(0.18, 0.08, 12, 24);
  tireGeo.rotateX(Math.PI / 2);
  disposables.push(tireGeo);

  const mesh = new THREE.Mesh(tireGeo, rubberMat);
  mesh.position.y = 0.08;
  mesh.receiveShadow = true;
  if (quality === 'high') mesh.castShadow = true;
  group.add(mesh);

  return group;
}

/**
 * Procedural 3D Passing Hurdle / Gate with dual cones and PVC hurdle rail.
 */
function create3DGate(
  quality: RenderQuality,
  sharedMaterials: { rubber: THREE.Material; orange: THREE.Material; collar: THREE.Material; pvc: THREE.Material },
  disposables: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gate-3d';
  const span = 1.4; // 1.4 metres between cones

  const leftCone = create3DCone(quality, sharedMaterials, disposables);
  leftCone.position.set(-span / 2, 0, 0);
  group.add(leftCone);

  const rightCone = create3DCone(quality, sharedMaterials, disposables);
  rightCone.position.set(span / 2, 0, 0);
  group.add(rightCone);

  // Horizontal PVC hurdle crossbar
  const barGeo = new THREE.CylinderGeometry(0.016, 0.016, span + 0.1, 12);
  barGeo.rotateZ(Math.PI / 2);
  disposables.push(barGeo);

  const barMesh = new THREE.Mesh(barGeo, sharedMaterials.pvc);
  barMesh.position.set(0, 0.28, 0);
  barMesh.receiveShadow = true;
  if (quality === 'high') barMesh.castShadow = true;
  group.add(barMesh);

  return group;
}

/**
 * Procedural 3D Mini Training Net.
 */
function create3DMiniNet(
  quality: RenderQuality,
  sharedMaterials: { redSteel: THREE.Material; net: THREE.Material },
  disposables: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mini-net-3d';

  const width = 0.9;
  const height = 0.6;
  const depth = 0.5;
  const pipeRadius = 0.018;

  // Posts & Crossbar
  const postGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, height, 12);
  disposables.push(postGeo);

  const leftPost = new THREE.Mesh(postGeo, sharedMaterials.redSteel);
  leftPost.position.set(0, height / 2, -width / 2);
  group.add(leftPost);

  const rightPost = new THREE.Mesh(postGeo, sharedMaterials.redSteel);
  rightPost.position.set(0, height / 2, width / 2);
  group.add(rightPost);

  const crossbarGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, width, 12);
  crossbarGeo.rotateX(Math.PI / 2);
  disposables.push(crossbarGeo);

  const crossbar = new THREE.Mesh(crossbarGeo, sharedMaterials.redSteel);
  crossbar.position.set(0, height, 0);
  group.add(crossbar);

  // Rear lower curve
  const rearCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, pipeRadius, -width / 2),
    new THREE.Vector3(-depth, pipeRadius, 0),
    new THREE.Vector3(0, pipeRadius, width / 2)
  );
  const rearGeo = new THREE.TubeGeometry(rearCurve, 12, pipeRadius * 0.9, 8, false);
  disposables.push(rearGeo);
  const rearMesh = new THREE.Mesh(rearGeo, sharedMaterials.redSteel);
  group.add(rearMesh);

  // Netting mesh shell
  const netVertices = new Float32Array([
    // Roof
    0, height, -width / 2,
    0, height, width / 2,
    -depth * 0.7, height * 0.8, 0,

    // Left wall
    0, 0, -width / 2,
    0, height, -width / 2,
    -depth, 0, 0,

    // Right wall
    0, 0, width / 2,
    -depth, 0, 0,
    0, height, width / 2,

    // Back wall
    0, height, -width / 2,
    -depth, 0, 0,
    0, height, width / 2,
  ]);
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.BufferAttribute(netVertices, 3));
  netGeo.computeVertexNormals();
  disposables.push(netGeo);

  const netMesh = new THREE.Mesh(netGeo, sharedMaterials.net);
  group.add(netMesh);

  if (quality === 'high') {
    leftPost.castShadow = true;
    rightPost.castShadow = true;
    crossbar.castShadow = true;
  }

  return group;
}

/**
 * Procedural 3D Ice Divider Bumper (Vinyl-covered foam barrier).
 */
function create3DBarrier(
  lengthMeters: number,
  quality: RenderQuality,
  vinylMat: THREE.Material,
  disposables: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'barrier-3d';

  const width = 0.22;
  const height = 0.24;
  const len = Math.max(1.0, lengthMeters);

  const boxGeo = new THREE.BoxGeometry(len, height, width);
  disposables.push(boxGeo);

  const mesh = new THREE.Mesh(boxGeo, vinylMat);
  mesh.position.y = height / 2;
  mesh.receiveShadow = true;
  if (quality === 'high') mesh.castShadow = true;
  group.add(mesh);

  return group;
}

/**
 * Procedural 3D Puck Pile (Cluster of vulcanized hockey pucks).
 */
function create3DPuckPile(
  quality: RenderQuality,
  puckMat: THREE.Material,
  disposables: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'puck-pile-3d';

  const puckRadius = 0.038;
  const puckHeight = 0.025;
  const puckGeo = new THREE.CylinderGeometry(puckRadius, puckRadius, puckHeight, 14);
  disposables.push(puckGeo);

  // Position 10 pucks in an organic pile
  const offsets = [
    { x: 0, z: 0, y: 0.5 },
    { x: 0.05, z: 0.03, y: 0.5 },
    { x: -0.04, z: 0.04, y: 0.5 },
    { x: -0.05, z: -0.03, y: 0.5 },
    { x: 0.03, z: -0.05, y: 0.5 },
    { x: 0.08, z: -0.01, y: 0.5 },
    { x: -0.02, z: 0.08, y: 0.5 },
    // Second layer
    { x: 0.01, z: 0.01, y: 1.5 },
    { x: -0.02, z: 0.02, y: 1.5 },
    { x: 0.03, z: -0.02, y: 1.5 },
    // Top puck
    { x: 0.0, z: 0.0, y: 2.5 },
  ];

  for (const off of offsets) {
    const pMesh = new THREE.Mesh(puckGeo, puckMat);
    pMesh.position.set(off.x, off.y * puckHeight, off.z);
    pMesh.receiveShadow = true;
    if (quality === 'high') pMesh.castShadow = true;
    group.add(pMesh);
  }

  return group;
}

/**
 * Procedural 3D Station / Start Marker Disc on the ice.
 */
function create3DMarkerDisc(
  colorHex: number,
  disposables: THREE.BufferGeometry[],
  materials: THREE.Material[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'marker-disc-3d';

  const discGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.008, 24);
  disposables.push(discGeo);

  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.4,
    transparent: true,
    opacity: 0.85,
  });
  materials.push(mat);

  const mesh = new THREE.Mesh(discGeo, mat);
  mesh.position.y = 0.004;
  mesh.receiveShadow = true;
  group.add(mesh);

  return group;
}

/**
 * Creates the full 3D equipment overlay for a drill.
 */
export function createEquipmentOverlay3D(drill: Drill, quality: RenderQuality = 'high'): EquipmentOverlay3D {
  const root = new THREE.Group();
  root.name = 'equipment-3d';

  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];

  // Shared reusable materials
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.85 });
  disposablesMat.push(rubberMat);

  const coneOrangeMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.38, metalness: 0.05 });
  disposablesMat.push(coneOrangeMat);

  const collarWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1 });
  disposablesMat.push(collarWhiteMat);

  const pvcMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.1 });
  disposablesMat.push(pvcMat);

  const redSteelMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.25 });
  disposablesMat.push(redSteelMat);

  const netMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.8,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  disposablesMat.push(netMat);

  const blueVinylMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.08 });
  disposablesMat.push(blueVinylMat);

  const puckMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.6 });
  disposablesMat.push(puckMat);

  const coneMats = { rubber: rubberMat, orange: coneOrangeMat, collar: collarWhiteMat };
  const gateMats = { rubber: rubberMat, orange: coneOrangeMat, collar: collarWhiteMat, pvc: pvcMat };
  const miniNetMats = { redSteel: redSteelMat, net: netMat };

  const items: EquipmentItem[] = drill.equipment ?? [];

  for (const item of items) {
    let obj: THREE.Object3D | null = null;

    switch (item.kind) {
      case 'cone':
        obj = create3DCone(quality, coneMats, disposablesGeo);
        break;
      case 'tire':
        obj = create3DTire(quality, rubberMat, disposablesGeo);
        break;
      case 'gate':
        obj = create3DGate(quality, gateMats, disposablesGeo);
        break;
      case 'mini-net':
        obj = create3DMiniNet(quality, miniNetMats, disposablesGeo);
        break;
      case 'barrier': {
        const len = (item.size?.width ?? 60) * RINK_SCALE;
        obj = create3DBarrier(len, quality, blueVinylMat, disposablesGeo);
        break;
      }
      case 'puck-pile':
        obj = create3DPuckPile(quality, puckMat, disposablesGeo);
        break;
      case 'start-marker':
        obj = create3DMarkerDisc(0x10b981, disposablesGeo, disposablesMat);
        break;
      case 'queue-marker':
        obj = create3DMarkerDisc(0xf59e0b, disposablesGeo, disposablesMat);
        break;
      case 'zone':
        obj = create3DMarkerDisc(0x06b6d4, disposablesGeo, disposablesMat);
        break;
    }

    if (obj) {
      const world = rinkToWorld(item.position);
      obj.position.set(world.x, 0, world.z);
      if (item.rotation) {
        obj.rotation.y = item.rotation;
      }
      root.add(obj);
    }
  }

  return {
    root,
    dispose() {
      for (const geo of disposablesGeo) geo.dispose();
      for (const mat of disposablesMat) mat.dispose();
    },
  };
}
