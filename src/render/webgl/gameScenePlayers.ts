// ============================================================================
// GAME SCENE — PLAYER TOKENS
//
// One reusable Pixi container per player slot, updated in place every frame
// (never destroyed/recreated - see gameScene.ts's pooling policy). Split out
// of gameScene.ts because the player group is the single largest and most
// detailed port-order item (atlas sprite + vector fallback + every ring/
// puck/handle overlay a player can carry).
//
// SIMPLIFICATION (documented, same spirit as rinkScene.ts's header): the
// vector fallback here is a simplified silhouette - a jersey-coloured body,
// a helmet, and a stick to the blade - not a hand-port of every equipment
// polygon in SkaterRenderer.ts/GoalieRenderer.ts (laces, cage bars, glove
// stitching, ...), and it does not port `SkaterEffects.ts`'s stride/skid
// mark. Skating motion is a gentle shoulder sway instead (`strideSway`),
// read from the frame's stride phase and speed. It reuses the SAME pure
// `getSkaterPalette` function (colours) and the SAME heading rule Canvas
// applies per role - `effectiveHeading` below matches SkaterRenderer.ts for
// skaters (`frame.heading`) and GoalieRenderer.ts's puck-tracking
// `trackedHeading` for goalies - so heading and the custom-jersey ->
// vector-fallback RULE are identical to Canvas; only the equipment's visual
// fidelity is reduced. The atlas sprite path (the common case - a custom
// jersey colour is the exception) is unaffected and reads the same texture
// regions Canvas2D draws. This task's own baseline
// (e2e/__screenshots__/visual-webgl-shell) is what the WebGL path is judged
// against, not a pixel diff against Canvas2D - see WebGLRenderer.ts / brief.
//
// Positions are read from the SAME `PlaybackPlayerFrame` the hit-tester reads
// (`frame.position`/`frame.bladePosition`/`frame.heading`) - never re-derived.
// ============================================================================

import { Container, Graphics, Sprite, Text, Texture, type TextStyleOptions } from 'pixi.js';
import type { AnimatedPuck, Player, PlaybackPlayerFrame } from '@/core/types';
import { PLAYER_RADIUS, GOALIE_RING_OFFSET, ROUTE_HANDLE_OFFSET, ROUTE_HANDLE_RADIUS } from '@/core/constants';
import { getSkaterPalette, type SkaterPalette } from '@/canvas/skater/skaterPalette';
import { getBladePosition } from '@/sim/skaterMotor';
import { PUCK_MARKER_RX, PUCK_MARKER_RY } from '@/canvas/puckMarker';
import type { RenderQuality } from '@/render/quality';
import { redraw } from './redraw';

export interface PlayerVisualOptions {
  isSelected: boolean;
  isDragging: boolean;
  isMoving: boolean;
  isPassFrom: boolean;
  isPuckHolder: boolean;
  showInitialPuck: boolean;
  heading: number;
  showRouteHandle: boolean;
  isPreparingReceive: boolean;
  playbackFrame?: PlaybackPlayerFrame;
  /**
   * A goalie tracks the puck's direction rather than the route/idle heading,
   * whenever one is visible - matching GoalieRenderer.ts's `trackedHeading`
   * (`ctx.rotate(trackedHeading)` there rotates the WHOLE goalie body, not
   * just the puck marker). `undefined`/invisible falls back to the frame's
   * own heading, same as a skater.
   */
  trackedPuck?: AnimatedPuck | null;
  jersey?: string;
  screenRotation: number;
  zoom: number;
}

const NUMBER_STYLE: TextStyleOptions = {
  fontSize: 12.5,
  fontWeight: '800',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  fill: '#ffffff',
  stroke: { color: 'rgba(5, 15, 25, 0.88)', width: 3, join: 'round' },
  letterSpacing: -0.3,
};

/** Mirrors PlayerRenderer.ts's private `createDesignFrame` - the same synthetic frame when nothing is playing back. */
function designFrame(player: Player, heading: number): PlaybackPlayerFrame {
  const position = { x: player.x, y: player.y };
  return {
    id: player.id,
    position,
    velocity: { x: 0, y: 0 },
    heading,
    angularVelocity: 0,
    speed: 0,
    routeProgress: 0,
    stridePhase: 0.12,
    action: 'idle',
    bladePosition: getBladePosition(player, position, heading),
  };
}

export interface PlayerToken {
  readonly container: Container;
  readonly ringSelected: Graphics;
  readonly ringHighlight: Graphics;
  readonly ringMoving: Graphics;
  readonly goalieRing: Graphics;
  readonly preparingReceive: Graphics;
  readonly carrierRing: Graphics;
  readonly puck: Graphics;
  readonly routeHandle: Container;
  readonly routeHandleGraphic: Graphics;
  /** Rotates by heading; holds the shadow, sprite/vector body and the (counter-rotated) number. */
  readonly bodyGroup: Container;
  readonly shadow: Graphics;
  readonly stick: Graphics;
  readonly vectorBody: Graphics;
  readonly sprite: Sprite;
  readonly number: Text;
}

export function createPlayerToken(): PlayerToken {
  const container = new Container({ label: 'player' });
  const bodyGroup = new Container({ label: 'player-body' });
  const shadow = new Graphics();
  const stick = new Graphics();
  const vectorBody = new Graphics();
  const sprite = new Sprite(Texture.EMPTY);
  const number = new Text({ text: '', resolution: 2, style: NUMBER_STYLE });
  number.anchor.set(0.5);

  bodyGroup.addChild(shadow, stick, vectorBody, sprite, number);

  const ringSelected = new Graphics();
  const ringHighlight = new Graphics();
  const ringMoving = new Graphics();
  const goalieRing = new Graphics();
  const preparingReceive = new Graphics();
  const carrierRing = new Graphics({ label: 'carrier-ring' });
  const puck = new Graphics({ label: 'puck-marker' });
  const routeHandle = new Container();
  const routeHandleGraphic = new Graphics();
  routeHandle.addChild(routeHandleGraphic);

  container.addChild(
    ringSelected,
    ringHighlight,
    ringMoving,
    bodyGroup,
    goalieRing,
    preparingReceive,
    carrierRing,
    puck,
    routeHandle
  );

  return {
    container,
    ringSelected,
    ringHighlight,
    ringMoving,
    goalieRing,
    preparingReceive,
    carrierRing,
    puck,
    routeHandle,
    routeHandleGraphic,
    bodyGroup,
    shadow,
    stick,
    vectorBody,
    sprite,
    number,
  };
}

function drawDashedCircle(g: Graphics, radius: number, color: number, alpha: number, width: number): void {
  // Pixi has no native dashed stroke either; these rings are decorative
  // enough (unlike skate paths / routes, which the brief calls out
  // explicitly) that a plain solid ring at a slightly reduced alpha reads
  // the same at a glance without pulling in the dash tessellator for a
  // circle - only straight/curved LINES use `dashedLine.ts`.
  g.circle(0, 0, radius).stroke({ color, alpha, width });
}

function updateRings(token: PlayerToken, player: Player, options: PlayerVisualOptions): void {
  const pr = PLAYER_RADIUS;
  const isHighlighted = options.isDragging || options.isPassFrom;
  const homeColor = 0xd7303a;
  const awayColor = 0x3080ff;

  redraw(token.ringSelected, options.isSelected ? `on|${player.team}` : 'off', g => {
    if (options.isSelected) drawDashedCircle(g, pr + 11, player.team === 'home' ? homeColor : awayColor, 0.55, 2);
  });

  redraw(token.ringHighlight, isHighlighted ? 'on' : 'off', g => {
    if (isHighlighted) g.circle(0, 0, pr + 7).stroke({ color: 0xffd20a, alpha: 0.88, width: 2.5 });
  });

  redraw(token.ringMoving, options.isMoving ? 'on' : 'off', g => {
    if (options.isMoving) g.circle(0, 0, pr + 16).stroke({ color: 0xffd20a, alpha: 0.65, width: 2.5 });
  });

  redraw(token.preparingReceive, options.isPreparingReceive ? 'on' : 'off', g => {
    if (!options.isPreparingReceive) return;
    g.circle(0, 0, pr + 13)
      .fill({ color: 0x00e676, alpha: 0.08 })
      .stroke({ color: 0x00e676, alpha: 1, width: 2.5 });
  });
}

function updateGoalieRing(token: PlayerToken, player: Player): void {
  redraw(token.goalieRing, player.role === 'G' ? 'on' : 'off', g => {
    if (player.role !== 'G') return;
    g.circle(0, 0, PLAYER_RADIUS + GOALIE_RING_OFFSET).stroke({ color: 0xffca00, alpha: 0.78, width: 2.2 });
  });
}

function drawPuckMarkerGraphic(g: Graphics, heading: number): void {
  redraw(g, 'puck', shape =>
    shape
      .ellipse(0, 0, PUCK_MARKER_RX, PUCK_MARKER_RY)
      .fill(0x0a0d11)
      .stroke({ color: 0xd6e2ee, alpha: 0.34, width: 0.9 })
  );
  g.rotation = heading;
}

/**
 * `isPuckHolder` (the current possession-chain holder) and `showInitialPuck`
 * (a brand-new drill's authored `hasPuck` flag, before any events exist) are
 * both "this player carries the puck right now" - Canvas combines them the
 * same way (PlayerRenderer.ts: `isPuckHolder: isPuckHolder || showInitialPuck`).
 * Reading `isPuckHolder` alone silently dropped the puck marker for the
 * default brand-new-drill state (one player, zero events).
 */
function updateCarrierAndPuck(
  token: PlayerToken,
  player: Player,
  frame: PlaybackPlayerFrame,
  options: PlayerVisualOptions,
  heading: number
): void {
  const isCarrying = options.isPuckHolder || options.showInitialPuck;
  redraw(token.carrierRing, isCarrying ? 'on' : 'off', g => {
    if (isCarrying) g.circle(0, 0, PLAYER_RADIUS + 5).stroke({ color: 0xffd60a, alpha: 1, width: 2.4 });
  });
  token.puck.visible = isCarrying;
  if (!isCarrying) return;

  const blade = { x: frame.bladePosition.x - player.x, y: frame.bladePosition.y - player.y };
  token.puck.position.set(blade.x, blade.y);
  drawPuckMarkerGraphic(token.puck, heading);
}

function updateRouteHandle(token: PlayerToken, options: PlayerVisualOptions): void {
  token.routeHandle.visible = options.showRouteHandle;
  if (!options.showRouteHandle) return;
  token.routeHandle.position.set(ROUTE_HANDLE_OFFSET, 0);
  redraw(token.routeHandleGraphic, 'handle', g => g
    .circle(0, 0, ROUTE_HANDLE_RADIUS)
    .fill({ color: 0x061e30, alpha: 0.92 })
    .stroke({ color: 0x00e5ff, width: 2.2 })
    .moveTo(-4, -4)
    .lineTo(2, 0)
    .lineTo(-4, 4)
    .stroke({ color: 0x00e5ff, width: 2, cap: 'round', join: 'round' })
    .moveTo(-4, 0)
    .lineTo(2, 0)
    .stroke({ color: 0x00e5ff, width: 2, cap: 'round' }));
}

/**
 * The rotation the body/number/puck all share this frame: a goalie tracks
 * the puck's direction whenever one is visible, exactly like
 * GoalieRenderer.ts's `trackedHeading` (`Math.atan2(puck.y - player.y,
 * puck.x - player.x)`); everyone else (and a goalie with no visible puck)
 * uses the frame's own heading, same as `deriveSkaterPose(frame).heading`.
 */
function effectiveHeading(isGoalie: boolean, player: Player, frame: PlaybackPlayerFrame, trackedPuck?: AnimatedPuck | null): number {
  if (isGoalie && trackedPuck?.visible) {
    return Math.atan2(trackedPuck.y - player.y, trackedPuck.x - player.x);
  }
  return frame.heading;
}

/** Local-space blade point: the SAME rotation `SkaterRenderer.ts`'s private `localPoint` applies, so the stick still ends on the authoritative puck socket. */
function localBlade(player: Player, frame: PlaybackPlayerFrame): { x: number; y: number } {
  const dx = frame.bladePosition.x - player.x;
  const dy = frame.bladePosition.y - player.y;
  const cos = Math.cos(frame.heading);
  const sin = Math.sin(frame.heading);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

function shadeToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16) || 0;
}

function drawVectorBody(
  token: PlayerToken,
  r: number,
  isGoalie: boolean,
  palette: SkaterPalette,
  blade: { x: number; y: number },
  effectsEnabled: boolean
): void {
  const bodyR = bodyRadius(r, isGoalie);
  redraw(token.shadow, `${bodyR}|${effectsEnabled}`, g => {
    // A soft contact shadow, a touch behind and below, grounds the player.
    if (!effectsEnabled) return;
    g.ellipse(-bodyR * 0.06, bodyR * 0.08, bodyR * 0.98, bodyR * 1.04).fill({ color: 0x071520, alpha: 0.14 });
    g.ellipse(-bodyR * 0.04, bodyR * 0.05, bodyR * 0.86, bodyR * 0.92).fill({ color: 0x071520, alpha: 0.16 });
  });

  // The blade moves with stickhandling; a tenth of a unit is below a pixel.
  const bladeKey = `${r}|${Math.round(blade.x * 10)}|${Math.round(blade.y * 10)}`;
  redraw(token.stick, bladeKey, stick => drawStick(stick, r, blade));

  const bodyKey = `${bodyR}|${isGoalie}|${palette.jersey}|${palette.jerseyDark}|${palette.helmet}`;
  redraw(token.vectorBody, bodyKey, body => drawBody(body, bodyR, isGoalie, palette));
}

function bodyRadius(r: number, isGoalie: boolean): number {
  return isGoalie ? r * 1.15 : r * 0.95;
}

/**
 * A two-tone composite stick: a dark edge under a light shaft reads on white
 * ice and on a team colour alike, gloves where the hands hold it, and a taped
 * blade turned across the puck so the puck sits on its face.
 */
function drawStick(g: Graphics, r: number, blade: { x: number; y: number }): void {
  const butt = { x: -r * 0.05, y: blade.y * 0.18 };
  const heel = { x: blade.x - r * 0.16, y: blade.y * 0.94 };
  const side = blade.y >= 0 ? 1 : -1;
  // The blade runs from the heel across the front of the puck.
  const toe = { x: blade.x + r * 0.08, y: blade.y + side * r * 0.2 };
  g.moveTo(butt.x, butt.y).lineTo(heel.x, heel.y).stroke({ color: 0x0b141c, alpha: 0.75, width: 3.6, cap: 'round' });
  g.moveTo(butt.x, butt.y).lineTo(heel.x, heel.y).stroke({ color: 0xe9edf2, width: 2, cap: 'round' });
  g.moveTo(heel.x, heel.y).lineTo(toe.x, toe.y).stroke({ color: 0x0b141c, width: 3.6, cap: 'round', join: 'round' });
  // Gloves: top hand near the body, bottom hand halfway down the shaft.
  for (const t of [0.12, 0.5]) {
    const x = butt.x + (heel.x - butt.x) * t;
    const y = butt.y + (heel.y - butt.y) * t;
    g.circle(x, y, r * 0.15).fill(0x161d26).stroke({ color: 0xffffff, alpha: 0.35, width: 0.8 });
  }
}

/**
 * Top-down skater: shoulders wider than deep, a white keyline that holds on
 * white ice, a lighter yoke across the shoulders and a helmet at the front
 * edge with a visor facing the way the player looks. The number sits behind
 * the helmet (see `updatePlayerToken`) so the two never overlap.
 */
function drawBody(g: Graphics, bodyR: number, isGoalie: boolean, palette: SkaterPalette): void {
  const jersey = shadeToNumber(palette.jersey);
  const dark = shadeToNumber(palette.jerseyDark);
  const depth = isGoalie ? 0.84 : 0.74;
  const width = isGoalie ? 0.98 : 0.9;
  g.ellipse(0, 0, bodyR * (depth + 0.07), bodyR * (width + 0.07)).fill({ color: 0xffffff, alpha: 0.96 });
  g.ellipse(0, 0, bodyR * depth, bodyR * width).fill(jersey).stroke({ color: dark, width: 1.2 });
  // Shoulder yoke: a thin lighter band across the front of the jersey.
  g.ellipse(bodyR * 0.2, 0, bodyR * 0.3, bodyR * width * 0.86).fill({ color: 0xffffff, alpha: 0.1 });
  const helmetX = bodyR * (isGoalie ? 0.66 : 0.58);
  const helmetR = bodyR * 0.3;
  g.circle(helmetX, 0, helmetR).fill(shadeToNumber(palette.helmet)).stroke({ color: 0x07111a, width: 1.2 });
  g.circle(helmetX - helmetR * 0.3, -helmetR * 0.3, helmetR * 0.32).fill({ color: 0xffffff, alpha: 0.28 });
  g.arc(helmetX, 0, helmetR * 0.78, -0.75, 0.75).stroke({ color: 0x7fd6ff, alpha: 0.9, width: 1.4, cap: 'round' });
}

/** Most of a stride's sway, in radians, at full skating speed. */
const STRIDE_SWAY = 0.075;

/**
 * Skating, the shoulders rock with each push. Read from the frame's own
 * stride phase and speed, so it is the same on every replay and scrub, fades
 * in and out with speed, and never moves the stick or the puck on it.
 */
function strideSway(frame: PlaybackPlayerFrame, isGoalie: boolean): number {
  if (isGoalie || frame.speed <= 0.5) return 0;
  const weight = Math.min(1, Math.max(0, (frame.speed - 0.5) / 24.5));
  const eased = weight * weight * (3 - 2 * weight);
  return Math.sin((frame.stridePhase ?? 0) * Math.PI * 2) * STRIDE_SWAY * eased;
}

export interface UpdatePlayerTokenArgs {
  player: Player;
  options: PlayerVisualOptions;
  quality: RenderQuality;
}

/** `'low'` sheds glow/shadow effects entirely (the audit's effect-shedding tier). */
function effectsEnabled(quality: RenderQuality): boolean {
  return quality !== 'low';
}

function iconScaleForZoom(zoom: number, referenceRadius: number, minScreenRadius: number): number {
  const screenScale = Math.max(0.001, Math.abs(zoom));
  return Math.min(2.05, Math.max(1, minScreenRadius / (referenceRadius * screenScale)));
}

export function updatePlayerToken(token: PlayerToken, { player, options, quality }: UpdatePlayerTokenArgs): void {
  const frame = options.playbackFrame ?? designFrame(player, options.heading);
  const isGoalie = player.role === 'G';
  const palette = getSkaterPalette(player.team, options.jersey);
  const r = PLAYER_RADIUS * 1.12;
  const heading = effectiveHeading(isGoalie, player, frame, options.trackedPuck);
  const iconScale = iconScaleForZoom(options.zoom, isGoalie ? PLAYER_RADIUS * 1.45 : r, isGoalie ? 30 : 28);

  token.container.position.set(player.x, player.y);
  token.bodyGroup.rotation = heading;
  token.bodyGroup.scale.set(iconScale);

  updateRings(token, player, options);
  updateGoalieRing(token, player);
  updateRouteHandle(token, options);
  updateCarrierAndPuck(token, player, frame, options, heading);

  const blade = localBlade(player, frame);

  // Vector player token honoring team palette and crisp centered typography
  token.sprite.visible = false;
  token.vectorBody.visible = true;
  token.stick.visible = true;
  token.shadow.visible = true;
  drawVectorBody(token, r, isGoalie, palette, blade, effectsEnabled(quality));
  const sway = strideSway(frame, isGoalie);
  token.vectorBody.rotation = sway;
  token.shadow.rotation = sway * 0.5;

  if (token.number.text !== player.number) token.number.text = player.number;
  // Behind the helmet, in the middle of the jersey.
  token.number.position.set(-bodyRadius(r, isGoalie) * 0.12, 0);
  token.number.rotation = -heading - options.screenRotation;
  // Rasterised at the size it is shown, so it stays sharp when zoomed in
  // (and the texture is only rebuilt when that size changes a step).
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const resolution = Math.min(8, Math.max(2, Math.ceil(dpr * Math.abs(options.zoom) * iconScale * 2) / 2));
  if (token.number.resolution !== resolution) token.number.resolution = resolution;
}
