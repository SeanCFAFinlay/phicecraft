// ============================================================================
// ROOF, LIGHTS AND SCOREBOARD
//
// What hangs over the ice: the roof deck, steel trusses spanning the
// building, the catwalks, the grid of LED sports lights over the sheet, and
// a centre-hung scoreboard. The light fixtures are genuinely bright
// (emissive, well above 1.0), so they show up in the ice's reflection once
// the arena is captured into the environment map, and bloom in the high
// tier's post-processing.
//
// None of this may block the view of the ice: Arena.update hides the roof
// whenever the camera is above the light grid (the tabletop views look down
// through an open roof), and the scoreboard whenever the camera is above its
// bottom edge.
// ============================================================================

import * as THREE from 'three';
import type { RenderQuality } from '@/render/quality';
import { CORNER_RADIUS, ICE_LENGTH, ICE_WIDTH, LIGHT_GRID_Y, ROOF_Y, SCOREBOARD_BOTTOM_Y } from './layout';
import { BOWL_BACK } from './bowl';

export interface Roof {
  /** Roof deck, trusses, catwalks and light grid. */
  roof: THREE.Group;
  scoreboard: THREE.Group;
  dispose(): void;
}

function roundedRectShape(halfLength: number, halfWidth: number, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-halfLength + radius, -halfWidth);
  s.lineTo(halfLength - radius, -halfWidth);
  s.absarc(halfLength - radius, -halfWidth + radius, radius, -Math.PI / 2, 0, false);
  s.lineTo(halfLength, halfWidth - radius);
  s.absarc(halfLength - radius, halfWidth - radius, radius, 0, Math.PI / 2, false);
  s.lineTo(-halfLength + radius, halfWidth);
  s.absarc(-halfLength + radius, halfWidth - radius, radius, Math.PI / 2, Math.PI, false);
  s.lineTo(-halfLength, -halfWidth + radius);
  s.absarc(-halfLength + radius, -halfWidth + radius, radius, Math.PI, Math.PI * 1.5, false);
  return s;
}

function scoreboardScreen(face: number): THREE.Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const bg = ctx.createLinearGradient(0, 0, 0, 300);
  bg.addColorStop(0, '#071a33');
  bg.addColorStop(1, '#020812');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 300);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (face % 2 === 0) {
    // Score face.
    ctx.fillStyle = '#c3102f';
    ctx.fillRect(18, 22, 220, 56);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(274, 22, 220, 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 34px Arial, sans-serif';
    ctx.fillText('HOME', 128, 51);
    ctx.fillText('AWAY', 384, 51);
    ctx.font = '900 110px Arial, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('0', 128, 160);
    ctx.fillText('0', 384, 160);
    ctx.fillStyle = '#f0c419';
    ctx.font = '900 64px "Courier New", monospace';
    ctx.fillText('20:00', 256, 250);
    ctx.font = '700 24px Arial, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('PERIOD 1', 256, 160);
  } else {
    // Brand face.
    ctx.fillStyle = '#38bdf8';
    ctx.font = '900 64px Arial, sans-serif';
    ctx.fillText('PHORMATION', 256, 120, 470);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 28px Arial, sans-serif';
    ctx.fillText('PRACTICE  ·  DRILL MODE', 256, 190);
    ctx.fillStyle = 'rgba(56,189,248,0.4)';
    ctx.fillRect(60, 225, 392, 4);
  }
  // LED pixel pitch: faint scanlines read as a real screen up close.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 300; y += 3) ctx.fillRect(0, y, 512, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createRoof(quality: RenderQuality): Roof {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T): T => {
    geometries.push(x);
    return x;
  };
  const m = <T extends THREE.Material>(x: T): T => {
    materials.push(x);
    return x;
  };

  const roof = new THREE.Group();
  roof.name = 'roof';

  // Deck: faces down only, so it never hides anything from above.
  const halfL = ICE_LENGTH / 2 + BOWL_BACK;
  const halfW = ICE_WIDTH / 2 + BOWL_BACK;
  const deckGeometry = g(new THREE.ShapeGeometry(roundedRectShape(halfL, halfW, CORNER_RADIUS + BOWL_BACK), 16));
  deckGeometry.rotateX(Math.PI / 2);
  const deck = new THREE.Mesh(deckGeometry, m(new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.95 })));
  deck.position.y = ROOF_Y;
  deck.name = 'roof-deck';
  roof.add(deck);

  // Trusses across the width: top and bottom chords and diagonal lacing.
  const steel = m(new THREE.MeshStandardMaterial({ color: 0x2b323b, roughness: 0.7, metalness: 0.4 }));
  const spans: THREE.Matrix4[] = [];
  const m4 = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));
  const trussDepth = 2.2;
  const span = halfW * 2 - 2;
  for (let x = -halfL + 6; x <= halfL - 6; x += 7.5) {
    const top = ROOF_Y - 0.4;
    const bottom = top - trussDepth;
    spans.push(m4(x, top, 0, 0.25, 0.25, span));
    spans.push(m4(x, bottom, 0, 0.25, 0.25, span));
    // Diagonals every 2.4 m.
    const panels = Math.floor(span / 2.4);
    for (let i = 0; i < panels; i++) {
      const z = -span / 2 + (i + 0.5) * (span / panels);
      const lean = i % 2 === 0 ? 1 : -1;
      spans.push(m4(x, (top + bottom) / 2, z, 0.08, Math.hypot(trussDepth, span / panels), 0.08, lean * Math.atan2(span / panels, trussDepth)));
    }
  }
  // Catwalks along the length over the ice.
  for (const z of [-ICE_WIDTH * 0.3, ICE_WIDTH * 0.3]) {
    spans.push(new THREE.Matrix4().compose(new THREE.Vector3(0, LIGHT_GRID_Y + 0.9, z), new THREE.Quaternion(), new THREE.Vector3(halfL * 1.8, 0.12, 1.0)));
    for (const side of [-0.5, 0.5]) {
      spans.push(new THREE.Matrix4().compose(new THREE.Vector3(0, LIGHT_GRID_Y + 1.9, z + side), new THREE.Quaternion(), new THREE.Vector3(halfL * 1.8, 0.05, 0.05)));
    }
  }
  const unitBox = g(new THREE.BoxGeometry(1, 1, 1));
  const steelMesh = new THREE.InstancedMesh(unitBox, steel, spans.length);
  spans.forEach((matrix, i) => steelMesh.setMatrixAt(i, matrix));
  steelMesh.name = 'trusses';
  roof.add(steelMesh);

  // Sports lighting: rows of LED fixtures over the ice, slightly outside it too.
  const housing = m(new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.6, metalness: 0.3 }));
  const lamp = m(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.94).multiplyScalar(quality === 'low' ? 1.5 : 6) }));
  const fixtures: THREE.Matrix4[] = [];
  const cols = 14;
  const rows = 6;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -ICE_LENGTH * 0.47 + (c / (cols - 1)) * ICE_LENGTH * 0.94;
      const z = -ICE_WIDTH * 0.42 + (r / (rows - 1)) * ICE_WIDTH * 0.84;
      fixtures.push(new THREE.Matrix4().makeTranslation(x, LIGHT_GRID_Y, z));
    }
  }
  const housingGeo = g(new THREE.BoxGeometry(0.9, 0.22, 0.55));
  const lampGeo = g(new THREE.PlaneGeometry(0.78, 0.44));
  lampGeo.rotateX(Math.PI / 2); // facing down
  lampGeo.translate(0, -0.115, 0);
  const housings = new THREE.InstancedMesh(housingGeo, housing, fixtures.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lamp, fixtures.length);
  fixtures.forEach((matrix, i) => {
    housings.setMatrixAt(i, matrix);
    lamps.setMatrixAt(i, matrix);
  });
  housings.name = 'light-housings';
  lamps.name = 'light-lamps';
  roof.add(housings, lamps);

  // --- Centre-hung scoreboard --------------------------------------------
  const scoreboard = new THREE.Group();
  scoreboard.name = 'scoreboard';
  const W = 7.6;
  const D = 5.4;
  const H = 4.4;
  const yMid = SCOREBOARD_BOTTOM_Y + 1.2 + H / 2;
  const frame = m(new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 0.5, metalness: 0.5 }));
  const body = new THREE.Mesh(g(new THREE.BoxGeometry(W - 0.1, H + 0.4, D - 0.1)), frame);
  body.position.y = yMid;
  scoreboard.add(body);
  for (let face = 0; face < 4; face++) {
    const texture = scoreboardScreen(face);
    if (texture) textures.push(texture);
    const width = face % 2 === 0 ? W : D;
    const screenMat = m(new THREE.MeshBasicMaterial({ color: texture ? new THREE.Color(1.6, 1.6, 1.6) : 0x0b2545, map: texture }));
    const screen = new THREE.Mesh(g(new THREE.PlaneGeometry(width - 0.3, H - 0.2)), screenMat);
    const angle = (face * Math.PI) / 2;
    const dist = (face % 2 === 0 ? D : W) / 2 + 0.01;
    screen.position.set(Math.sin(angle) * dist, yMid, Math.cos(angle) * dist);
    screen.rotation.y = angle;
    scoreboard.add(screen);
  }
  // LED rings above and below the main screens, and a smaller lower bowl.
  const ringMat = m(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.75, 1.4) }));
  for (const y of [yMid + H / 2 + 0.35, yMid - H / 2 - 0.3]) {
    const ring = new THREE.Mesh(g(new THREE.BoxGeometry(W + 0.05, 0.28, D + 0.05)), ringMat);
    ring.position.y = y;
    scoreboard.add(ring);
  }
  const lower = new THREE.Mesh(g(new THREE.CylinderGeometry(2.2, 1.8, 1.1, 24)), frame);
  lower.position.y = SCOREBOARD_BOTTOM_Y + 0.55;
  scoreboard.add(lower);
  const lowerRing = new THREE.Mesh(g(new THREE.CylinderGeometry(2.21, 2.21, 0.3, 24, 1, true)), ringMat);
  lowerRing.position.y = SCOREBOARD_BOTTOM_Y + 0.9;
  scoreboard.add(lowerRing);
  // Rigging up to the roof.
  const cableMat = m(new THREE.MeshStandardMaterial({ color: 0x3b4450, roughness: 0.5, metalness: 0.7 }));
  const cableLength = ROOF_Y - (yMid + H / 2);
  const cableGeo = g(new THREE.CylinderGeometry(0.025, 0.025, cableLength, 6));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cable = new THREE.Mesh(cableGeo, cableMat);
      cable.position.set((sx * W) / 2.6, yMid + H / 2 + cableLength / 2, (sz * D) / 2.6);
      scoreboard.add(cable);
    }
  }

  return {
    roof,
    scoreboard,
    dispose() {
      for (const x of geometries) x.dispose();
      for (const x of materials) x.dispose();
      for (const x of textures) x.dispose();
    },
  };
}
