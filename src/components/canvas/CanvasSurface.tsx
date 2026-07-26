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
import { authoredEvents, getAimedNetTarget } from '@/engine/puck';
import {
  eligibleReceivers,
  resolvePassTarget,
  type PassTargetContext,
} from '@/editor/passing/passTargetService';
import type { PassCandidateView } from '@/canvas/PassOverlay';
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
  /**
   * The player being dragged, and where the pointer has taken it. Transient:
   * it never reaches the reducer, and one MOVE_PLAYER is dispatched on
   * release.
   */
  const draggedPlayerRef = useRef<{ id: ID; point: Point } | null>(null);
  /**
   * Who the armed pass can go to. Recomputed when the pass is armed or the
   * drill changes - never per frame, because scoring a receiver solves an
   * interception against a compiled drill.
   */
  const passCandidatesRef = useRef<{ passerId: ID; candidates: PassCandidateView[] } | null>(null);
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
      movingPlayerId: draggedPlayerRef.current?.id ?? null,
      draggedPlayer: draggedPlayerRef.current,
      transientRoute: transientRouteRef.current,
      dragPreview: dragPreviewRef.current,
      passCandidates: current.playback.isPlaying ? null : passCandidatesRef.current,
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

  /**
   * The context every pass path shares, so tap, drag and keyboard cannot
   * disagree about who is a legal receiver.
   */
  const passContext = useCallback((passerId: ID, from?: Point): PassTargetContext => {
    const current = stateRef.current;
    const passer = current.drill.players.find(player => player.id === passerId);
    const authored = authoredEvents(current.drill.events);
    const previousArrival = authored.length ? authored[authored.length - 1].arrivalAt ?? 0 : 0;

    return {
      drill: current.drill,
      passerId,
      // The DRAWN position, not the authored one. Using the authored start
      // coordinates meant that after scrubbing, the visible player and the
      // pass target were in different places.
      positionOf: id =>
        playback.positionFor(id) ??
        current.drill.players.find(player => player.id === id) ?? { x: 0, y: 0 },
      zoom: camera.camera.zoom,
      departureAt: Math.min(0.94, Math.max(0.12, previousArrival + 0.04)),
      from: from ?? (passer ? { x: passer.x, y: passer.y } : { x: 0, y: 0 }),
    };
  }, [camera, playback]);

  // Recompute the candidate set whenever the armed pass or the drill changes.
  // Doing this per frame would compile the drill sixty times a second.
  const pending = state.pendingAction;
  const armedPasserId = pending.kind === 'pass' ? pending.playerId : null;
  useEffect(() => {
    if (!armedPasserId) {
      passCandidatesRef.current = null;
      drawDynamic();
      return;
    }
    const context = passContext(armedPasserId);
    passCandidatesRef.current = {
      passerId: armedPasserId,
      candidates: eligibleReceivers(context).map(candidate => ({
        actorId: candidate.actorId,
        predictedCatchQuality: candidate.predictedCatchQuality,
        targetPoint: candidate.targetPoint,
      })),
    };
    drawDynamic();
  }, [armedPasserId, state.documentRevision, passContext, drawDynamic]);

  const handlers = useMemo<GestureHandlers>(() => {
    const worldOf = (screen: Point) => screenToWorld(screen.x, screen.y, camera.camera);

    const clearTransients = () => {
      dragPreviewRef.current = null;
      transientRouteRef.current = null;
      draggedPlayerRef.current = null;
    };

    /**
     * Act on a resolved pass target.
     *
     * Two rules from the rebuild spec live here: a miss never cancels Pass, and
     * an invalid target never becomes some other hockey action. Both used to be
     * violated - a near-miss called `cancelPendingAction()` with no message, so
     * on a phone the control simply appeared not to work.
     */
    const applyPassResolution = (
      passerId: ID,
      world: Point,
      options: { from?: Point; allowSpace?: boolean } = {}
    ): 'committed' | 'armed' => {
      const resolution = resolvePassTarget(passContext(passerId, options.from), world, {
        allowSpace: options.allowSpace,
      });

      switch (resolution.kind) {
        case 'receiver':
          void commands.requestPass(passerId, resolution.candidate.actorId, {
            fromPoint: options.from,
          });
          return 'committed';

        case 'opponent':
          commands.guide(resolution.reason);
          return 'armed';

        case 'space':
        case 'miss':
          commands.guide(
            resolution.kind === 'miss'
              ? resolution.reason
              : 'Passing to open ice is not available yet — choose a teammate.'
          );
          return 'armed';
      }
    };

    const handleTap = (screen: Point, target: PressTarget, second: boolean) => {
      const current = stateRef.current;
      const tool = current.ui.currentTool;
      const world = worldOf(screen);

      // A move armed by the Move button is finished by tapping where the
      // player should stand. Pressing the player itself drags it instead, so
      // that case never reaches here.
      if (current.pendingAction.kind === 'move-player') {
        commands.movePlayerTo(current.pendingAction.playerId, world.x, world.y);
        commands.cancelPendingAction();
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

      // An armed pass is resolved by the SAME hit test the drag path uses, so
      // it connects to a teammate's token or to any point on their skating
      // route. Tapping the line a receiver is skating is how you pass to
      // where they will be, which is how the play is actually drawn.
      //
      // The tap used to require a direct hit on the token, so tapping a
      // receiver's route selected that player and silently dropped the pass.
      if (current.pendingAction.kind === 'pass') {
        // A tap never authors a pass to open ice: a stray touch would create a
        // puck action nobody asked for. Dragging is the deliberate gesture.
        applyPassResolution(current.pendingAction.playerId, world);
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

    // A pass is handled before this, by `passReceiverAt`.
    const handlePlayerTap = (playerId: ID) => {
      commands.selectPlayer(playerId);
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
            const player = stateRef.current.drill.players.find(item => item.id === playerId);
            if (player) draggedPlayerRef.current = { id: playerId, point: { x: player.x, y: player.y } };
          }
        }
      },
      onHoldCancel: () => holdProgress.cancel(),

      // The drag itself is a preview. Nothing is written to the document until
      // the finger comes up, so one gesture is one edit and one undo entry.
      onPlayerMove: (playerId, world) => {
        draggedPlayerRef.current = { id: playerId, point: world };
        drawDynamic();
      },
      onPlayerMoveEnd: playerId => {
        const landed = draggedPlayerRef.current;
        draggedPlayerRef.current = null;
        if (landed && landed.id === playerId) {
          commands.movePlayerTo(playerId, landed.point.x, landed.point.y);
        }
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

      onPuckDragRelease: (playerId, from, releaseScreen) => {
        dragPreviewRef.current = null;
        const release = worldOf(releaseScreen);

        // Aiming at a net is a deliberate shot, and stays one.
        const nearNet =
          Math.min(
            distance(release, { x: RINK.netLeftX, y: RINK.netLeftY }),
            distance(release, { x: RINK.netRightX, y: RINK.netRightY })
          ) < SHOT_SNAP_DISTANCE;
        if (nearNet) {
          void commands.requestShot(playerId, getAimedNetTarget(release));
          return;
        }

        // Everything else goes through the same resolution as a tap. A drag
        // that misses used to become a DUMP - a destructive reading of an
        // imprecise finger release, which put a puck action on the ice that
        // the coach never intended and which ends the drill.
        applyPassResolution(playerId, release, { from });
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
  }, [camera, commands, drawDynamic, holdProgress, passContext]);

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
        armedMovePlayerId:
          stateRef.current.pendingAction.kind === 'move-player'
            ? stateRef.current.pendingAction.playerId
            : null,
        armedRoutePlayerId:
          stateRef.current.pendingAction.kind === 'draw-route'
            ? stateRef.current.pendingAction.playerId
            : null,
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

  // The arena photograph is presentation dressing, not an editing surface.
  const isTabletopView = (camera.camera.tilt ?? 0) > TABLETOP_MIN_TILT;

  return (
    // The arena photograph is presentation dressing, not an editing surface:
    // behind a flat board it makes the rink look like a miniature inside a
    // picture. It stays for the tabletop, which IS the presentation view.
    <div
      ref={layers.containerRef}
      className={`${isTabletopView ? 'arena-stage' : 'board-stage'} absolute inset-0 overflow-hidden`}
    >
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

