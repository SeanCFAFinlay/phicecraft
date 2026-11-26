// ============================================================================
// SEATING BOWL
//
// The stands: a lower bowl rising from just behind the benches, a club-level
// walkway fronted by an LED ribbon board, an upper bowl, and the back wall
// with a band of lit suite windows. Every tier follows the rink's own rounded
// outline, pushed outward (`perimeter`), so the building is concentric with
// the ice from any angle.
//
// The bowl is split into sections (each straight side, each corner) so
// `updateVisibility` can lift away whichever sections stand between the
// camera and the ice - the "cutaway" a broadcast-style low angle needs, while
// the far stands stay put as the backdrop.
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RenderQuality } from '@/render/quality';
import {
  BOARD_THICKNESS,
  CLUB_DEPTH,
  CLUB_FASCIA_HEIGHT,
  CORNER_RADIUS,
  LOWER_FIRST_ROW_Y,
  LOWER_RISE,
  LOWER_ROWS,
  ROOF_Y,
  ROW_DEPTH,
  SEAT_SPACING,
  UPPER_RISE,
  UPPER_ROWS,
  WALKWAY,
  perimeter,
  seededRandom,
  sweep,
  type ProfilePoint,
  type Station,
} from './layout';

export const BOWL_FRONT = BOARD_THICKNESS + WALKWAY;
const LOWER_TOP_OUT = BOWL_FRONT + LOWER_ROWS * ROW_DEPTH;
const LOWER_TOP_Y = LOWER_FIRST_ROW_Y + (LOWER_ROWS - 1) * LOWER_RISE;
const CLUB_Y = LOWER_TOP_Y + LOWER_RISE;
const UPPER_FRONT_OUT = LOWER_TOP_OUT + CLUB_DEPTH;
const UPPER_FIRST_Y = CLUB_Y + CLUB_FASCIA_HEIGHT;
export const BOWL_BACK = UPPER_FRONT_OUT + UPPER_ROWS * ROW_DEPTH;
export const BOWL_TOP_Y = UPPER_FIRST_Y + (UPPER_ROWS - 1) * UPPER_RISE;

const AISLE_WIDTH = 1.15;
/** Aisle positions on each straight, in metres along it from its own midpoint. */
const SIDE_AISLES = [-25.5, -17, -8.5, 0, 8.5, 17, 25.5];
const END_AISLES = [0];
/** Aisle angles within each corner quarter. */
const CORNER_AISLES = [Math.PI / 6, Math.PI / 3];

type SectionKind = 'near' | 'far' | 'end-left' | 'end-right' | 'corner';

function sectionOf(st: Station): string {
  if (st.nz > 0.999) return 'near';
  if (st.nz < -0.999) return 'far';
  if (st.nx > 0.999) return 'end-right';
  if (st.nx < -0.999) return 'end-left';
  return `corner:${Math.sign(st.nx)}:${Math.sign(st.nz)}`;
}

/** Whether a seat at this station and row offset falls in an aisle. */
function inAisle(st: Station, offset: number): boolean {
  const kind = sectionOf(st);
  if (kind === 'near' || kind === 'far') return SIDE_AISLES.some(a => Math.abs(st.x - a) < AISLE_WIDTH / 2);
  if (kind === 'end-left' || kind === 'end-right') return END_AISLES.some(a => Math.abs(st.z - a) < AISLE_WIDTH / 2);
  const angle = Math.atan2(Math.abs(st.nz), Math.abs(st.nx));
  const radius = CORNER_RADIUS + offset;
  return CORNER_AISLES.some(a => Math.abs(angle - a) * radius < AISLE_WIDTH / 2);
}

/** Splits a closed station loop into runs of one section kind; each run shares its boundary stations. */
function splitRuns(stations: Station[]): { key: string; stations: Station[] }[] {
  const runs: { key: string; stations: Station[] }[] = [];
  for (let i = 0; i < stations.length; i++) {
    const key = sectionOf(stations[i]);
    const current = runs[runs.length - 1];
    if (!current || current.key !== key) {
      // Start a new run, beginning at the previous station so runs meet without a gap.
      runs.push({ key, stations: i > 0 ? [stations[i - 1], stations[i]] : [stations[i]] });
    } else {
      current.stations.push(stations[i]);
    }
  }
  return runs.filter(run => run.stations.length > 1);
}

/** The low-poly stadium seat: pan and tilted back, ~10 triangles, facing local +z. */
function seatGeometry(): THREE.BufferGeometry {
  const w = 0.23;
  const quads: number[][] = [
    // pan top
    [-w, 0.44, -0.04, w, 0.44, -0.04, w, 0.44, 0.38, -w, 0.44, 0.38],
    // pan front
    [-w, 0.44, 0.38, w, 0.44, 0.38, w, 0.34, 0.4, -w, 0.34, 0.4],
    // back, front face
    [-w, 0.88, -0.17, w, 0.88, -0.17, w, 0.47, -0.08, -w, 0.47, -0.08],
    // back, top edge
    [-w, 0.88, -0.22, w, 0.88, -0.22, w, 0.88, -0.17, -w, 0.88, -0.17],
    // back, rear face
    [-w, 0.42, -0.13, w, 0.42, -0.13, w, 0.88, -0.22, -w, 0.88, -0.22],
  ];
  const positions: number[] = [];
  for (const q of quads) {
    const v = (i: number) => q.slice(i * 3, i * 3 + 3);
    // Two triangles, wound so the face points the way the quad is listed.
    positions.push(...v(0), ...v(2), ...v(1), ...v(0), ...v(3), ...v(2));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function lowerProfileSegments(): { treads: ProfilePoint[][]; risers: ProfilePoint[][] } {
  const treads: ProfilePoint[][] = [];
  const risers: ProfilePoint[][] = [];
  // Front wall of the lower bowl, facing the ice.
  risers.push([{ out: BOWL_FRONT, up: 0 }, { out: BOWL_FRONT, up: LOWER_FIRST_ROW_Y }]);
  for (let i = 0; i < LOWER_ROWS; i++) {
    const y = LOWER_FIRST_ROW_Y + i * LOWER_RISE;
    const o0 = BOWL_FRONT + i * ROW_DEPTH;
    treads.push([{ out: o0, up: y }, { out: o0 + ROW_DEPTH, up: y }]);
    const next = i < LOWER_ROWS - 1 ? y + LOWER_RISE : CLUB_Y;
    risers.push([{ out: o0 + ROW_DEPTH, up: y }, { out: o0 + ROW_DEPTH, up: next }]);
  }
  // Club walkway.
  treads.push([{ out: LOWER_TOP_OUT, up: CLUB_Y }, { out: UPPER_FRONT_OUT, up: CLUB_Y }]);
  for (let i = 0; i < UPPER_ROWS; i++) {
    const y = UPPER_FIRST_Y + i * UPPER_RISE;
    const o0 = UPPER_FRONT_OUT + i * ROW_DEPTH;
    treads.push([{ out: o0, up: y }, { out: o0 + ROW_DEPTH, up: y }]);
    if (i < UPPER_ROWS - 1) risers.push([{ out: o0 + ROW_DEPTH, up: y }, { out: o0 + ROW_DEPTH, up: y + UPPER_RISE }]);
  }
  return { treads, risers };
}

function createRibbonTexture(): THREE.Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#081a33');
  g.addColorStop(1, '#03101f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2048, 64);
  const items = ['PHORMATION', 'PRACTICE IN PROGRESS', 'HOME 0', 'AWAY 0', 'PERIOD 1', 'DRILL MODE'];
  ctx.font = '900 34px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  let x = 30;
  let i = 0;
  while (x < 2048) {
    const text = items[i % items.length];
    ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#f8fafc';
    ctx.fillText(text, x, 34);
    x += ctx.measureText(text).width + 40;
    ctx.fillStyle = '#f0c419';
    ctx.fillRect(x - 24, 26, 8, 14);
    x += 10;
    i++;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function createSuiteTexture(): THREE.Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#10151b';
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 4; i++) {
    const warm = ctx.createLinearGradient(0, 8, 0, 56);
    warm.addColorStop(0, '#f7d9a8');
    warm.addColorStop(1, '#a8794a');
    ctx.fillStyle = warm;
    ctx.fillRect(i * 64 + 4, 10, 56, 44);
    ctx.fillStyle = 'rgba(16,21,27,0.85)';
    ctx.fillRect(i * 64 + 30, 10, 3, 44);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

export interface BowlSection {
  group: THREE.Group;
  box: THREE.Box3;
}

export interface Bowl {
  root: THREE.Group;
  sections: BowlSection[];
  dispose(): void;
}

export function createBowl(quality: RenderQuality): Bowl {
  const root = new THREE.Group();
  root.name = 'bowl';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const mat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const tread = mat(new THREE.MeshStandardMaterial({ color: 0x5f666f, roughness: 0.92 }));
  const riser = mat(new THREE.MeshStandardMaterial({ color: 0x343a42, roughness: 0.9 }));
  const wall = mat(new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.85 }));
  const ribbonTexture = createRibbonTexture();
  if (ribbonTexture) textures.push(ribbonTexture);
  const ribbon = mat(new THREE.MeshBasicMaterial({ color: ribbonTexture ? 0xc8d4e0 : 0x0b2545, map: ribbonTexture }));
  const suiteTexture = createSuiteTexture();
  if (suiteTexture) textures.push(suiteTexture);
  const suites = mat(new THREE.MeshBasicMaterial({ color: suiteTexture ? 0x9a8f80 : 0x3a2f22, map: suiteTexture }));
  const seatMaterial = mat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  const seatGeo = seatGeometry();
  geometries.push(seatGeo);

  const { treads, risers } = lowerProfileSegments();
  const loop = perimeter(BOWL_FRONT, 0.9, 16);
  const runs = splitRuns(loop);
  const random = seededRandom(2024);
  const seatColours = [new THREE.Color(0x1d3557), new THREE.Color(0x22406a), new THREE.Color(0x182c48)];
  const upperColours = [new THREE.Color(0x2b2f36), new THREE.Color(0x30353d)];
  const seatsWanted: 'all' | 'lower' | 'none' = quality === 'high' ? 'all' : quality === 'medium' ? 'lower' : 'none';
  const sections: BowlSection[] = [];

  for (const run of runs) {
    const group = new THREE.Group();
    group.name = `bowl-${run.key}`;
    // Each tier is swept at its own offset, along this run's slice of the loop.
    const slice = (offset: number): Station[] => {
      // The same arc of the building at a different offset: re-derive
      // stations by projecting this run's stations outward.
      return run.stations.map(st => ({ ...st, x: st.x + st.nx * (offset - BOWL_FRONT), z: st.z + st.nz * (offset - BOWL_FRONT) }));
    };
    const base = slice(BOWL_FRONT);
    const sweepAt = (profile: ProfilePoint[]) => {
      // Profiles carry absolute offsets; the base stations sit at BOWL_FRONT.
      const shifted = profile.map(p => ({ out: p.out - BOWL_FRONT, up: p.up }));
      return sweep(base, shifted);
    };
    const add = (list: THREE.BufferGeometry[], material: THREE.Material, name: string, shadows = false) => {
      const merged = mergeGeometries(list);
      for (const g of list) g.dispose();
      if (!merged) return;
      geometries.push(merged);
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = name;
      mesh.receiveShadow = shadows;
      group.add(mesh);
    };
    add(treads.map(sweepAt), tread, 'treads');
    add(risers.map(sweepAt), riser, 'risers');
    // Ribbon board on the club fascia.
    const fascia = sweepAt([{ out: UPPER_FRONT_OUT, up: CLUB_Y }, { out: UPPER_FRONT_OUT, up: UPPER_FIRST_Y }]);
    const uv = fascia.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, -uv.getX(i) / 40);
    add([fascia], ribbon, 'ribbon-board');
    // Back wall up to the roof with the suite level band.
    const suiteBottom = BOWL_TOP_Y + 2.4;
    const suiteTop = suiteBottom + 2.2;
    add(
      [
        sweepAt([{ out: BOWL_BACK, up: BOWL_TOP_Y }, { out: BOWL_BACK, up: suiteBottom }]),
        sweepAt([{ out: BOWL_BACK, up: suiteTop }, { out: BOWL_BACK, up: ROOF_Y }]),
      ],
      wall,
      'back-wall'
    );
    const suiteBand = sweepAt([{ out: BOWL_BACK - 0.02, up: suiteBottom }, { out: BOWL_BACK - 0.02, up: suiteTop }]);
    const suv = suiteBand.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < suv.count; i++) suv.setX(i, -suv.getX(i) / 9);
    add([suiteBand], suites, 'suites');

    // Seats.
    if (seatsWanted !== 'none') {
      const placements: { st: Station; offset: number; y: number; colour: THREE.Color }[] = [];
      const rows: { offset: number; y: number; upper: boolean }[] = [];
      for (let i = 0; i < LOWER_ROWS; i++) {
        rows.push({ offset: BOWL_FRONT + i * ROW_DEPTH + ROW_DEPTH * 0.52, y: LOWER_FIRST_ROW_Y + i * LOWER_RISE, upper: false });
      }
      if (seatsWanted === 'all') {
        for (let i = 0; i < UPPER_ROWS; i++) {
          rows.push({ offset: UPPER_FRONT_OUT + i * ROW_DEPTH + ROW_DEPTH * 0.52, y: UPPER_FIRST_Y + i * UPPER_RISE, upper: true });
        }
      }
      for (const row of rows) {
        // Evenly spaced seats along this run at this row's offset.
        const shifted = slice(row.offset);
        let carry = 0;
        for (let i = 0; i < shifted.length - 1; i++) {
          const a = shifted[i];
          const b = shifted[i + 1];
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          let t = carry;
          while (t < len) {
            const f = t / len;
            const nx = a.nx + (b.nx - a.nx) * f;
            const nz = a.nz + (b.nz - a.nz) * f;
            const nl = Math.hypot(nx, nz) || 1;
            const st: Station = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, nx: nx / nl, nz: nz / nl, s: 0 };
            if (!inAisle(st, row.offset)) {
              const palette = row.upper ? upperColours : seatColours;
              const colour = palette[Math.floor(random() * palette.length)];
              placements.push({ st, offset: row.offset, y: row.y, colour });
            }
            t += SEAT_SPACING;
          }
          carry = t - len;
        }
      }
      if (placements.length) {
        const seats = new THREE.InstancedMesh(seatGeo, seatMaterial, placements.length);
        seats.name = 'seats';
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const yAxis = new THREE.Vector3(0, 1, 0);
        const p = new THREE.Vector3();
        const one = new THREE.Vector3(1, 1, 1);
        placements.forEach((pl, i) => {
          q.setFromAxisAngle(yAxis, Math.atan2(-pl.st.nx, -pl.st.nz));
          p.set(pl.st.x, pl.y, pl.st.z);
          m4.compose(p, q, one);
          seats.setMatrixAt(i, m4);
          seats.setColorAt(i, pl.colour);
        });
        seats.computeBoundingBox();
        seats.computeBoundingSphere();
        group.add(seats);
      }
    }

    const box = new THREE.Box3().setFromObject(group);
    sections.push({ group, box });
    root.add(group);
  }

  return {
    root,
    sections,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}

export type { SectionKind };
