// ============================================================================
// HIT TESTING
//
// World-coordinate hit tests, shared by the gesture machine and the keyboard
// paths. Everything reads live state through refs, so the tester identity is
// stable and never re-creates the gesture machine.
//
// Lines are hit-tested against their DRAWN geometry, not their control
// polygon: for a spline the two differ, and the user is aiming at what they
// can see.
// ============================================================================

import { useMemo } from 'react';
import type { AppState, DrillEvent, ID, Point, SkatePath } from '@/core/types';
import {
  PATH_HIT_DISTANCE,
  PLAYER_HIT_RADIUS,
  ROUTE_HANDLE_OFFSET,
  ROUTE_HANDLE_RADIUS,
} from '@/core/constants';
import { closestPointOnPolyline, distance, screenToWorld } from '@/utils/geometry';
import { controlMidpoints, expandCurve } from '@/utils/curves';
import { flightControls } from '@/sim/flightPath';
import { getCurrentPuckHolder, canAddEvents } from '@/engine/puck';
import type { CameraStore } from '@/camera/CameraStore';
import type { PlaybackStore } from '@/playback/PlaybackStore';
import type { HitTester } from '@/editor/input/gestureTypes';

/** Screen-pixel radius for grabbing an edit handle. */
const HANDLE_HIT = 20;
/** Tighter, so an add-affordance never steals a control point's grab. */
const ADD_HANDLE_HIT = 14;
/** How forgiving pass targeting is, in screen pixels. */
const PASS_TARGET_RADIUS = 68;
const PASS_ROUTE_RADIUS = 42;

export interface HitTestingOptions {
  getState: () => AppState;
  camera: CameraStore;
  playback: PlaybackStore;
}

export function useHitTesting({ getState, camera, playback }: HitTestingOptions): HitTester {
  return useMemo<HitTester>(() => {
    const toWorld = (point: Point): Point => screenToWorld(point.x, point.y, camera.camera);

    /** Where a player is drawn right now: interpolated while scrubbing. */
    const drawnPosition = (playerId: ID, fallback: Point): Point =>
      playback.positionFor(playerId) ?? fallback;

    /** The route of the currently selected player, if any, while paused. */
    const selectedRoute = (): SkatePath | null => {
      const state = getState();
      if (state.playback.isPlaying) return null;
      const ownerId = state.selection.selectedPlayerId;
      if (!ownerId) return null;
      return state.drill.skatePaths.find(route => route.ownerId === ownerId) ?? null;
    };

    const selectedEvent = (): DrillEvent | null => {
      const state = getState();
      if (state.playback.isPlaying) return null;
      const eventId = state.selection.selectedEventId;
      if (!eventId) return null;
      return state.drill.events.find(item => item.id === eventId) ?? null;
    };

    return {
      toWorld,

      playerAt(point) {
        const { drill } = getState();
        const world = toWorld(point);
        // Topmost first, matching draw order.
        for (let index = drill.players.length - 1; index >= 0; index--) {
          const player = drill.players[index];
          const at = drawnPosition(player.id, player);
          if (distance(at, world) < PLAYER_HIT_RADIUS) {
            const holder = getCurrentPuckHolder(drill.players, drill.events);
            return {
              id: player.id,
              isCarrier: holder?.id === player.id && canAddEvents(drill.events),
            };
          }
        }
        return null;
      },

      coachAt(point) {
        const { drill } = getState();
        const world = toWorld(point);
        const coaches = drill.coaches ?? [];
        for (let index = coaches.length - 1; index >= 0; index--) {
          if (distance(coaches[index], world) < PLAYER_HIT_RADIUS * 1.2) return coaches[index].id;
        }
        return null;
      },

      routeAt(point) {
        const { drill } = getState();
        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        for (const path of drill.skatePaths) {
          if (!path.points || path.points.length < 2) continue;
          const line = expandCurve(path.points, path.shape ?? 'spline');
          const hit = closestPointOnPolyline(line, world);
          if (hit.distance * zoom < PATH_HIT_DISTANCE) {
            return { pathId: path.id, ownerId: path.ownerId, point: hit.point };
          }
        }
        return null;
      },

      eventAt(point) {
        const { drill } = getState();
        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        for (let index = drill.events.length - 1; index >= 0; index--) {
          const event = drill.events[index];
          const line = expandCurve(
            flightControls(event, event.fromPoint, event.toPoint),
            event.shape ?? 'spline'
          );
          const hit = closestPointOnPolyline(line, world);
          if (hit.distance * zoom <= PATH_HIT_DISTANCE) return event.id;
        }
        return null;
      },

      /**
       * A control point of the selected player's route.
       *
       * These are the STORED control points, not resampled proxies, so
       * dragging one moves exactly the point that was grabbed and leaves the
       * rest of the route untouched.
       */
      routeHandleAt(point) {
        const path = selectedRoute();
        if (!path || path.points.length < 2) return null;

        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        // Index 0 is pinned to the player and is not draggable.
        for (let index = 1; index < path.points.length; index++) {
          if (distance(path.points[index], world) * zoom < HANDLE_HIT) {
            return { pathId: path.id, index };
          }
        }
        return null;
      },

      /** The "+" affordance halfway along a route segment. */
      routeAddHandleAt(point) {
        const path = selectedRoute();
        if (!path || path.points.length < 2) return null;

        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        for (const midpoint of controlMidpoints(path.points)) {
          if (distance(midpoint.point, world) * zoom < ADD_HANDLE_HIT) {
            return { pathId: path.id, index: midpoint.index, point: midpoint.point };
          }
        }
        return null;
      },

      eventHandleAt(point) {
        const event = selectedEvent();
        if (!event) return null;

        const world = toWorld(point);
        const zoom = camera.camera.zoom;

        // Waypoints first: they sit on the line and are what a coach reaches
        // for when reshaping a pass.
        const waypoints = event.waypoints ?? [];
        for (let index = 0; index < waypoints.length; index++) {
          if (distance(waypoints[index], world) * zoom < HANDLE_HIT) {
            return { eventId: event.id, part: 'waypoint', index };
          }
        }

        if (
          (event.type === 'shot' || event.type === 'dump') &&
          distance(event.toPoint, world) * zoom < HANDLE_HIT
        ) {
          return { eventId: event.id, part: 'end', index: -1 };
        }
        return null;
      },

      /** The "+" affordance halfway along a puck-line segment. */
      eventAddHandleAt(point) {
        const event = selectedEvent();
        if (!event) return null;

        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        const controls = flightControls(event, event.fromPoint, event.toPoint);
        for (const midpoint of controlMidpoints(controls)) {
          if (distance(midpoint.point, world) * zoom < ADD_HANDLE_HIT) {
            // Control index i is waypoint index i - 1, because control 0 is
            // the release point.
            return { eventId: event.id, index: midpoint.index - 1, point: midpoint.point };
          }
        }
        return null;
      },

      routeAffordanceAt(point) {
        const state = getState();
        if (state.playback.isPlaying) return null;
        const selectedId = state.selection.selectedPlayerId;
        if (!selectedId) return null;

        const selected = state.drill.players.find(player => player.id === selectedId);
        if (!selected) return null;

        const world = toWorld(point);
        const handle = { x: selected.x + ROUTE_HANDLE_OFFSET, y: selected.y };
        return distance(world, handle) <= ROUTE_HANDLE_RADIUS * 1.45 ? selected.id : null;
      },

      /**
       * Passing is deliberately more forgiving than selecting a token: a coach
       * can release near the skater OR anywhere along that skater's route and
       * the gesture still locks to the intended receiver.
       */
      passReceiverAt(point, excludePlayerId) {
        const { drill } = getState();
        const world = toWorld(point);
        const zoom = camera.camera.zoom;
        let best: { id: ID; screenDistance: number } | null = null;

        for (const player of drill.players) {
          if (player.id === excludePlayerId) continue;
          const screenDistance = distance(player, world) * zoom;
          if (screenDistance <= PASS_TARGET_RADIUS && (!best || screenDistance < best.screenDistance)) {
            best = { id: player.id, screenDistance };
          }
        }

        for (const path of drill.skatePaths) {
          if (path.ownerId === excludePlayerId || path.points.length < 2) continue;
          if (!drill.players.some(player => player.id === path.ownerId)) continue;
          const line = expandCurve(path.points, path.shape ?? 'spline');
          const routeDistance = closestPointOnPolyline(line, world).distance * zoom;
          // Prefer a direct token hit, but make a clearly targeted route valid.
          const weighted = routeDistance + 12;
          if (routeDistance <= PASS_ROUTE_RADIUS && (!best || weighted < best.screenDistance)) {
            best = { id: path.ownerId, screenDistance: weighted };
          }
        }

        return best?.id ?? null;
      },
    };
  }, [getState, camera, playback]);
}
