// ============================================================================
// GAME SCENE — scene-graph unit test
//
// Same rationale as rinkScene.dom.test.ts: Pixi's real renderer cannot
// initialize in jsdom, so this builds/updates the scene graph in isolation
// and asserts structure/pooling behaviour, not pixels (those are
// e2e-verified via the `visual-webgl-shell` Playwright project).
//
// The stubbed 2D canvas context is needed for the same two reasons rinkScene
// needs it: Pixi `Text` measures itself via a canvas 2D context on
// construction (every player's jersey number, every event badge), and this
// module's `Graphics.fill()` calls never use a gradient, so that part of the
// stub is unused here but kept for parity/safety.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Graphics } from 'pixi.js';
import { buildGameScene, destroyGameScene, updateGameScene } from './gameScene';
import { giveAndGoRegressionDrill } from '@/fixtures/giveAndGo.v1';
import { EMPTY_TRAILS } from '@/playback/playbackFrame';
import type { DynamicLayerInput } from '@/components/canvas/renderDynamic';

function fakeCanvasRenderingContext2D(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} } as unknown as CanvasGradient;
  return {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillRect: () => {},
    measureText: (text: string) => ({
      width: text.length * 6,
      actualBoundingBoxAscent: 5,
      actualBoundingBoxDescent: 2,
      fontBoundingBoxAscent: 6,
      fontBoundingBoxDescent: 2,
    }),
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = ((type: string) =>
    type === '2d' ? fakeCanvasRenderingContext2D() : null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

const BASE_INPUT: DynamicLayerInput = {
  camera: { x: 0, y: 0, zoom: 1, rotation: 0, tilt: 0 },
  width: 800,
  height: 400,
  dpr: 1,
  drill: giveAndGoRegressionDrill,
  positions: {},
  playerFrames: {},
  puck: null,
  ghostTrails: EMPTY_TRAILS,
  isPlaying: false,
  suppressEditAffordances: false,
  progress: 0,
  selectedPlayerId: null,
  selectedEventId: null,
  passFromPlayerId: null,
  movingPlayerId: null,
  transientRoute: null,
  draggedPlayer: null,
  dragPreview: null,
  passCandidates: null,
  showDiagnostics: false,
  reducedEffects: false,
  quality: 'high',
};

describe('buildGameScene', () => {
  it('builds one child per port-order group, all present from the start', () => {
    const scene = buildGameScene();
    // coaches, ghost trails, skate paths, transient route, events, drag
    // preview (+label), pass-from highlight, dimmed players, players, pass
    // candidates, edit handles, animated puck, diagnostics, glow.
    expect(scene.root.children.length).toBe(15);
  });

  it('draws coaches as the FIRST group, matching renderDynamic.ts\'s paint order', () => {
    const scene = buildGameScene();
    expect(scene.root.children[0].label).toBe('coaches');
  });
});

describe('updateGameScene', () => {
  it('does not throw against a fully-populated DynamicLayerInput', () => {
    const scene = buildGameScene();
    expect(() =>
      updateGameScene(scene, {
        ...BASE_INPUT,
        selectedPlayerId: 'p11',
        selectedEventId: 'pass-11-13',
        showDiagnostics: true,
        dragPreview: { kind: 'pass', from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, receiver: null },
      })
    ).not.toThrow();
    destroyGameScene(scene);
  });

  it('creates one player token per drill player', () => {
    const scene = buildGameScene();
    updateGameScene(scene, BASE_INPUT);
    const playersContainer = scene.root.children.find(child => child.label === 'players');
    expect(playersContainer?.children.length).toBe(giveAndGoRegressionDrill.players.length);
    destroyGameScene(scene);
  });

  it('reuses (never recreates) player tokens across frames, hiding rather than removing a player no longer present', () => {
    const scene = buildGameScene();
    updateGameScene(scene, BASE_INPUT);
    const playersContainer = scene.root.children.find(child => child.label === 'players')!;
    const initialTokenCount = playersContainer.children.length;
    const initialTokens = [...playersContainer.children];

    const fewerPlayers = { ...giveAndGoRegressionDrill, players: giveAndGoRegressionDrill.players.slice(0, 1) };
    updateGameScene(scene, { ...BASE_INPUT, drill: fewerPlayers });

    // Same Container instances (pooled, not destroyed/recreated) - only
    // visibility changed for the one no longer present this frame.
    expect(playersContainer.children.length).toBe(initialTokenCount);
    expect(playersContainer.children).toEqual(initialTokens);
    const visibleCount = playersContainer.children.filter(child => child.visible).length;
    expect(visibleCount).toBe(1);
  });

  it('reuses one Graphics per skate path across frames (no per-frame allocation)', () => {
    const scene = buildGameScene();
    updateGameScene(scene, BASE_INPUT);
    const skatePathsContainer = scene.root.children.find(child => child.label === 'skate-paths')!;
    const before = [...skatePathsContainer.children];
    updateGameScene(scene, BASE_INPUT);
    expect(skatePathsContainer.children).toEqual(before);
  });

  it('caches skate-path tessellation: an unchanged path (same drill, same points reference) does zero redraw work on the next frame', () => {
    const scene = buildGameScene();
    updateGameScene(scene, BASE_INPUT);
    const skatePathsContainer = scene.root.children.find(child => child.label === 'skate-paths')!;
    const pathGraphic = skatePathsContainer.children[0] as Graphics;
    const clearSpy = vi.spyOn(pathGraphic, 'clear');

    // Same `drill` reference as BASE_INPUT, so every path's `.points` array
    // is the SAME object - the cache should skip re-tessellation entirely.
    updateGameScene(scene, BASE_INPUT);

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('re-tessellates a skate path once its points array reference actually changes (an author edit)', () => {
    const scene = buildGameScene();
    updateGameScene(scene, BASE_INPUT);
    const skatePathsContainer = scene.root.children.find(child => child.label === 'skate-paths')!;
    const pathGraphic = skatePathsContainer.children[0] as Graphics;
    const clearSpy = vi.spyOn(pathGraphic, 'clear');

    const editedDrill = {
      ...giveAndGoRegressionDrill,
      skatePaths: giveAndGoRegressionDrill.skatePaths.map((path, index) =>
        index === 0 ? { ...path, points: path.points.map(point => ({ ...point })) } : path
      ),
    };
    updateGameScene(scene, { ...BASE_INPUT, drill: editedDrill });

    expect(clearSpy).toHaveBeenCalled();
  });

  it('creates one coach token per drill.coaches entry, drawn before ghost trails/skate paths/everything else', () => {
    const scene = buildGameScene();
    const withCoach = { ...giveAndGoRegressionDrill, coaches: [{ id: 'c1', x: 200, y: 50, name: 'Coach' }] };
    updateGameScene(scene, { ...BASE_INPUT, drill: withCoach });

    const coachesContainer = scene.root.children.find(child => child.label === 'coaches')!;
    expect(coachesContainer.children).toHaveLength(1);
    expect(coachesContainer.children[0].position.x).toBe(200);
    expect(coachesContainer.children[0].position.y).toBe(50);
  });

  it('reuses (never recreates) coach tokens across frames, hiding rather than removing one no longer authored', () => {
    const scene = buildGameScene();
    const withCoach = {
      ...giveAndGoRegressionDrill,
      coaches: [{ id: 'c1', x: 200, y: 50 }, { id: 'c2', x: 300, y: 60 }],
    };
    updateGameScene(scene, { ...BASE_INPUT, drill: withCoach });
    const coachesContainer = scene.root.children.find(child => child.label === 'coaches')!;
    const initialTokens = [...coachesContainer.children];

    const oneCoach = { ...giveAndGoRegressionDrill, coaches: [withCoach.coaches[0]] };
    updateGameScene(scene, { ...BASE_INPUT, drill: oneCoach });

    expect(coachesContainer.children).toEqual(initialTokens);
    expect(coachesContainer.children.filter(child => child.visible)).toHaveLength(1);
  });

  it('draws no coaches when the drill has none (coaches is optional on Drill)', () => {
    const scene = buildGameScene();
    updateGameScene(scene, BASE_INPUT); // giveAndGoRegressionDrill has no `coaches` field
    const coachesContainer = scene.root.children.find(child => child.label === 'coaches')!;
    expect(coachesContainer.children.filter(child => child.visible)).toHaveLength(0);
  });

  it('gates the carrier glow ring on !input.puck, same as the solid ring in gameScene.ts (finding: it used to bloom the last holder throughout animated playback)', () => {
    const scene = buildGameScene();
    const glowContainer = scene.root.children.find(child => child.label === 'glow')!;
    const glow = glowContainer.children[0] as Graphics;
    const strokeSpy = vi.spyOn(glow, 'stroke');

    // giveAndGoRegressionDrill's default events end on a shot, so
    // getCurrentPuckHolder returns null there (correctly, nobody has the
    // puck after a shot) - this drill instead ends on the pass, so p13 is
    // the current holder and the ring actually has something to draw.
    const passOnlyDrill = {
      ...giveAndGoRegressionDrill,
      events: giveAndGoRegressionDrill.events.filter(event => event.type === 'pass'),
    };

    // Authoring view (no animated puck): the holder ring draws.
    updateGameScene(scene, { ...BASE_INPUT, drill: passOnlyDrill });
    expect(strokeSpy.mock.calls.some(([opts]) => (opts as { color?: number }).color === 0xffd60a)).toBe(true);

    strokeSpy.mockClear();

    // Animated playback, puck in flight: the holder ring must NOT draw - the
    // puck is visibly not with anyone right now, even though
    // getCurrentPuckHolder still names who last had it.
    updateGameScene(scene, {
      ...BASE_INPUT,
      drill: passOnlyDrill,
      isPlaying: true,
      puck: { x: 100, y: 100, visible: true, state: 'in_flight', intendedReceiverId: 'p13' },
    });
    expect(strokeSpy.mock.calls.some(([opts]) => (opts as { color?: number }).color === 0xffd60a)).toBe(false);

    destroyGameScene(scene);
  });

  it("'low' quality hides the glow container; 'high' shows it", () => {
    const scene = buildGameScene();
    const glow = scene.root.children.find(child => child.label === 'glow')!;

    updateGameScene(scene, { ...BASE_INPUT, quality: 'low' });
    expect(glow.visible).toBe(false);

    updateGameScene(scene, { ...BASE_INPUT, quality: 'high' });
    expect(glow.visible).toBe(true);
  });

  it('shows edit handles for a selected route and hides them again once the selection clears', () => {
    const scene = buildGameScene();
    updateGameScene(scene, { ...BASE_INPUT, selectedPlayerId: 'p13' });
    const editHandles = scene.root.children.find(child => child.label === 'edit-handles')!;
    expect(editHandles.children.some(child => child.visible)).toBe(true);

    updateGameScene(scene, { ...BASE_INPUT, selectedPlayerId: null });
    expect(editHandles.children.some(child => child.visible)).toBe(false);
  });

  it('suppresses edit handles during playback even with a selection', () => {
    const scene = buildGameScene();
    updateGameScene(scene, { ...BASE_INPUT, selectedPlayerId: 'p13', isPlaying: true });
    const editHandles = scene.root.children.find(child => child.label === 'edit-handles')!;
    expect(editHandles.children.some(child => child.visible)).toBe(false);
  });
});
