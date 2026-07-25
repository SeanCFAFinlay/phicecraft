// ============================================================================
// CANVAS SURFACE - orchestrator
//
// This component no longer owns sizing, rendering, the camera, gestures,
// authoring rules, or the playback clock. It wires them together:
//
//   useCanvasLayers  -> two canvases, DPR policy, resize
//   useHitTesting    -> world-space hit tests
//   GestureStateMachine -> raw pointers to hockey intents
//   commands         -> the single authoring path
//   CameraStore / PlaybackStore -> high-frequency state, read directly
// ============================================================================

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { useCanvasLayers } from './useCanvasLayers';
import { useHitTesting } from './useHitTesting';
import { drawStaticLayer, staticLayerKey } from './renderStatic';
import { drawDynamicLayer, type DragPreview } from './renderDynamic';
import { GestureStateMachine } from '@/editor/input/GestureStateMachine';
import type { GestureHandlers, PointerSample, PressTarget } from '@/editor/input/gestureTypes';
import { subscribeToHockeySpriteAtlas } from '@/canvas/HockeySpriteAtlas';
import { RINK, TABLETOP_MIN_TILT, WHEEL_ZOOM_SENSITIVITY } from '@/core/constants';
import { distance, screenToWorld } from '@/utils/geometry';
import { getAimedNetTarget } from '@/engine/puck';
import type { ID, Point } from '@/core/types';

/** Distance from a net (world units) at which a carrier drag becomes a shot. */
const SHOT_SNAP_DISTANCE = 22 * 5;

export function CanvasSurface() {
  const { state, commands } = useAppState();
  const { camera, playback, holdProgress } = useEditorRuntime();

  const stateRef = useRef(state);
  stateRef.current = state;

  const getState = useCallback(() => stateRef.current, []);

  const onResize = useCallback(
    (width: number, height: number) => camera.setViewport(width, height),
    [camera]
  );
  const layers = useCanvasLayers(onResize);
  const hitTester = useHitTesting({ getState, camera, playback });

  // Transient render inputs that must not become React state.
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const transientRouteRef = useRef<{ ownerId: ID; points: Point[] } | null>(null);
  const movingPlayerRef = useRef<ID | null>(null);
  const lastStaticKey = useRef<string>('');

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  const drawDynamic = useCallback(() => {
    const canvas = layers.dynamicCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || layers.width === 0) return;

    const started = performance.now();
    const current = stateRef.current;
    const frame = playback.getFrame();

    drawDynamicLayer(ctx, {
      camera: camera.camera,
      width: layers.width,
      height: layers.height,
      dpr: layers.dpr,
      drill: current.drill,
      positions: frame.positions,
      playerFrames: frame.playerFrames,
      puck: frame.puck,
      ghostTrails: current.playback.isPlaying ? playback.trails.entries() : [],
      isPlaying: current.playback.isPlaying,
      progress: frame.progress,
      selectedPlayerId: current.selection.selectedPlayerId,
      selectedEventId: current.selection.selectedEventId,
      passFromPlayerId: current.selection.passFromPlayerId,
      movingPlayerId: movingPlayerRef.current,
      transientRoute: transientRouteRef.current,
      dragPreview: dragPreviewRef.current,
      showDiagnostics: current.ui.showDiagnostics,
      reducedEffects: current.drill.settings?.reducedEffects ?? false,
    });

    layers.reportFrameTime(performance.now() - started);
  }, [camera, playback, layers]);

  const drawStatic = useCallback(() => {
    const canvas = layers.staticCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || layers.width === 0) return;

    const input = {
      camera: camera.camera,
      width: layers.width,
      height: layers.height,
      dpr: layers.dpr,
    };
    const key = staticLayerKey(input);
    if (key === lastStaticKey.current) return;
    lastStaticKey.current = key;
    drawStaticLayer(ctx, input);
  }, [camera, layers]);

  // The dynamic layer repaints after every committed React render (an
  // authoring change) and on every playback frame. The static layer only
  // repaints when its key changes - never during camera-stable playback.
  useEffect(() => {
    drawStatic();
    drawDynamic();
  });

  useEffect(() => camera.subscribe(() => {
    drawStatic();
    drawDynamic();
  }), [camera, drawStatic, drawDynamic]);

  useEffect(() => playback.subscribeToFrames(drawDynamic), [playback, drawDynamic]);

  // The generated sprite atlas loads asynchronously; repaint once it arrives.
  useEffect(() => subscribeToHockeySpriteAtlas(drawDynamic), [drawDynamic]);

  // --------------------------------------------------------------------------
  // Gestures
  // --------------------------------------------------------------------------

  const handlers = useMemo<GestureHandlers>(() => {
    const worldOf = (screen: Point) => screenToWorld(screen.x, screen.y, camera.camera);

    const clearTransients = () => {
      dragPreviewRef.current = null;
      transientRouteRef.current = null;
      movingPlayerRef.current = null;
    };

    const handleTap = (screen: Point, target: PressTarget, second: boolean) => {
      const current = stateRef.current;
      const tool = current.ui.currentTool;
      const world = worldOf(screen);

      if (tool === 'erase') {
        eraseAt(target);
        return;
      }

      if (tool === 'home' || tool === 'away' || tool === 'goalie') {
        if (target.kind === 'player') return;
        commands.addPlayer(world, tool);
        return;
      }

      if (tool === 'coach') {
        if (target.kind === 'player' || target.kind === 'coach') return;
        commands.addCoach(world);
        return;
      }

      switch (target.kind) {
        // Tapping a "+" between two controls inserts a point there, which is
        // how a line gains detail after the play is set up.
        case 'route-add':
          commands.insertRouteControl(target.pathId, target.index, target.point);
          return;
        case 'event-add':
          commands.insertEventWaypoint(target.eventId, target.index, target.point);
          return;

        // Tapping a control point a second time removes it.
        case 'route-handle':
          if (second) commands.removeRouteControl(target.pathId, target.index);
          return;
        case 'event-handle':
          if (second && target.part === 'waypoint') {
            commands.removeEventWaypoint(target.eventId, target.index);
          }
          return;

        case 'player':
          if (second) commands.openPlayerInspector(target.playerId);
          else handlePlayerTap(target.playerId);
          break;
        case 'event':
          if (second) commands.openEventInspector(target.eventId);
          else commands.selectEvent(target.eventId);
          break;
        case 'route':
          commands.selectPlayer(target.ownerId);
          break;
        case 'coach':
          commands.selectPlayer(null);
          break;
        default:
          commands.selectPlayer(null);
          commands.selectEvent(null);
          commands.cancelPendingAction();
          break;
      }
    };

    const handlePlayerTap = (playerId: ID) => {
      const current = stateRef.current;
      const pending = current.pendingAction;

      // A pending pass is completed by tapping the receiver.
      if (pending.kind === 'pass') {
        commands.requestPass(pending.playerId, playerId);
        return;
      }
      if (pending.kind === 'shoot') {
        const shooter = current.drill.players.find(player => player.id === pending.playerId);
        if (shooter) commands.requestShot(pending.playerId, netTargetFor(shooter.team));
        return;
      }

      commands.selectPlayer(playerId);
    };

    const eraseAt = (target: PressTarget) => {
      switch (target.kind) {
        case 'player':
          void commands.removePlayer(target.playerId);
          break;
        case 'coach':
          commands.removeCoach(target.coachId);
          break;
        case 'route':
          commands.removeRoute(target.pathId);
          break;
        case 'event':
          commands.removeEvent(target.eventId);
          break;
        default:
          break;
      }
    };

    return {
      onTap: (screen, target) => handleTap(screen, target, false),
      onSecondTap: (screen, target) => handleTap(screen, target, true),

      onHoldStart: playerId => {
        holdProgress.begin(playerId);
      },
      onHoldProgress: fraction => {
        holdProgress.set(fraction);
        if (fraction >= 1) {
          const playerId = holdProgress.playerId;
          if (playerId) {
            commands.beginPlayerMove(playerId);
            movingPlayerRef.current = playerId;
          }
        }
      },
      onHoldCancel: () => holdProgress.cancel(),

      onPlayerMove: (playerId, world) => {
        movingPlayerRef.current = playerId;
        commands.movePlayerTo(playerId, world.x, world.y);
      },
      onPlayerMoveEnd: () => {
        movingPlayerRef.current = null;
        commands.cancelPendingAction();
        drawDynamic();
      },

      onCoachMove: (coachId, world) => commands.moveCoach(coachId, world.x, world.y),

      onRouteSampling: (ownerId, points) => {
        transientRouteRef.current = { ownerId, points };
        commands.setPendingAction({ kind: 'draw-route', playerId: ownerId });
        drawDynamic();
      },
      onRouteCommit: (ownerId, points) => {
        transientRouteRef.current = null;
        commands.commitRoute(ownerId, points);
      },

      onPuckDragPreview: (playerId, from, to, receiverId) => {
        const current = stateRef.current;
        const receiver = receiverId
          ? current.drill.players.find(player => player.id === receiverId) ?? null
          : null;
        const nearNet =
          Math.min(
            distance(to, { x: RINK.netLeftX, y: RINK.netLeftY }),
            distance(to, { x: RINK.netRightX, y: RINK.netRightY })
          ) < SHOT_SNAP_DISTANCE;

        dragPreviewRef.current = {
          kind: receiver ? 'pass' : nearNet ? 'shoot' : 'pass',
          from,
          to,
          receiver,
        };
        commands.setPendingAction({ kind: receiver || !nearNet ? 'pass' : 'shoot', playerId });
        drawDynamic();
      },

      onPuckDragRelease: (playerId, from, releaseScreen, receiverId) => {
        dragPreviewRef.current = null;
        const current = stateRef.current;
        const release = worldOf(releaseScreen);
        const passer = current.drill.players.find(player => player.id === playerId);
        const receiver = receiverId
          ? current.drill.players.find(player => player.id === receiverId)
          : undefined;

        // A pass only lands on a teammate. Dragging onto an opponent is not a
        // pass, so the net check below can still turn it into a shot.
        if (receiver && passer && receiver.team === passer.team && receiver.id !== passer.id) {
          commands.requestPass(playerId, receiver.id, { fromPoint: from });
          return;
        }

        const nearNet =
          Math.min(
            distance(release, { x: RINK.netLeftX, y: RINK.netLeftY }),
            distance(release, { x: RINK.netRightX, y: RINK.netRightY })
          ) < SHOT_SNAP_DISTANCE;

        if (nearNet) commands.requestShot(playerId, getAimedNetTarget(release));
        else commands.requestDump(playerId, release, from);
      },

      onRouteHandleDrag: (pathId, index, world) => {
        commands.setPendingAction({ kind: 'edit-route', pathId });
        commands.moveRouteControl(pathId, index, world);
      },

      onEventHandleDrag: (eventId, part, index, world) => {
        commands.setPendingAction({ kind: 'edit-event', eventId });
        if (part === 'end') commands.setEventTarget(eventId, world);
        else commands.moveEventWaypoint(eventId, index, world);
      },

      onEditGestureEnd: () => {
        commands.cancelPendingAction();
      },

      onPanOrOrbit: next => camera.setCamera(next),
      onPinch: next => camera.setCamera(next),

      onGestureCancel: () => {
        clearTransients();
        drawDynamic();
      },
    };
  }, [camera, commands, drawDynamic, holdProgress]);

  // The machine MUST outlive renders. It holds the in-flight gesture, and a
  // gesture spans many renders: the first sample of a route dispatches a
  // pending action, which re-renders, and a machine rebuilt at that moment
  // would forget the pointer and silently drop the rest of the drag.
  //
  // So it is built once, and reads its handlers and hit tester through refs.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const hitTesterRef = useRef(hitTester);
  hitTesterRef.current = hitTester;

  const machine = useMemo(() => {
    const forward = <T extends object>(get: () => T): T =>
      new Proxy({} as T, {
        get: (_target, property) => Reflect.get(get() as object, property),
      });

    return new GestureStateMachine({
      hitTester: forward(() => hitTesterRef.current),
      handlers: forward(() => handlersRef.current),
      getContext: () => ({
        camera: camera.camera,
        isPlaying: stateRef.current.playback.isPlaying,
        isTabletop: (camera.camera.tilt ?? 0) > TABLETOP_MIN_TILT,
        holdToMoveEnabled: true,
        selectedId:
          stateRef.current.selection.selectedPlayerId ?? stateRef.current.selection.selectedEventId,
      }),
    });
  }, [camera]);

  // A tool change or a modal opening abandons any half-finished gesture.
  useEffect(() => {
    machine.abort();
  }, [machine, state.ui.currentTool, state.ui.showMenu, state.ui.openSheet, state.drill.id]);

  const toSample = useCallback(
    (event: React.PointerEvent): PointerSample => {
      const canvas = layers.dynamicCanvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      return {
        pointerId: event.pointerId,
        position: {
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0),
        },
        pointerType: (event.pointerType as 'mouse' | 'touch' | 'pen') || 'mouse',
      };
    },
    [layers.dynamicCanvasRef]
  );

  // Wheel is registered natively: React's onWheel is passive and cannot
  // preventDefault, so the page would scroll while zooming.
  useEffect(() => {
    const canvas = layers.dynamicCanvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      camera.zoomAt(Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [camera, layers.dynamicCanvasRef]);

  return (
    <div ref={layers.containerRef} className="arena-stage absolute inset-0 overflow-hidden">
      <canvas ref={layers.staticCanvasRef} className="absolute inset-0 block" aria-hidden="true" />
      <canvas
        ref={layers.dynamicCanvasRef}
        className="rink-surface absolute inset-0 block"
        role="application"
        aria-label="Hockey rink. Use the tool dock below to add players and draw routes."
        onPointerDown={event => {
          layers.dynamicCanvasRef.current?.setPointerCapture(event.pointerId);
          machine.pointerDown(toSample(event));
        }}
        onPointerMove={event => machine.pointerMove(toSample(event))}
        onPointerUp={event => {
          layers.dynamicCanvasRef.current?.releasePointerCapture?.(event.pointerId);
          machine.pointerUp(toSample(event));
        }}
        onPointerCancel={event => machine.pointerCancel(toSample(event))}
        onContextMenu={event => event.preventDefault()}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------

function netTargetFor(team: 'home' | 'away'): Point {
  return team === 'home'
    ? { x: RINK.netRightX, y: RINK.netRightY }
    : { x: RINK.netLeftX, y: RINK.netLeftY };
}
