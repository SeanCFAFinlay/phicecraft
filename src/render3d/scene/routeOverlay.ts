// ============================================================================
// 3D ROUTE & TRAJECTORY OVERLAYS
//
// Renders authored skate routes, pass lines, and shot trajectories in the
// true-3D view as floating ribbon lines with directional arrow heads.
// ============================================================================

import * as THREE from 'three';
import type { Drill, DrillEvent, SkatePath } from '@/core/types';
import { expandCurve } from '@/utils/curves';
import { rinkToWorld } from '../worldMap';

export interface RouteOverlay3D {
  root: THREE.Group;
  dispose(): void;
}

const LINE_ELEVATION = 0.015; // 1.5 cm off the ice to prevent z-fighting
const ARROW_SIZE = 0.35;

function createRouteLine(path: SkatePath): THREE.Object3D | null {
  if (!path.points || path.points.length < 2) return null;
  const points = expandCurve(path.points, path.shape ?? 'spline');
  if (points.length < 2) return null;

  const worldPoints = points.map(p => {
    const w = rinkToWorld(p);
    return new THREE.Vector3(w.x, LINE_ELEVATION, w.z);
  });

  const curve = new THREE.CatmullRomCurve3(worldPoints);
  const geometry = new THREE.TubeGeometry(curve, Math.max(20, points.length * 2), 0.035, 6, false);

  const color = path.team === 'home' ? 0xdc2626 : 0x2563eb;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `route-${path.id}`;

  // Directional cone arrow at endpoint
  const last = worldPoints[worldPoints.length - 1];
  const secondLast = worldPoints[worldPoints.length - 2];
  const dir = new THREE.Vector3().subVectors(last, secondLast).normalize();

  const arrowGeo = new THREE.ConeGeometry(0.12, ARROW_SIZE, 8);
  arrowGeo.rotateX(Math.PI / 2);
  const arrowMesh = new THREE.Mesh(arrowGeo, material);
  arrowMesh.position.copy(last);
  arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  const group = new THREE.Group();
  group.add(mesh, arrowMesh);

  // Directional flow chevrons at 33% and 66% along the route
  [0.33, 0.66].forEach(t => {
    const pt = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const chevronGeo = new THREE.ConeGeometry(0.07, 0.2, 8);
    chevronGeo.rotateX(Math.PI / 2);
    const chevronMesh = new THREE.Mesh(chevronGeo, material);
    chevronMesh.position.copy(pt);
    chevronMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    group.add(chevronMesh);
  });

  return group;
}

function createEventLine(event: DrillEvent): THREE.Object3D | null {
  const points = [event.fromPoint, ...(event.waypoints ?? []), event.toPoint];
  const expanded = expandCurve(points, event.shape ?? 'spline');
  if (expanded.length < 2) return null;

  const worldPoints = expanded.map(p => {
    const w = rinkToWorld(p);
    return new THREE.Vector3(w.x, LINE_ELEVATION + 0.005, w.z);
  });

  const curve = new THREE.CatmullRomCurve3(worldPoints);
  const isShot = event.type === 'shot' || event.type === 'dump';
  const color = isShot ? 0xf97316 : 0xeab308;
  const geometry = new THREE.TubeGeometry(curve, Math.max(16, expanded.length * 2), 0.03, 6, false);

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.2,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `event-${event.id}`;

  const last = worldPoints[worldPoints.length - 1];
  const secondLast = worldPoints[worldPoints.length - 2];
  const dir = new THREE.Vector3().subVectors(last, secondLast).normalize();

  const arrowGeo = new THREE.ConeGeometry(0.11, ARROW_SIZE, 8);
  arrowGeo.rotateX(Math.PI / 2);
  const arrowMesh = new THREE.Mesh(arrowGeo, material);
  arrowMesh.position.copy(last);
  arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  const group = new THREE.Group();
  group.add(mesh, arrowMesh);

  if (isShot) {
    // Concentric bullseye target rings at net
    const ringGeo = new THREE.RingGeometry(0.16, 0.24, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.3,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(last.x, LINE_ELEVATION + 0.002, last.z);
    group.add(ringMesh);

    const centerGeo = new THREE.CircleGeometry(0.065, 16);
    centerGeo.rotateX(-Math.PI / 2);
    const centerMesh = new THREE.Mesh(centerGeo, ringMat);
    centerMesh.position.set(last.x, LINE_ELEVATION + 0.003, last.z);
    group.add(centerMesh);
  } else {
    // Puck start and arrival indicators for passes
    const dotGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16);
    const dotMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.35 });
    const startDot = new THREE.Mesh(dotGeo, dotMat);
    startDot.position.set(worldPoints[0].x, LINE_ELEVATION + 0.006, worldPoints[0].z);
    group.add(startDot);

    const endDot = new THREE.Mesh(dotGeo, dotMat);
    endDot.position.set(last.x, LINE_ELEVATION + 0.006, last.z);
    group.add(endDot);
  }

  return group;
}

export function createRouteOverlay3D(drill: Drill): RouteOverlay3D {
  const root = new THREE.Group();
  root.name = 'routes-3d';

  const disposables: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];

  for (const path of drill.skatePaths) {
    const obj = createRouteLine(path);
    if (obj) {
      root.add(obj);
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          disposables.push({ geometry: child.geometry, material: child.material });
        }
      });
    }
  }

  for (const event of drill.events) {
    const obj = createEventLine(event);
    if (obj) {
      root.add(obj);
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          disposables.push({ geometry: child.geometry, material: child.material });
        }
      });
    }
  }

  return {
    root,
    dispose() {
      for (const item of disposables) {
        item.geometry.dispose();
        item.material.dispose();
      }
    },
  };
}
