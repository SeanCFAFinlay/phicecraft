// ============================================================================
// BUILD ARENA
//
// The static 3D arena: ice, boards, glass, arena floor and lights. Everything
// here is built ONCE per Board3D mount (see Board3D.tsx) - nothing in this
// module reads CameraStore or animates; the orbit camera moving around this
// fixed scene is `orbit.ts`'s job, and later tasks in this phase add actors
// on top.
//
// Rink geometry (dimensions, corner radius) comes from `RINK`, the same
// source the 2D canvas painter (`RinkRenderer.ts`) draws from, converted to
// three.js world units through `RINK_SCALE` - so the ice mesh's footprint and
// the extruded boards standing on its edge can never drift out of sync with
// each other or with the 2D presentation.
// ============================================================================

import * as THREE from 'three';
import { RINK } from '@/core/constants';
import type { RenderQuality } from '@/render/quality';
import { RINK_SCALE } from '../worldMap';

export interface BuildArenaOptions {
  /**
   * Shadows are the one part of this scene expensive enough to gate on
   * quality (same tier `useCanvasLayers.ts` computes for the 2D path).
   * Task 5/6 wires Board3D's live tier through to this option; until then it
   * defaults to 'high' so a coach who has not tilted into 3D yet (where
   * Board3D is not even mounted) never pays for a lower-quality first paint.
   */
  quality?: RenderQuality;
}

export interface Arena {
  root: THREE.Object3D;
  /** Frees every geometry, material and texture this arena allocated. */
  dispose(): void;
}

/** Rink footprint, converted to three.js world units once. */
const ICE_WIDTH = RINK.width * RINK_SCALE;
const ICE_HEIGHT = RINK.height * RINK_SCALE;
const CORNER_RADIUS = RINK.cornerRadius * RINK_SCALE;

// --- Arena floor -------------------------------------------------------
// The ice canvas is drawn with a transparent `clearRect` outside the rounded
// rink outline (see `drawStaticLayer`) - the ice PlaneGeometry is a plain
// rectangle, so its four corners (outside the rounded outline) show through
// to whatever sits behind it. This floor mesh is that backing: it sits
// fractionally below the ice plane and extends past it, in PhiceCraft slate,
// the true-3D analogue of Pixi's `buildArenaFloor` (see rinkScene.dom.test.ts
// - "drawn before the ice, so it only ever peeks out past the boards").
const ARENA_FLOOR_COLOR = 0x1f2937;
const ARENA_FLOOR_MARGIN = Math.max(ICE_WIDTH, ICE_HEIGHT) * 0.15;
const ARENA_FLOOR_Y = -0.02;

// --- Boards + glass ------------------------------------------------------
// Heights are absolute world units (not scaled by RINK_SCALE - chosen
// directly against the already-converted rink footprint above, the same way
// BASE_DISTANCE in orbit.ts is a tuned constant rather than a derived one).
const BOARD_HEIGHT = 1.2;
const GLASS_HEIGHT = 1.6;
const GLASS_OPACITY = 0.18;

/** The board stack's own colours, matching `drawBoards`' cap rail + kick plate exactly (`src/canvas/RinkRenderer.ts`). */
const BOARD_WHITE = 0xf5f8fb;
const KICKPLATE_GOLD = 0xf2c94c;
const KICKPLATE_HEIGHT = 0.15;
const GLASS_TINT = 0xdcf3ff;

/** How thick the extruded board/glass wall reads, in world units (~1 real-world foot). */
export const WALL_THICKNESS = 0.3;

/** Traces a rounded rectangle, centred at the origin, onto `target` (a `Shape` or a `Path` - both share this drawing API). */
function traceRoundedRect(target: THREE.Path, width: number, height: number, radius: number): void {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.max(0, Math.min(radius, hw, hh));
  target.moveTo(-hw + r, -hh);
  target.lineTo(hw - r, -hh);
  target.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  target.lineTo(hw, hh - r);
  target.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  target.lineTo(-hw + r, hh);
  target.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  target.lineTo(-hw, -hh + r);
  target.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
}

/**
 * A THIN WALL following the rounded-rect rink outline: the outer edge is the
 * rink's own footprint, the inner edge is inset by `WALL_THICKNESS`.
 *
 * `ExtrudeGeometry` extrudes a `Shape`'s ENTIRE interior as a solid, filled
 * volume - a plain `roundedRectShape` (no hole) would extrude into a solid
 * slab covering the whole rink, not a wall standing on its edge (this was
 * caught in dev-check: with only the ice + boards in the scene, "boards"
 * turned out to be a giant opaque block big enough to enclose the camera,
 * blacking out the entire view). Giving the `Shape` a `hole` - the SAME
 * outline, inset by the wall thickness - makes `ExtrudeGeometry` extrude only
 * the ring between the two outlines, i.e. an actual hollow wall.
 */
export function roundedRectWallShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  traceRoundedRect(shape, width, height, radius);

  const hole = new THREE.Path();
  traceRoundedRect(
    hole,
    Math.max(width - WALL_THICKNESS * 2, WALL_THICKNESS),
    Math.max(height - WALL_THICKNESS * 2, WALL_THICKNESS),
    Math.max(radius - WALL_THICKNESS, 0)
  );
  shape.holes.push(hole);

  return shape;
}

/**
 * Extrudes `shape` `height` world units up +Y, base at world y = `baseY`.
 *
 * `ExtrudeGeometry` extrudes a shape's local (x, y) along +Z; rotating the
 * result -90 deg about X turns that Z-extrusion into a wall standing upright
 * on the ground plane, with the shape's own outline landing flat in the XZ
 * plane - the same plane `rinkToWorld` puts the rink in. The rotation also
 * negates the shape's own y-axis (world z = -shape.y); the outline is
 * symmetric about both its axes, so that sign flip lands on a congruent
 * outline and never shows up as a visible defect.
 */
function extrudeWall(
  shape: THREE.Shape,
  height: number,
  baseY: number,
  color: number,
  opacity = 1
): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, baseY, 0);

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
}

function buildIceMesh(iceCanvas: HTMLCanvasElement): THREE.Mesh {
  const texture = new THREE.CanvasTexture(iceCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.PlaneGeometry(ICE_WIDTH, ICE_HEIGHT);
  // PlaneGeometry is authored flat in XY, facing +Z; rotate it down onto the
  // XZ ground plane (facing +Y, up) to match rinkToWorld's y=0 convention.
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ice';
  mesh.receiveShadow = true;
  return mesh;
}

function buildArenaFloorMesh(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    ICE_WIDTH + ARENA_FLOOR_MARGIN * 2,
    ICE_HEIGHT + ARENA_FLOOR_MARGIN * 2
  );
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({ color: ARENA_FLOOR_COLOR, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'arena-floor';
  mesh.position.y = ARENA_FLOOR_Y;
  mesh.receiveShadow = true;
  return mesh;
}

function buildBoardsGroup(shape: THREE.Shape, quality: RenderQuality): THREE.Group {
  const kickplate = extrudeWall(shape, KICKPLATE_HEIGHT, 0, KICKPLATE_GOLD);
  kickplate.name = 'boards-kickplate';

  const wall = extrudeWall(shape, BOARD_HEIGHT - KICKPLATE_HEIGHT, KICKPLATE_HEIGHT, BOARD_WHITE);
  wall.name = 'boards-wall';

  for (const mesh of [kickplate, wall]) {
    mesh.receiveShadow = true;
    mesh.castShadow = quality === 'high';
  }

  const group = new THREE.Group();
  group.name = 'boards';
  group.add(kickplate, wall);
  return group;
}

function buildGlassMesh(shape: THREE.Shape): THREE.Mesh {
  const glass = extrudeWall(shape, GLASS_HEIGHT, BOARD_HEIGHT, GLASS_TINT, GLASS_OPACITY);
  glass.name = 'glass';
  return glass;
}

function buildLightsGroup(quality: RenderQuality): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lights';

  // Soft, near-neutral fill so the ice's own baked lighting (from the 2D
  // painter's texture) is not double-lit into a blown-out white.
  const hemisphere = new THREE.HemisphereLight(0xdfefff, 0x141b22, 0.7);
  group.add(hemisphere);

  const directional = new THREE.DirectionalLight(0xffffff, 1.1);
  directional.position.set(ICE_WIDTH * 0.25, 22, -ICE_HEIGHT * 0.4);
  directional.target.position.set(0, 0, 0);
  directional.castShadow = quality === 'high';
  if (directional.castShadow) {
    directional.shadow.mapSize.set(2048, 2048);
    const cam = directional.shadow.camera;
    cam.left = -ICE_WIDTH;
    cam.right = ICE_WIDTH;
    cam.top = ICE_HEIGHT;
    cam.bottom = -ICE_HEIGHT;
    cam.near = 1;
    cam.far = 80;
  }
  group.add(directional, directional.target);

  return group;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  for (const m of Array.isArray(material) ? material : [material]) {
    const withMap = m as THREE.MeshStandardMaterial;
    withMap.map?.dispose();
    m.dispose();
  }
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  disposeMaterial(mesh.material);
}

/**
 * Builds the static arena scene graph: `['arena-floor', 'ice', 'boards',
 * 'glass', 'lights']`, in that order, as `root`'s direct children.
 */
export function buildArena(iceCanvas: HTMLCanvasElement, options: BuildArenaOptions = {}): Arena {
  const quality = options.quality ?? 'high';
  const wallShape = roundedRectWallShape(ICE_WIDTH, ICE_HEIGHT, CORNER_RADIUS);

  const floor = buildArenaFloorMesh();
  const ice = buildIceMesh(iceCanvas);
  const boards = buildBoardsGroup(wallShape, quality);
  const glass = buildGlassMesh(wallShape);
  const lights = buildLightsGroup(quality);

  const root = new THREE.Group();
  root.name = 'arena';
  root.add(floor, ice, boards, glass, lights);

  return {
    root,
    dispose() {
      disposeMesh(floor);
      disposeMesh(ice);
      for (const child of boards.children) {
        if (child instanceof THREE.Mesh) disposeMesh(child);
      }
      disposeMesh(glass);
    },
  };
}
