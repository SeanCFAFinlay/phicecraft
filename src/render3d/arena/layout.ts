// ============================================================================
// ARENA LAYOUT
//
// Every measurement the 3D arena is built from, in metres (one world unit is
// one metre: `RINK_SCALE` turns the 200 ft rink into a 61 m sheet), plus the
// two geometric tools the rest of the arena leans on:
//
//   - `perimeter(offset)`: the rink's rounded-rectangle outline pushed out by
//     `offset` metres, sampled into evenly spaced stations, each with its
//     outward normal and running arc length. Boards, glass, stanchions, the
//     seating bowl and the ribbon boards all follow this same outline, so the
//     whole building stays concentric with the ice.
//   - `sweep(stations, strips)`: runs a 2D cross-section (out, up) along a
//     list of stations, producing one BufferGeometry per strip. Strips are
//     separate so a hard crease between them (the edge of the cap rail, the
//     lip of a seating step) stays sharp while each strip shades smoothly
//     along the curve of the corners.
// ============================================================================

import * as THREE from 'three';
import { RINK } from '@/core/constants';
import { RINK_SCALE } from '../worldMap';

/** The playing surface, in metres. */
export const ICE_LENGTH = RINK.width * RINK_SCALE;
export const ICE_WIDTH = RINK.height * RINK_SCALE;
export const CORNER_RADIUS = RINK.cornerRadius * RINK_SCALE;

/** Dasher boards: 42 in tall, the regulation yellow kick plate at the bottom. */
export const BOARD_HEIGHT = 1.07;
export const KICKPLATE_HEIGHT = 0.24;
export const BOARD_THICKNESS = 0.2;
/** The rounded cap rail that runs along the top of the boards. */
export const CAP_WIDTH = 0.3;
export const CAP_HEIGHT = 0.07;

/** Glass: 5 ft along the sides, 8 ft behind each net. */
export const SIDE_GLASS_HEIGHT = 1.52;
export const END_GLASS_HEIGHT = 2.44;
/** Typical pane width between stanchions. */
export const GLASS_PANE_WIDTH = 2.44;

/** The walkway between the back of the boards and the first row of seats. */
export const WALKWAY = 2.4;
/** Seating geometry. */
export const ROW_DEPTH = 0.86;
export const LOWER_ROWS = 18;
export const LOWER_RISE = 0.38;
export const LOWER_FIRST_ROW_Y = 1.15;
export const CLUB_DEPTH = 2.6;
export const CLUB_FASCIA_HEIGHT = 1.4;
export const UPPER_ROWS = 15;
export const UPPER_RISE = 0.56;
export const SEAT_SPACING = 0.54;

/** The building itself. */
export const ROOF_Y = 31;
export const LIGHT_GRID_Y = 25.5;
export const SCOREBOARD_BOTTOM_Y = 15.5;

export interface Station {
  x: number;
  z: number;
  /** Outward unit normal (away from centre ice), in the XZ plane. */
  nx: number;
  nz: number;
  /** Arc length from the start of the loop, in metres. */
  s: number;
}

/**
 * The rink outline pushed out by `offset` metres, as evenly spaced stations.
 * The loop starts at the middle of the near (+z) side and runs anticlockwise
 * seen from above, and is closed: the last station repeats the first, with
 * `s` equal to the full loop length, so a sweep wraps without a seam.
 */
export function perimeter(offset: number, spacing = 0.5, arcSegments = 24): Station[] {
  const hl = ICE_LENGTH / 2 + offset;
  const hw = ICE_WIDTH / 2 + offset;
  const r = Math.max(0.01, CORNER_RADIUS + offset);
  const sx = hl - r;
  const sz = hw - r;

  // Corner centres, visited in order, with the angle each arc starts at.
  // Angles are measured in the XZ plane: (cos a, sin a) -> (x, z).
  const corners = [
    { cx: sx, cz: sz, a0: Math.PI / 2 },
    { cx: sx, cz: -sz, a0: 0 },
    { cx: -sx, cz: -sz, a0: -Math.PI / 2 },
    { cx: -sx, cz: sz, a0: Math.PI },
  ];

  const raw: { x: number; z: number; nx: number; nz: number }[] = [];
  const pushLine = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      raw.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, nx, nz });
    }
  };
  const pushArc = (cx: number, cz: number, a0: number) => {
    // Clockwise in angle (a0 -> a0 - PI/2), which runs anticlockwise on screen
    // once world +z is "down" in the overhead view.
    for (let i = 0; i < arcSegments; i++) {
      const a = a0 - (i / arcSegments) * (Math.PI / 2);
      raw.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) });
    }
  };

  // Near side (+z), from the middle toward +x.
  pushLine(0, hw, sx, hw, 0, 1);
  pushArc(corners[0].cx, corners[0].cz, corners[0].a0);
  pushLine(hl, sz, hl, -sz, 1, 0);
  pushArc(corners[1].cx, corners[1].cz, corners[1].a0);
  pushLine(sx, -hw, -sx, -hw, 0, -1);
  pushArc(corners[2].cx, corners[2].cz, corners[2].a0);
  pushLine(-hl, -sz, -hl, sz, -1, 0);
  pushArc(corners[3].cx, corners[3].cz, corners[3].a0);
  pushLine(-sx, hw, 0, hw, 0, 1);

  const stations: Station[] = [];
  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) s += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    stations.push({ ...raw[i], s });
  }
  const first = raw[0];
  const last = raw[raw.length - 1];
  s += Math.hypot(first.x - last.x, first.z - last.z);
  stations.push({ ...first, s });
  return stations;
}

/** The full length of the outline at `offset`, in metres. */
export function perimeterLength(offset: number): number {
  const r = Math.max(0.01, CORNER_RADIUS + offset);
  return 2 * (ICE_LENGTH + 2 * offset - 2 * r) + 2 * (ICE_WIDTH + 2 * offset - 2 * r) + 2 * Math.PI * r;
}

/** One point of a cross-section: `out` metres outward from the station, `up` metres above the ice. */
export interface ProfilePoint {
  out: number;
  up: number;
}

export interface SweepOptions {
  /** Metres of arc length per unit of U texture coordinate. Default 1. */
  uScale?: number;
  /** Flip the winding so the strip's other face is the front. */
  flip?: boolean;
}

/**
 * Runs `profile` along `stations`. Normals across the profile come from the
 * profile's own segments (averaged at interior points, so a curved cap reads
 * as curved), combined with each station's outward normal. U runs along the
 * loop (arc length / uScale); V runs 0..1 across the profile.
 *
 * The front face is the one you see when the profile is walked with the
 * visible side on its LEFT (in out/up coordinates, looking along the loop).
 */
export function sweep(stations: Station[], profile: ProfilePoint[], options: SweepOptions = {}): THREE.BufferGeometry {
  const uScale = options.uScale ?? 1;
  const n = profile.length;
  // Profile-space normals: the left-hand perpendicular of each segment.
  const segNormals: { o: number; u: number }[] = [];
  const lengths = [0];
  for (let j = 0; j < n - 1; j++) {
    const dOut = profile[j + 1].out - profile[j].out;
    const dUp = profile[j + 1].up - profile[j].up;
    const len = Math.hypot(dOut, dUp) || 1;
    segNormals.push({ o: -dUp / len, u: dOut / len });
    lengths.push(lengths[j] + len);
  }
  const total = lengths[n - 1] || 1;
  const pointNormals = profile.map((_, j) => {
    const a = segNormals[Math.max(0, j - 1)];
    const b = segNormals[Math.min(segNormals.length - 1, j)];
    const o = a.o + b.o;
    const u = a.u + b.u;
    const len = Math.hypot(o, u) || 1;
    const sign = options.flip ? -1 : 1;
    return { o: (o / len) * sign, u: (u / len) * sign };
  });

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const st of stations) {
    for (let j = 0; j < n; j++) {
      const p = profile[j];
      positions.push(st.x + st.nx * p.out, p.up, st.z + st.nz * p.out);
      const pn = pointNormals[j];
      normals.push(st.nx * pn.o, pn.u, st.nz * pn.o);
      uvs.push(st.s / uScale, lengths[j] / total);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = (i + 1) * n + j;
      const c = (i + 1) * n + j + 1;
      const d = i * n + j + 1;
      // Stations run toward +x along the near side, so this winding faces
      // the profile's left-hand side (inward for a profile walked upward).
      if (options.flip) indices.push(a, b, d, b, c, d);
      else indices.push(a, d, b, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A deterministic 0..1 generator, so every build of the arena is identical. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
