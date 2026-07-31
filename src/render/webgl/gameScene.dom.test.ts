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

import { beforeEach, describe, expect, it } from 'vitest';
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
    // ghost trails, skate paths, transient route, events, drag preview (+label),
    // pass-from highlight, dimmed players, players, pass candidates, edit
    // handles, animated puck, diagnostics, glow.
    expect(scene.root.children.length).toBe(14);
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
