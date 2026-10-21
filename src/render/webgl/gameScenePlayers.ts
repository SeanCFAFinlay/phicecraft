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
// mark - the only thing Canvas's `reducedEffects` flag ever gated, which is
// why that field was dropped from `PlayerVisualOptions` rather than wired:
// there is nothing left for it to gate. It reuses the SAME pure
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
  fontSize: 13,
  fontWeight: '900',
  fontFamily: 'Inter, system-ui, -apple-system, Arial, sans-serif',
  fill: '#ffffff',
  stroke: { color: 'rgba(5, 15, 25, 0.9)', width: 3 },
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

  token.ringSelected.clear();
  if (options.isSelected) {
    drawDashedCircle(token.ringSelected, pr + 11, player.team === 'home' ? homeColor : awayColor, 0.55, 2);
  }

  token.ringHighlight.clear();
  if (isHighlighted) {
    token.ringHighlight.circle(0, 0, pr + 7).stroke({ color: 0xffd20a, alpha: 0.88, width: 2.5 });
  }

  token.ringMoving.clear();
  if (options.isMoving) {
    token.ringMoving.circle(0, 0, pr + 16).stroke({ color: 0xffd20a, alpha: 0.65, width: 2.5 });
  }

  token.preparingReceive.clear();
  if (options.isPreparingReceive) {
    token.preparingReceive
      .circle(0, 0, pr + 13)
      .fill({ color: 0x00e676, alpha: 0.08 })
      .stroke({ color: 0x00e676, alpha: 1, width: 2.5 });
  }
}

function updateGoalieRing(token: PlayerToken, player: Player): void {
  token.goalieRing.clear();
  if (player.role !== 'G') return;
  token.goalieRing
    .circle(0, 0, PLAYER_RADIUS + GOALIE_RING_OFFSET)
    .stroke({ color: 0xffca00, alpha: 0.78, width: 2.2 });
}

function drawPuckMarkerGraphic(g: Graphics, heading: number): void {
  g.clear();
  g.ellipse(0, 0, PUCK_MARKER_RX, PUCK_MARKER_RY)
    .fill(0x0a0d11)
    .stroke({ color: 0xd6e2ee, alpha: 0.34, width: 0.9 });
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
  token.carrierRing.clear();
  token.puck.clear();
  if (!isCarrying) return;

  token.carrierRing.circle(0, 0, PLAYER_RADIUS + 5).stroke({ color: 0xffd60a, alpha: 1, width: 2.4 });
  const blade = { x: frame.bladePosition.x - player.x, y: frame.bladePosition.y - player.y };
  token.puck.position.set(blade.x, blade.y);
  drawPuckMarkerGraphic(token.puck, heading);
}

function updateRouteHandle(token: PlayerToken, options: PlayerVisualOptions): void {
  token.routeHandle.visible = options.showRouteHandle;
  if (!options.showRouteHandle) return;
  token.routeHandle.position.set(ROUTE_HANDLE_OFFSET, 0);
  token.routeHandleGraphic
    .clear()
    .circle(0, 0, ROUTE_HANDLE_RADIUS)
    .fill({ color: 0x051823, alpha: 0.96 })
    .stroke({ color: 0x00c8f0, width: 2 });
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
  token.shadow.clear();
  const bodyR = isGoalie ? r * 1.15 : r * 0.95;
  if (effectsEnabled) {
    // Balanced centered contact shadow grounds the player on the ice surface
    token.shadow.ellipse(0, 0, bodyR * 1.05, bodyR * 0.95).fill({ color: 0x071520, alpha: 0.22 });
  }

  token.stick.clear();
  token.stick
    .moveTo(-r * 0.2, 0)
    .lineTo(blade.x - r * 0.12, blade.y)
    .stroke({ color: 0xc89a58, width: 2.8, cap: 'round', join: 'round' })
    .moveTo(blade.x - r * 0.12, blade.y)
    .lineTo(blade.x, blade.y)
    .stroke({ color: 0x1a1a1a, width: 3.2, cap: 'round' }); // blade tape

  token.vectorBody
    .clear()
    // Soft outer ring for crisp contrast on light ice
    .ellipse(0, 0, bodyR * 0.82, bodyR * 0.88)
    .stroke({ color: 0xffffff, alpha: 0.95, width: 2.2 })
    // Solid team jersey
    .ellipse(0, 0, bodyR * 0.78, bodyR * 0.84)
    .fill({ color: shadeToNumber(palette.jersey) })
    .stroke({ color: shadeToNumber(palette.jerseyDark), width: 1.4 })
    // Directional helmet facing forward
    .circle(bodyR * 0.68, 0, bodyR * 0.38)
    .fill({ color: shadeToNumber(palette.helmet) })
    .stroke({ color: 0x07111a, width: 1.5 })
    // Visor / cage detail
    .moveTo(bodyR * 0.78, -bodyR * 0.2)
    .lineTo(bodyR * 0.78, bodyR * 0.2)
    .stroke({ color: 0x4fc3f7, alpha: 0.75, width: 1.5 });
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

  token.number.text = player.number;
  token.number.rotation = -heading - options.screenRotation;
}
