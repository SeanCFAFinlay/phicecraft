// ============================================================================
// RINK SCENE — WebGL static scene graph
//
// Builds the flat rink ONCE as a Pixi scene graph, mirroring `drawRink`'s
// non-elevated path (`src/canvas/RinkRenderer.ts`) feature-group by feature-
// group: ice surface, zone tints, the centre-ice crest, line markings, board
// fixtures, the boards themselves, and the goals. `WebGLRenderer` re-renders
// this SAME graph every frame under a camera transform
// (`container.setFromMatrix`); nothing here is rebuilt per frame.
//
// The tabletop arena (`drawArenaBase` / `drawArenaWalls`, the raised-boards
// "spin around" view) is NOT ported — see WebGLRenderer's canvasFallback path,
// which reuses the existing Canvas2D functions for that camera range instead.
//
// Deliberately trimmed from the Canvas2D original, since neither is in the
// brief's enumerated feature groups and both are canvas-only effects with no
// direct Pixi Graphics equivalent short of a new dependency:
//   - the decorative ice-sheen detail (resurfacing lanes, skate scratches, the
//     radial light bloom over the crest), and
//   - the canvas `shadowBlur` drop-shadow under the boards (approximated below
//     with a plain dark underlay, no blur), and the goal net's clipped
//     diagonal mesh texture (kept: net bag silhouette, red frame, crossbar,
//     post caps; dropped: the mesh lines inside it).
// These are visual simplifications, not functional gaps — this task's Pixi
// baseline is its own (`e2e/__screenshots__/visual-webgl-shell`), not a diff
// against the Canvas2D baseline, so pixel parity was never the bar.
//
// Corner rounding: the rink's rounded corners matter for anything that spans
// the full ice height at an x near a corner (the goal/blue/centre lines) —
// left untrimmed, they would poke past the rounded boards into the
// transparent area beyond. The ice surface itself uses `roundRect` directly
// (exact, no clip needed); the full-height line markings are trimmed
// analytically instead of masked (see the "Line markings" section below for
// why: a Container mask needs a stencil buffer a WebGL context is not
// guaranteed to have, and this task's own Playwright baseline is generated
// under exactly the software/headless GL a mask can silently fail against).
// Zone tints are the one exception left un-clipped (square outer corners on a
// faint, low-alpha gradient) — small enough not to be worth trimming.
// ============================================================================

import { Container, Graphics, Text, FillGradient, type TextStyleOptions } from 'pixi.js';
import { RINK, RINK_MARKS as M, COLORS, FT } from '@/core/constants';

/** Text is baked into the static scene at this resolution so labels and the centre crest stay crisp when zoomed. */
const TEXT_RESOLUTION = 2;

// ----------------------------------------------------------------------------
// Ice surface
// ----------------------------------------------------------------------------

function buildIceSurface(): Graphics {
  const { x, y, width, height, cornerRadius } = RINK;
  const gradient = new FillGradient({
    colorStops: [
      { offset: 0, color: COLORS.ice.light },
      { offset: 0.5, color: COLORS.ice.mid },
      { offset: 1, color: COLORS.ice.dark },
    ],
  });
  return new Graphics({ label: 'ice-surface' }).roundRect(x, y, width, height, cornerRadius).fill(gradient);
}

// ----------------------------------------------------------------------------
// Zone tints — very faint end-zone tints, home red and away blue.
// ----------------------------------------------------------------------------

function buildZoneTint(rectX: number, rectWidth: number, nearOffset: 0 | 1, nearColor: string): Graphics {
  const { y, height } = RINK;
  const farOffset = nearOffset === 0 ? 1 : 0;
  const gradient = new FillGradient({
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: nearOffset, color: nearColor },
      { offset: farOffset, color: 'rgba(0, 0, 0, 0)' },
    ],
  });
  return new Graphics().rect(rectX, y, rectWidth, height).fill(gradient);
}

function buildZoneTints(): Container {
  const { x, width, blueLineLeftX, blueLineRightX } = RINK;
  const container = new Container({ label: 'zone-tints' });
  container.addChild(buildZoneTint(x, blueLineLeftX - x, 0, 'rgba(200, 40, 55, 0.05)'));
  container.addChild(
    buildZoneTint(blueLineRightX, x + width - blueLineRightX, 1, 'rgba(48, 128, 237, 0.05)')
  );
  return container;
}

// ----------------------------------------------------------------------------
// Centre-ice crest
// ----------------------------------------------------------------------------

/** A string of characters spread along the top arc of a circle, one Text per glyph. */
function buildArcText(text: string, radius: number, anglePer: number, style: TextStyleOptions): Container {
  const container = new Container({ label: 'arc-text' });
  const start = -Math.PI / 2 - ((text.length - 1) * anglePer) / 2;
  for (let i = 0; i < text.length; i++) {
    const a = start + i * anglePer;
    const glyph = new Text({ text: text[i], style, resolution: TEXT_RESOLUTION });
    glyph.anchor.set(0.5);
    glyph.position.set(radius * Math.cos(a), radius * Math.sin(a));
    glyph.rotation = a + Math.PI / 2;
    container.addChild(glyph);
  }
  return container;
}

function buildCenterLogo(): Container {
  const { centerX: cx, centerY: cy } = RINK;
  const R = 19 * FT;
  const logo = new Container({ label: 'center-logo' });
  logo.position.set(cx, cy);
  logo.alpha = 0.62;

  const rings = new Graphics()
    .circle(0, 0, R)
    .stroke({ color: 'rgba(47, 128, 237, 0.55)', width: 1.6 })
    .circle(0, 0, R * 0.9)
    .stroke({ color: 'rgba(22, 163, 74, 0.55)', width: 1.6 });
  logo.addChild(rings);

  logo.addChild(
    buildArcText('TRAIN · PLAY · IMPROVE', R * 0.72, 0.115, {
      fontSize: R * 0.14,
      fontWeight: '800',
      fontFamily: 'Arial, sans-serif',
      fill: 'rgba(22, 163, 74, 0.8)',
    })
  );

  const monogram = new Text({
    text: 'PH',
    resolution: TEXT_RESOLUTION,
    style: {
      fontSize: R * 0.9,
      fontWeight: '900',
      fontFamily: '"Arial Black", Arial, sans-serif',
      fill: new FillGradient({
        end: { x: 1, y: 0 },
        colorStops: [
          { offset: 0, color: '#16a34a' },
          { offset: 1, color: '#2f80ed' },
        ],
      }),
      stroke: { color: 'rgba(255, 255, 255, 0.7)', width: R * 0.035 },
    },
  });
  monogram.anchor.set(0.5);
  monogram.position.set(0, -R * 0.04);
  logo.addChild(monogram);

  const wordmark = new Text({
    text: 'HOCKEY PRACTICE',
    resolution: TEXT_RESOLUTION,
    style: {
      fontSize: R * 0.15,
      fontWeight: '800',
      fontFamily: 'Arial, sans-serif',
      fill: 'rgba(30, 41, 59, 0.82)',
    },
  });
  wordmark.anchor.set(0.5);
  wordmark.position.set(0, R * 0.52);
  logo.addChild(wordmark);

  return logo;
}

// ----------------------------------------------------------------------------
// Line markings — goal lines, blue lines, centre line, creases, trapezoids,
// faceoff circles and spots, the referee's crease.
//
// The goal, blue and centre lines run the full ice height, which at an x near
// either end brings them into the rink's rounded corners. The canvas original
// gets this for free from `ctx.clip()`; a Pixi Container mask is the natural
// equivalent but needs a stencil buffer the WebGL context is not guaranteed
// to have (a software/headless context may not - Pixi warns and silently
// stops clipping when it doesn't, which is exactly the failure this file's
// own Playwright baseline surfaced). `iceYRangeAt` computes the same trim
// analytically instead, so it works regardless of GPU/driver support.
// ----------------------------------------------------------------------------

/**
 * The world-y span of the ice surface at world-x `x`, following the rink's
 * rounded corners. Full height away from the corner columns; narrower inside
 * them, per the corner arc.
 */
function iceYRangeAt(x: number): [number, number] {
  const { x: rx, y: ry, width: rw, height: rh, cornerRadius: cr } = RINK;
  const nearLeft = x < rx + cr;
  const nearRight = x > rx + rw - cr;
  if (!nearLeft && !nearRight) return [ry, ry + rh];

  const cornerCenterX = nearLeft ? rx + cr : rx + rw - cr;
  const dx = x - cornerCenterX;
  if (Math.abs(dx) >= cr) return [ry + cr, ry + rh - cr];

  const dy = Math.sqrt(cr * cr - dx * dx);
  return [ry + cr - dy, ry + rh - cr + dy];
}

function buildGoalLines(): Graphics {
  const { goalLineLeftX, goalLineRightX } = RINK;
  const g = new Graphics({ label: 'goal-lines' });
  for (const gx of [goalLineLeftX, goalLineRightX]) {
    const [top, bottom] = iceYRangeAt(gx);
    g.moveTo(gx, top).lineTo(gx, bottom);
  }
  return g.stroke({ color: COLORS.redLine, width: M.lineWidthMinor });
}

function buildBlueLines(): Graphics {
  const { blueLineLeftX, blueLineRightX } = RINK;
  const g = new Graphics({ label: 'blue-lines' });
  for (const bx of [blueLineLeftX, blueLineRightX]) {
    const [top, bottom] = iceYRangeAt(bx);
    g.moveTo(bx, top).lineTo(bx, bottom);
  }
  return g.stroke({ color: COLORS.blueLine, width: M.lineWidthMajor });
}

/** Alternating red/ice dashes, matching the canvas version's dash pattern and phase offset. */
function buildCenterLine(): Graphics {
  const { centerX } = RINK;
  const dashLen = 2 * FT;
  const gapLen = 1.15 * FT;
  const cycle = dashLen + gapLen;
  const offset = 0.4 * FT;
  const [top, bottom] = iceYRangeAt(centerX);

  const g = new Graphics({ label: 'center-line' });
  let cursor = top - offset;
  while (cursor < bottom) {
    const segStart = Math.max(top, cursor);
    const segEnd = Math.min(bottom, cursor + dashLen);
    if (segEnd > segStart) {
      g.moveTo(centerX, segStart).lineTo(centerX, segEnd);
    }
    cursor += cycle;
  }
  return g.stroke({ color: COLORS.redLine, width: M.lineWidthMajor });
}

/** Goal crease: a 6 ft arc off the goal line, 8 ft wide where it meets it. */
function addCreasePath(g: Graphics, goalLineX: number, direction: 1 | -1): void {
  const cy = RINK.centerY;
  const { creaseRadius: r, creaseHalfWidth: hw } = M;
  const a = Math.asin(hw / r);

  g.moveTo(goalLineX, cy - hw);
  if (direction === 1) {
    g.lineTo(goalLineX + Math.cos(a) * r, cy - hw).arc(goalLineX, cy, r, -a, a);
  } else {
    g.lineTo(goalLineX - Math.cos(a) * r, cy - hw).arc(goalLineX, cy, r, Math.PI + a, Math.PI - a, true);
  }
  g.lineTo(goalLineX, cy + hw).closePath();
}

function buildCreases(): Graphics {
  const g = new Graphics({ label: 'creases' });
  addCreasePath(g, RINK.goalLineLeftX, 1);
  g.fill(COLORS.crease.fill).stroke({ color: COLORS.crease.stroke, width: M.lineWidthMinor * 1.5 });
  addCreasePath(g, RINK.goalLineRightX, -1);
  g.fill(COLORS.crease.fill).stroke({ color: COLORS.crease.stroke, width: M.lineWidthMinor * 1.5 });
  return g;
}

/** The restricted area behind each net: 22 ft at the goal line, widening to 28 ft at the boards. */
function buildTrapezoids(): Graphics {
  const { x: rx, width: rw, centerY: cy } = RINK;
  const g = new Graphics({ label: 'trapezoids' });
  for (const [goalLineX, boardsX] of [
    [RINK.goalLineLeftX, rx],
    [RINK.goalLineRightX, rx + rw],
  ] as const) {
    for (const sy of [-1, 1] as const) {
      g.moveTo(goalLineX, cy + sy * M.trapezoidGoalLineHalfWidth).lineTo(
        boardsX,
        cy + sy * M.trapezoidBoardsHalfWidth
      );
    }
  }
  return g.stroke({ color: COLORS.redLine, width: M.lineWidthMinor * 1.5 });
}

/** An end zone faceoff circle: ring, the four L-shaped alignment marks, hash marks and its spot. */
function buildEndZoneCircle(cx: number, cy: number): Graphics {
  const radius = M.faceoffCircleRadius;
  const halfSep = M.hashSeparation / 2;
  const g = new Graphics();

  g.circle(cx, cy, radius);
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const yy = cy + sy * halfSep;
      const innerX = cx + sx * M.markGapX;
      const outerX = innerX + sx * M.markLongArm;
      g.moveTo(innerX, yy)
        .lineTo(outerX, yy)
        .lineTo(outerX, yy + sy * M.markShortArm);
    }
  }
  for (const sy of [-1, 1] as const) {
    for (const sx of [-1, 1] as const) {
      const xx = cx + sx * halfSep;
      const yStart = cy + sy * radius;
      g.moveTo(xx, yStart).lineTo(xx, yStart + sy * M.hashLength);
    }
  }
  g.stroke({ color: COLORS.redLine, width: M.lineWidthMinor * 1.5 });

  g.circle(cx, cy, M.faceoffSpotRadius).fill(COLORS.redLine);
  return g;
}

/** Centre ice: the circle and spot here are blue, unlike the red end zone ones. */
function buildCenterCircle(): Graphics {
  const { centerX: cx, centerY: cy } = RINK;
  return new Graphics()
    .circle(cx, cy, M.faceoffCircleRadius)
    .stroke({ color: COLORS.blueLine, width: M.lineWidthMinor * 1.5 })
    .circle(cx, cy, M.centerSpotRadius)
    .fill(COLORS.blueLine);
}

function buildFaceoffCircles(): Container {
  const container = new Container({ label: 'faceoff-circles' });
  const spotY = [RINK.centerY - M.spotOffsetFromCenterY, RINK.centerY + M.spotOffsetFromCenterY];
  const endZoneX = [
    RINK.goalLineLeftX + M.endZoneSpotFromGoalLine,
    RINK.goalLineRightX - M.endZoneSpotFromGoalLine,
  ];
  for (const cx of endZoneX) {
    for (const cy of spotY) {
      container.addChild(buildEndZoneCircle(cx, cy));
    }
  }
  container.addChild(buildCenterCircle());
  return container;
}

/** Neutral zone spots: no circles, just the dots either side of each blue line. */
function buildNeutralSpots(): Graphics {
  const { blueLineLeftX, blueLineRightX, centerY } = RINK;
  const spotY = [centerY - M.spotOffsetFromCenterY, centerY + M.spotOffsetFromCenterY];
  const neutralX = [blueLineLeftX + M.neutralSpotFromBlueLine, blueLineRightX - M.neutralSpotFromBlueLine];
  const g = new Graphics({ label: 'neutral-spots' });
  for (const cx of neutralX) {
    for (const cy of spotY) {
      g.circle(cx, cy, M.faceoffSpotRadius);
    }
  }
  return g.fill(COLORS.redLine);
}

/** The referee's crease: a 10 ft semicircle at centre ice, bulging into the ice off the boards. */
function buildRefereeCrease(): Graphics {
  const { centerX, y, height } = RINK;
  return new Graphics({ label: 'referee-crease' })
    .arc(centerX, y + height, M.refereeCreaseRadius, Math.PI, 0, false)
    .stroke({ color: COLORS.redLine, width: M.lineWidthMinor * 1.5 });
}

/**
 * Everything that spans the full ice height respects the rink's rounded
 * corners via `iceYRangeAt` (see this section's header) - the goal, blue and
 * centre lines are trimmed at build time rather than clipped by a mask.
 */
function buildMarkings(): Container {
  const container = new Container({ label: 'markings' });

  container.addChild(buildGoalLines());
  container.addChild(buildBlueLines());
  container.addChild(buildCenterLine());
  container.addChild(buildCreases());
  container.addChild(buildTrapezoids());
  container.addChild(buildFaceoffCircles());
  container.addChild(buildNeutralSpots());
  container.addChild(buildRefereeCrease());

  return container;
}

// ----------------------------------------------------------------------------
// Board fixtures — benches, penalty boxes, the scorer's table, glass stanchions.
// ----------------------------------------------------------------------------

const FIXTURE_LABEL_STYLE: TextStyleOptions = {
  fontSize: 5.5,
  fontWeight: '700',
  fontFamily: 'Arial',
  fill: 'rgba(215, 238, 247, .72)',
};

function fixtureLabel(text: string, x: number, y: number): Text {
  const label = new Text({ text, resolution: TEXT_RESOLUTION, style: FIXTURE_LABEL_STYLE });
  label.anchor.set(0.5);
  label.position.set(x, y);
  return label;
}

/** Team benches on the upper side, separated at centre ice, each with a "HOME/AWAY BENCH" label. */
function buildBenches(container: Container): void {
  const { y, centerX } = RINK;
  const benchWidth = 32 * FT;
  const boxDepth = 5 * FT;
  const g = new Graphics();

  [centerX - benchWidth * 0.58, centerX + benchWidth * 0.58].forEach((cx, index) => {
    g.rect(cx - benchWidth / 2, y - boxDepth, benchWidth, boxDepth)
      .fill('rgba(214, 226, 234, 0.2)')
      .stroke({ color: 'rgba(117, 213, 245, 0.72)', width: 1.4 });
    for (let sx = cx - benchWidth / 2 + 12; sx < cx + benchWidth / 2; sx += 24) {
      g.moveTo(sx, y - boxDepth).lineTo(sx, y);
    }
    g.stroke({ color: 'rgba(117, 213, 245, 0.72)', width: 1.4 });
    container.addChild(fixtureLabel(index === 0 ? 'HOME BENCH' : 'AWAY BENCH', cx, y - boxDepth * 0.52));
  });

  container.addChild(g);
}

/** Penalty boxes and the scorer's table opposite the benches. */
function buildPenaltyBoxes(container: Container): void {
  const { y, height, centerX } = RINK;
  const boxDepth = 5 * FT;
  const penaltyWidth = 18 * FT;
  const g = new Graphics();

  for (const cx of [centerX - penaltyWidth * 0.68, centerX + penaltyWidth * 0.68]) {
    g.rect(cx - penaltyWidth / 2, y + height, penaltyWidth, boxDepth)
      .fill('rgba(214, 226, 234, 0.2)')
      .stroke({ color: 'rgba(117, 213, 245, 0.72)', width: 1.4 });
  }
  g.rect(centerX - 10 * FT, y + height, 20 * FT, boxDepth)
    .fill('rgba(6, 20, 31, 0.78)')
    .stroke({ color: 'rgba(117, 213, 245, 0.72)', width: 1.4 });
  container.addChild(g);

  const penaltyHalf = penaltyWidth * 0.68;
  const labelY = y + height + boxDepth * 0.52;
  container.addChild(fixtureLabel('PENALTY', centerX - penaltyHalf, labelY));
  container.addChild(fixtureLabel('SCORER', centerX, labelY));
  container.addChild(fixtureLabel('PENALTY', centerX + penaltyHalf, labelY));
}

/** Glass stanchions at regulation-looking intervals around the straight runs. */
function buildStanchions(): Graphics {
  const { x, y, width, height } = RINK;
  const g = new Graphics();
  for (let sx = x + 30 * FT; sx < x + width - 30 * FT; sx += 10 * FT) {
    g.moveTo(sx, y - 5).lineTo(sx, y + 5);
    g.moveTo(sx, y + height - 5).lineTo(sx, y + height + 5);
  }
  return g.stroke({ color: 'rgba(174, 229, 248, 0.42)', width: 0.9 });
}

function buildBoardFixtures(): Container {
  const container = new Container({ label: 'board-fixtures' });
  buildBenches(container);
  buildPenaltyBoxes(container);
  container.addChild(buildStanchions());
  return container;
}

// ----------------------------------------------------------------------------
// Arena floor — the depth silhouette UNDER the boards. Drawn first, before the
// ice, exactly like the canvas original's paint order: it is only ever seen
// in the margin around the rink, since the (opaque) ice fill and the boards
// stroke stack both sit on top of it everywhere else.
// ----------------------------------------------------------------------------

function buildArenaFloor(): Graphics {
  const { x: rx, y: ry, width: rw, height: rh, cornerRadius: cr } = RINK;
  const g = new Graphics({ label: 'arena-floor' });

  // A plain underlay - see file header for why this drops the canvas
  // version's blurred drop shadow.
  g.roundRect(rx - 10, ry - 10, rw + 20, rh + 20, cr + 10).fill('#07121c');
  g.roundRect(rx - 7, ry - 7, rw + 14, rh + 14, cr + 7).stroke({ color: 'rgba(19, 210, 255, 0.18)', width: 12 });

  return g;
}

// ----------------------------------------------------------------------------
// Boards — the rounded-rect stack: kick plate, cap rail, glass. Drawn AFTER
// the ice/markings, on top, matching the canvas original.
// ----------------------------------------------------------------------------

function buildBoards(): Graphics {
  const { x: rx, y: ry, width: rw, height: rh, cornerRadius: cr } = RINK;
  const g = new Graphics({ label: 'boards' });

  g.roundRect(rx, ry, rw, rh, cr).stroke({ color: 'rgba(0, 0, 0, 0.55)', width: 13 });
  g.roundRect(rx, ry, rw, rh, cr).stroke({ color: '#f5f8fb', width: 8 });
  g.roundRect(rx + 2, ry + 2, rw - 4, rh - 4, Math.max(0, cr - 2)).stroke({ color: '#f2c94c', width: 2.2 });
  g.roundRect(rx, ry, rw, rh, cr).stroke({ color: 'rgba(94, 211, 255, 0.72)', width: 2 });

  // Glass edge and steel stanchion rail outside the boards.
  g.roundRect(rx - 5, ry - 5, rw + 10, rh + 10, cr + 5).stroke({ color: 'rgba(157, 224, 247, .42)', width: 3.2 });
  g.roundRect(rx - 6.5, ry - 6.5, rw + 13, rh + 13, cr + 6.5).stroke({ color: 'rgba(235, 250, 255, .72)', width: 0.9 });

  return g;
}

// ----------------------------------------------------------------------------
// Goals — net bag silhouette, red frame, crossbar and post caps.
// (The clipped diagonal mesh texture is trimmed; see file header.)
// ----------------------------------------------------------------------------

function buildGoal(goalLineX: number, direction: 1 | -1): Graphics {
  const cy = RINK.centerY;
  const { goalHalfWidth: hw, goalDepth: depth } = M;
  const backX = goalLineX - direction * depth;
  const mouthX = goalLineX;
  const backTopY = cy - hw * 0.72;
  const backBottomY = cy + hw * 0.72;

  const g = new Graphics();

  g.moveTo(mouthX, cy - hw)
    .lineTo(backX, backTopY)
    .quadraticCurveTo(backX - direction * FT * 0.45, cy, backX, backBottomY)
    .lineTo(mouthX, cy + hw)
    .closePath()
    .fill('rgba(245, 250, 253, .72)');

  g.moveTo(mouthX, cy - hw)
    .lineTo(backX, backTopY)
    .quadraticCurveTo(backX - direction * FT * 0.45, cy, backX, backBottomY)
    .lineTo(mouthX, cy + hw)
    .stroke({ color: COLORS.goalPost, width: 1.7, cap: 'round', join: 'round' });

  g.moveTo(mouthX, cy - hw)
    .lineTo(mouthX, cy + hw)
    .stroke({ color: COLORS.goalPost, width: 2.2 });

  for (const y of [cy - hw, cy + hw]) {
    g.circle(mouthX, y, 1.65).fill(COLORS.goalPost);
  }

  return g;
}

function buildGoals(): Container {
  const container = new Container({ label: 'goals' });
  container.addChild(buildGoal(RINK.goalLineLeftX, 1));
  container.addChild(buildGoal(RINK.goalLineRightX, -1));
  return container;
}

// ----------------------------------------------------------------------------
// Assembly
// ----------------------------------------------------------------------------

/**
 * Builds the flat rink scene graph ONCE. The caller (`WebGLRenderer`) applies
 * the camera transform to the returned root every frame; nothing here reads
 * the camera or is rebuilt per draw.
 */
export function buildRinkScene(): Container {
  const root = new Container({ label: 'rink-scene' });
  root.addChild(buildArenaFloor());
  root.addChild(buildIceSurface());
  root.addChild(buildZoneTints());
  root.addChild(buildCenterLogo());
  root.addChild(buildMarkings());
  root.addChild(buildBoards());
  root.addChild(buildBoardFixtures());
  root.addChild(buildGoals());
  return root;
}

// Exported individually so tests can assert node counts/types per feature
// group without re-deriving them from the assembled tree. `iceYRangeAt` is
// exported too - it is the actual correctness mechanism the goal/blue/centre
// lines rely on (see the "Line markings" section above), worth its own
// geometry test rather than only an indirect one via Graphics internals.
export {
  buildArenaFloor,
  buildIceSurface,
  buildZoneTints,
  buildCenterLogo,
  buildMarkings,
  buildBoardFixtures,
  buildBoards,
  buildGoals,
  iceYRangeAt,
};
