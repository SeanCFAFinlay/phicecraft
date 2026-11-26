// ============================================================================
// RINKSIDE
//
// Everything that stands on the edge of the ice: the dasher boards (yellow
// kick plate, white board face carrying a band of rink advertising, a
// rounded cap rail), the glass with its pane joints and top edge, the tall
// end glass and the protective netting above it, the two team benches on the
// far side and the penalty boxes either side of the scorer's table on the
// near side.
//
// Advertising is fictional on purpose: the arena belongs to no real team or
// sponsor.
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RenderQuality } from '@/render/quality';
import {
  BOARD_HEIGHT,
  BOARD_THICKNESS,
  CAP_HEIGHT,
  CAP_WIDTH,
  CORNER_RADIUS,
  END_GLASS_HEIGHT,
  GLASS_PANE_WIDTH,
  ICE_LENGTH,
  ICE_WIDTH,
  KICKPLATE_HEIGHT,
  SIDE_GLASS_HEIGHT,
  perimeter,
  sweep,
  type Station,
} from './layout';

export const BOARD_WHITE = 0xf3f5f7;
export const KICKPLATE_YELLOW = 0xf0c419;
const CAP_COLOR = 0xf7f9fb;
const BOARD_BACK = 0xc9ced4;

/** Bench and penalty-box layout, in metres along x (centre ice = 0). */
export const BENCH_LENGTH = 9.4;
export const BENCH_CENTRES = [-5.6, 5.6];
export const BENCH_DEPTH = 2.1;
export const PENALTY_LENGTH = 4.4;
export const PENALTY_CENTRES = [-4.5, 4.5];
export const SCORER_LENGTH = 4.2;

const AD_PANEL_METRES = 3.6;
const AD_PANELS = [
  { bg: '#ffffff', fg: '#0d3b8c', title: 'PHORMATION', sub: 'DRILLS THAT MOVE' },
  { bg: '#0f2d52', fg: '#ffffff', title: 'NORTHLINE', sub: 'ICE SPORTS' },
  { bg: '#ffffff', fg: '#c3102f', title: 'HAT TRICK', sub: 'PIZZA & GRILL' },
  { bg: '#ffffff', fg: '#ffffff', title: '', sub: '' },
  { bg: '#e5eef5', fg: '#16324f', title: 'GLACIER', sub: 'SPRING WATER' },
  { bg: '#c3102f', fg: '#ffffff', title: 'FROSTWORKS', sub: 'REFRIGERATION' },
  { bg: '#ffffff', fg: '#1d1d1f', title: 'SUMMIT', sub: 'SKATE CO.' },
  { bg: '#ffffff', fg: '#ffffff', title: '', sub: '' },
  { bg: '#ffffff', fg: '#0b6e4f', title: 'RINKSIDE', sub: 'AUTO GROUP' },
  { bg: '#101820', fg: '#f0c419', title: 'BLUE LINE', sub: 'COFFEE ROASTERS' },
];

/** The advertising band printed on the board face, repeating around the rink. */
function createAdTexture(quality: RenderQuality): THREE.Texture | null {
  const panelPx = quality === 'high' ? 512 : 256;
  const canvas = document.createElement('canvas');
  canvas.width = panelPx * AD_PANELS.length;
  canvas.height = Math.round(panelPx * 0.26);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const h = canvas.height;
  AD_PANELS.forEach((panel, i) => {
    const x = i * panelPx;
    ctx.fillStyle = panel.bg;
    ctx.fillRect(x, 0, panelPx, h);
    if (!panel.title) return;
    // A thin frame line so each sponsor reads as a separate panel.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, 0, 2, h);
    ctx.fillStyle = panel.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `900 ${Math.round(h * 0.46)}px "Arial Black", Arial, sans-serif`;
    ctx.fillText(panel.title, x + panelPx / 2, h * 0.6, panelPx * 0.88);
    ctx.font = `700 ${Math.round(h * 0.2)}px Arial, sans-serif`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(panel.sub, x + panelPx / 2, h * 0.86, panelPx * 0.8);
    ctx.globalAlpha = 1;
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Where the far-side benches open onto the ice (no glass there, so players can step over). */
function inBenchOpening(st: Station): boolean {
  if (st.nz > -0.99) return false;
  return BENCH_CENTRES.some(cx => Math.abs(st.x - cx) < BENCH_LENGTH / 2);
}

/** End glass is the tall 8 ft glass: behind each net and round into the corners. */
function glassHeightAt(st: Station): number {
  const straightEnd = ICE_LENGTH / 2 - CORNER_RADIUS;
  return Math.abs(st.x) > straightEnd - 0.01 ? END_GLASS_HEIGHT : SIDE_GLASS_HEIGHT;
}

/** A vertical band of quads following `stations`, from `bottom(st)` to `top(st)`, skipping runs `include` rejects. */
function band(
  stations: Station[],
  offset: number,
  bottom: (st: Station) => number,
  top: (st: Station) => number,
  include: (st: Station) => boolean = () => true
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (!include(a) || !include(b)) continue;
    // A step in height (side glass meeting end glass) uses the taller of the
    // two for this segment, so the step lands on a pane joint.
    const yTop = Math.max(top(a), top(b));
    const yBottom = bottom(a);
    const base = positions.length / 3;
    for (const st of [a, b]) {
      const x = st.x + st.nx * offset;
      const z = st.z + st.nz * offset;
      positions.push(x, yBottom, z, x, yTop, z);
      normals.push(-st.nx, 0, -st.nz, -st.nx, 0, -st.nz);
      uvs.push(st.s, 0, st.s, 1);
    }
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export interface Rinkside {
  boards: THREE.Group;
  glass: THREE.Group;
  benches: THREE.Group;
  dispose(): void;
}

export function createRinkside(quality: RenderQuality): Rinkside {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const shadows = quality === 'high';

  // --- Boards ---------------------------------------------------------------
  const stations = perimeter(0, 0.6, 28);
  const boards = new THREE.Group();
  boards.name = 'boards';

  const kick = new THREE.Mesh(
    track(sweep(stations, [{ out: 0, up: 0 }, { out: 0, up: KICKPLATE_HEIGHT }])),
    mat(new THREE.MeshStandardMaterial({ color: KICKPLATE_YELLOW, roughness: 0.55 }))
  );
  kick.name = 'boards-kickplate';

  const adTexture = createAdTexture(quality);
  if (adTexture) textures.push(adTexture);
  const faceTop = BOARD_HEIGHT - CAP_HEIGHT;
  const face = new THREE.Mesh(
    track(sweep(stations, [{ out: 0, up: KICKPLATE_HEIGHT }, { out: 0, up: faceTop }], { uScale: -AD_PANEL_METRES * AD_PANELS.length })),
    mat(new THREE.MeshStandardMaterial({ color: adTexture ? 0xffffff : BOARD_WHITE, map: adTexture, roughness: 0.42 }))
  );
  face.name = 'boards-face';

  // The cap rail: rounded on the ice side, wider than the board, sloping off at the back.
  const capR = CAP_HEIGHT * 0.9;
  const capFront = -0.035;
  const noseCentre = { out: capFront + capR, up: BOARD_HEIGHT - capR };
  const capProfile: { out: number; up: number }[] = [{ out: capFront, up: faceTop }];
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI - (i / 6) * (Math.PI / 2);
    capProfile.push({ out: noseCentre.out + Math.cos(a) * capR, up: noseCentre.up + Math.sin(a) * capR });
  }
  capProfile.push({ out: CAP_WIDTH - 0.04, up: BOARD_HEIGHT });
  capProfile.push({ out: CAP_WIDTH, up: BOARD_HEIGHT - 0.03 });
  capProfile.push({ out: CAP_WIDTH, up: faceTop - 0.02 });
  const cap = new THREE.Mesh(
    track(sweep(stations, capProfile)),
    mat(new THREE.MeshStandardMaterial({ color: CAP_COLOR, roughness: 0.3 }))
  );
  cap.name = 'boards-cap';
  // The underside of the cap lip, so it doesn't read as paper-thin from the ice.
  const lip = new THREE.Mesh(
    track(sweep(stations, [{ out: capFront, up: faceTop }, { out: 0, up: faceTop }], { flip: true })),
    cap.material
  );
  lip.name = 'boards-cap-lip';
  const back = new THREE.Mesh(
    track(sweep(stations, [{ out: BOARD_THICKNESS, up: faceTop }, { out: BOARD_THICKNESS, up: 0 }])),
    mat(new THREE.MeshStandardMaterial({ color: BOARD_BACK, roughness: 0.8 }))
  );
  back.name = 'boards-back';
  for (const mesh of [kick, face, cap, lip, back]) {
    mesh.receiveShadow = true;
    mesh.castShadow = shadows;
    boards.add(mesh);
  }

  // Doors: thin dark seams in the board face at each bench and penalty-box gate.
  const seamGeometry = track(new THREE.BoxGeometry(0.012, faceTop - 0.02, 0.01));
  const seamMaterial = mat(new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6 }));
  const doorXs: { x: number; z: number }[] = [];
  for (const cx of BENCH_CENTRES) for (const dx of [-0.6, 0.6]) doorXs.push({ x: cx + dx * BENCH_LENGTH * 0.5, z: -ICE_WIDTH / 2 });
  for (const cx of PENALTY_CENTRES) for (const dx of [-0.7, 0.7]) doorXs.push({ x: cx + dx, z: ICE_WIDTH / 2 });
  const seams = new THREE.InstancedMesh(seamGeometry, seamMaterial, doorXs.length);
  seams.name = 'board-doors';
  const m4 = new THREE.Matrix4();
  doorXs.forEach((d, i) => {
    m4.makeTranslation(d.x, (faceTop + 0.02) / 2, d.z + Math.sign(d.z) * -0.004);
    seams.setMatrixAt(i, m4);
  });
  boards.add(seams);

  // --- Glass ----------------------------------------------------------------
  const glass = new THREE.Group();
  glass.name = 'glass';
  const glassOffset = BOARD_THICKNESS * 0.55;
  const glassMaterial = mat(
    new THREE.MeshPhysicalMaterial({
      color: 0xe8f6ff,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.4,
    })
  );
  const panes = new THREE.Mesh(
    track(band(stations, glassOffset, () => BOARD_HEIGHT, st => BOARD_HEIGHT + glassHeightAt(st), st => !inBenchOpening(st))),
    glassMaterial
  );
  panes.name = 'glass-panes';
  panes.renderOrder = 2;
  glass.add(panes);

  // The polished top edge of every pane catches the light: a thin bright strip.
  const edge = new THREE.Mesh(
    track(band(stations, glassOffset, st => BOARD_HEIGHT + glassHeightAt(st) - 0.025, st => BOARD_HEIGHT + glassHeightAt(st), st => !inBenchOpening(st))),
    mat(new THREE.MeshStandardMaterial({ color: 0xdff3ff, roughness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }))
  );
  edge.name = 'glass-edge';
  edge.renderOrder = 3;
  glass.add(edge);

  // Pane joints: a slim dark gasket and an aluminium clip every pane width.
  const joints: { st: Station; h: number }[] = [];
  let nextJoint = 0;
  for (const st of stations) {
    if (st.s >= nextJoint) {
      if (!inBenchOpening(st)) joints.push({ st, h: glassHeightAt(st) });
      nextJoint = st.s + GLASS_PANE_WIDTH;
    }
  }
  const jointGeometry = track(new THREE.BoxGeometry(0.035, 1, 0.05));
  jointGeometry.translate(0, 0.5, 0);
  const jointMesh = new THREE.InstancedMesh(jointGeometry, mat(new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.35, metalness: 0.6 })), joints.length);
  jointMesh.name = 'glass-joints';
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  joints.forEach((j, i) => {
    q.setFromAxisAngle(up, Math.atan2(j.st.nx, j.st.nz));
    pos.set(j.st.x + j.st.nx * glassOffset, BOARD_HEIGHT, j.st.z + j.st.nz * glassOffset);
    scl.set(1, j.h, 1);
    m4.compose(pos, q, scl);
    jointMesh.setMatrixAt(i, m4);
  });
  glass.add(jointMesh);

  // Protective netting above the end glass, hung from the roof.
  const netCanvas = document.createElement('canvas');
  netCanvas.width = netCanvas.height = 64;
  const nctx = netCanvas.getContext('2d');
  let netTexture: THREE.Texture | null = null;
  if (nctx) {
    nctx.strokeStyle = 'rgba(20,24,28,1)';
    nctx.lineWidth = 3;
    nctx.strokeRect(0, 0, 64, 64);
    netTexture = new THREE.CanvasTexture(netCanvas);
    netTexture.wrapS = netTexture.wrapT = THREE.RepeatWrapping;
    netTexture.repeat.set(1 / 0.12, 1 / 0.12);
    textures.push(netTexture);
  }
  const endOnly = (st: Station) => Math.abs(st.x) > ICE_LENGTH / 2 - CORNER_RADIUS * 0.6;
  const netting = new THREE.Mesh(
    track(band(stations, glassOffset + 0.05, st => BOARD_HEIGHT + glassHeightAt(st), () => BOARD_HEIGHT + END_GLASS_HEIGHT + 5.5, endOnly)),
    mat(
      new THREE.MeshBasicMaterial({
        color: 0x111418,
        map: netTexture,
        alphaMap: netTexture,
        transparent: true,
        opacity: netTexture ? 0.45 : 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
  );
  // The netting's UVs are metres, so the texture repeat gives a 12 cm mesh.
  const netUv = netting.geometry.getAttribute('uv') as THREE.BufferAttribute;
  const netPos = netting.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < netUv.count; i++) netUv.setY(i, netPos.getY(i));
  netting.name = 'end-netting';
  netting.renderOrder = 4;
  glass.add(netting);

  // --- Benches and penalty boxes --------------------------------------------
  const benches = new THREE.Group();
  benches.name = 'benches';
  const rubber = mat(new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.95 }));
  const benchSeat = mat(new THREE.MeshStandardMaterial({ color: 0x24364d, roughness: 0.7 }));
  const panel = mat(new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: 0.5 }));
  const darkPanel = mat(new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.6 }));
  const screen = mat(new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x3b82f6, emissiveIntensity: 0.6, roughness: 0.3 }));
  const boxGlass = glassMaterial;
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material; cast?: boolean }[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, cast = true) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    parts.push({ geometry: g, material, cast });
  };

  const sideEdge = ICE_WIDTH / 2 + BOARD_THICKNESS;
  // Team benches, far side (-z).
  for (const cx of BENCH_CENTRES) {
    const z0 = -sideEdge;
    box(BENCH_LENGTH, 0.12, BENCH_DEPTH, cx, 0, z0 - BENCH_DEPTH / 2, rubber, false);
    box(BENCH_LENGTH - 0.3, 0.46, 0.42, cx, 0.12, z0 - BENCH_DEPTH + 0.35, benchSeat);
    box(BENCH_LENGTH - 0.3, 0.06, 0.48, cx, 0.58, z0 - BENCH_DEPTH + 0.36, benchSeat);
    // Back wall and end partitions.
    box(BENCH_LENGTH, 1.15, 0.12, cx, 0, z0 - BENCH_DEPTH, darkPanel);
    for (const sx of [-1, 1]) {
      box(0.1, 1.07, BENCH_DEPTH, cx + sx * BENCH_LENGTH / 2, 0, z0 - BENCH_DEPTH / 2, panel);
      box(0.03, 1.2, BENCH_DEPTH, cx + sx * BENCH_LENGTH / 2, 1.07, z0 - BENCH_DEPTH / 2, boxGlass, false);
    }
    // Tall glass behind the bench, separating it from the first row.
    box(BENCH_LENGTH, 1.3, 0.03, cx, 1.15, z0 - BENCH_DEPTH, boxGlass, false);
    // Stick rack and water bottle shelf along the boards.
    box(BENCH_LENGTH - 0.6, 0.05, 0.16, cx, 0.95, z0 - 0.1, darkPanel);
  }
  // Penalty boxes and scorer's table, near side (+z).
  const zN = sideEdge;
  const boxDepth = 1.8;
  for (const cx of PENALTY_CENTRES) {
    box(PENALTY_LENGTH, 0.12, boxDepth, cx, 0, zN + boxDepth / 2, rubber, false);
    box(PENALTY_LENGTH - 0.4, 0.46, 0.42, cx, 0.12, zN + boxDepth - 0.3, benchSeat);
    box(PENALTY_LENGTH, 1.1, 0.1, cx, 0, zN + boxDepth, panel);
    box(PENALTY_LENGTH, 1.5, 0.03, cx, 1.1, zN + boxDepth, boxGlass, false);
    for (const sx of [-1, 1]) {
      box(0.1, 1.07, boxDepth, cx + sx * PENALTY_LENGTH / 2, 0, zN + boxDepth / 2, panel);
      box(0.03, 1.5, boxDepth, cx + sx * PENALTY_LENGTH / 2, 1.07, zN + boxDepth / 2, boxGlass, false);
    }
  }
  box(SCORER_LENGTH, 0.12, boxDepth, 0, 0, zN + boxDepth / 2, rubber, false);
  box(SCORER_LENGTH - 0.2, 0.85, 0.6, 0, 0.12, zN + 0.45, darkPanel);
  box(SCORER_LENGTH - 0.2, 0.04, 0.7, 0, 0.97, zN + 0.48, panel);
  for (const sx of [-1.2, 0, 1.2]) box(0.5, 0.32, 0.03, sx, 1.01, zN + 0.62, screen);
  box(SCORER_LENGTH, 1.1, 0.1, 0, 0, zN + boxDepth, panel);

  // One mesh per material keeps the draw calls down.
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const casting = new Map<THREE.Material, boolean>();
  for (const part of parts) {
    const list = byMaterial.get(part.material) ?? [];
    list.push(part.geometry);
    byMaterial.set(part.material, list);
    casting.set(part.material, (casting.get(part.material) ?? false) || Boolean(part.cast));
  }
  for (const [material, list] of byMaterial) {
    const merged = track(mergeGeometries(list) ?? list[0]);
    for (const g of list) if (g !== merged) g.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.receiveShadow = true;
    mesh.castShadow = shadows && Boolean(casting.get(material)) && material !== boxGlass;
    if (material === boxGlass) mesh.renderOrder = 2;
    benches.add(mesh);
  }

  return {
    boards,
    glass,
    benches,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      netCanvas.width = netCanvas.height = 0;
    },
  };
}
