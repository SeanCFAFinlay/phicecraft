// ============================================================================
// AUTHORING COMMANDS
//
// Every hockey edit in the app funnels through here: the canvas, the toolbar,
// the inspectors, the keyboard, and the menus. Rules live in `src/engine`, and
// this layer is what applies them consistently, records the undo boundary, and
// tells the user what happened.
// ============================================================================

import type {
  CoachMarker,
  CurveShape,
  DrillEvent,
  ID,
  PassEvent,
  Player,
  Point,
  SkatePath,
  Team,
} from '@/core/types';
import {
  createCoach,
  createPlayer,
  createSkatePath,
  nextGoalieNumber,
  nextPlayerNumber,
} from '@/engine/drill';
import {
  canAddEvents,
  getCurrentPuckHolder,
  teamForDefendedNet,
  netSideForPoint,
  validatePass,
  validateShot,
} from '@/engine/puck';
import { constrainToRink, distance, isInsideRink } from '@/utils/geometry';
import {
  MAX_COMFORTABLE_CONTROLS,
  MIN_CONTROLS,
  ROUTE_CONTROL_TARGET,
  insertControl,
  moveControl,
  removeControl,
  simplifyToControls,
} from '@/utils/curves';
import { measureFlight } from '@/sim/flightPath';
import { IMPORT_LIMITS } from '@/persistence/schema';
import { generateId } from '@/utils/id';
import { DEFAULT_DRILL_DURATION, PLAYER_RADIUS, RINK_CENTER_X } from '@/core/constants';
import { compileDrill } from '@/sim/compileDrill';
import {
  getAuthoredPassInterception,
  getAuthoredPlayerBlade,
  getAuthoredPuck,
  getAuthoredReleaseProgress,
} from '@/sim/authoring';
import { CONFIRMATIONS } from './confirmations';
import { done, failed, rejected, type AuthoringCommands, type CommandHost, type CommandResult } from './commandTypes';

/** A puck line bent through more than this is a scribble, not a drill. */
const MAX_EVENT_WAYPOINTS = IMPORT_LIMITS.maxWaypointsPerEvent;

/** Keep authored objects this far off the boards so they stay grabbable. */
export const RINK_MARGIN = PLAYER_RADIUS;

export function createAuthoringCommands(host: CommandHost): AuthoringCommands {
  const { dispatch, getState, notify } = host;

  const reject = (reason: string): CommandResult => {
    notify.toast({ message: reason, type: 'warning', dedupeKey: `reject:${reason}` });
    return rejected(reason);
  };

  const findPlayer = (id: ID): Player | undefined =>
    getState().drill.players.find(player => player.id === id);

  const findRoute = (id: ID): SkatePath | undefined =>
    getState().drill.skatePaths.find(route => route.id === id);

  const findEvent = (id: ID): DrillEvent | undefined =>
    getState().drill.events.find(event => event.id === id);

  /**
   * Apply a geometry change to a puck line, re-timing its arrival so the puck
   * keeps the speed it was authored at.
   *
   * Scaling the existing flight window by the length ratio - rather than
   * recomputing from a nominal puck speed - preserves whatever pace the author
   * or the interception solver originally chose, and only charges for the
   * extra distance the new shape adds.
   */
  function applyEventGeometry(
    event: DrillEvent,
    changes: { toPoint?: Point; waypoints?: Point[]; shape?: CurveShape }
  ): void {
    const shape = changes.shape ?? event.shape ?? 'spline';
    const waypoints = changes.waypoints ?? event.waypoints ?? [];
    const toPoint = changes.toPoint ?? event.toPoint;

    const before = measureFlight(
      event.fromPoint,
      event.waypoints ?? [],
      event.toPoint,
      event.shape ?? 'spline'
    );
    const after = measureFlight(event.fromPoint, waypoints, toPoint, shape);

    let arrivalAt: number | undefined;
    if (
      event.at !== undefined &&
      event.arrivalAt !== undefined &&
      before > 1e-6 &&
      event.arrivalAt > event.at
    ) {
      const window = event.arrivalAt - event.at;
      arrivalAt = Math.min(1, Math.max(event.at + 0.005, event.at + window * (after / before)));
    }

    dispatch({
      type: 'UPDATE_EVENT_GEOMETRY',
      id: event.id,
      ...changes,
      waypoints: changes.waypoints,
      arrivalAt,
    });
  }

  // --------------------------------------------------------------------------
  // Event authoring helpers
  //
  // Ported verbatim from the old hook so the deterministic release/arrival
  // timing the simulation depends on is unchanged - only the call path moved.
  // --------------------------------------------------------------------------

  /**
   * The drill's compiled length in seconds. Read from the engine rather than
   * from playback state, so authoring a shot does not depend on whether the
   * playhead has ever been moved.
   */
  function drillDurationSeconds(): number {
    const duration = compileDrill(getState().drill).durationSeconds;
    return duration > 0 ? duration : DEFAULT_DRILL_DURATION;
  }

  function releaseTimeFor(playerId: ID, authoredSource: Point, floor = 0.12): number {
    const { drill } = getState();
    const hasRoute = drill.skatePaths.some(path => path.ownerId === playerId);
    const previousArrival = drill.events.length
      ? drill.events[drill.events.length - 1].arrivalAt ?? 0
      : 0;
    const authored = hasRoute
      ? getAuthoredReleaseProgress(drill, playerId, authoredSource)
      : Math.max(floor, previousArrival + 0.04);
    return Math.min(0.94, Math.max(authored, previousArrival + 0.04));
  }

  function buildPassEvent(fromPlayer: Player, toPlayer: Player, fromPoint?: Point): PassEvent {
    const { drill } = getState();
    const authoredSource = fromPoint ?? { x: fromPlayer.x, y: fromPlayer.y };
    const at = releaseTimeFor(fromPlayer.id, authoredSource);
    const source = getAuthoredPlayerBlade(drill, fromPlayer.id, at) ?? authoredSource;
    const interception = getAuthoredPassInterception(drill, source, toPlayer.id, at) ?? {
      toPoint: { x: toPlayer.x, y: toPlayer.y },
      arrivalAt: Math.min(0.98, at + 0.08),
    };

    return {
      id: generateId(),
      type: 'pass',
      fromPlayerId: fromPlayer.id,
      toPlayerId: toPlayer.id,
      fromPoint: source,
      toPoint: interception.toPoint,
      team: fromPlayer.team,
      at,
      arrivalAt: interception.arrivalAt,
    };
  }

  // --------------------------------------------------------------------------
  // Commands
  // --------------------------------------------------------------------------

  return {
    setTool(tool) {
      dispatch({ type: 'SET_TOOL', tool });
      dispatch({ type: 'CANCEL_PENDING_ACTION' });
    },

    setEditorStep(step) {
      dispatch({ type: 'SET_EDITOR_STEP', step });
    },

    selectPlayer(id) {
      dispatch({ type: 'SELECT_PLAYER', id });
      if (id === null) dispatch({ type: 'CLOSE_INSPECTOR' });
    },

    selectEvent(id) {
      dispatch({ type: 'SELECT_EVENT', id });
      if (id === null) dispatch({ type: 'CLOSE_INSPECTOR' });
    },

    openPlayerInspector(id) {
      dispatch({ type: 'SELECT_PLAYER', id });
      dispatch({ type: 'OPEN_INSPECTOR', target: { kind: 'player', playerId: id } });
    },

    openEventInspector(id) {
      dispatch({ type: 'SELECT_EVENT', id });
      dispatch({ type: 'OPEN_INSPECTOR', target: { kind: 'event', eventId: id } });
    },

    closeInspector() {
      dispatch({ type: 'CLOSE_INSPECTOR' });
    },

    setPendingAction(action) {
      dispatch({ type: 'SET_PENDING_ACTION', action });
    },

    cancelPendingAction() {
      const { pendingAction } = getState();
      if (pendingAction.kind === 'none') return;
      dispatch({ type: 'CANCEL_PENDING_ACTION' });
      host.announce('Action cancelled');
    },

    // ------------------------------------------------------------------------
    // Players and coaches
    // ------------------------------------------------------------------------

    addPlayer(point, kind) {
      const state = getState();
      const position = constrainToRink(point, RINK_MARGIN);

      // A goalie belongs to whichever team defends the end they were placed
      // in. This is the same convention the default lineup uses.
      const team: Team = kind === 'goalie' ? teamForDefendedNet(netSideForPoint(position)) : kind;
      const number =
        kind === 'goalie'
          ? nextGoalieNumber(state.drill.players, team)
          : nextPlayerNumber(state.drill.players, team);

      const player = createPlayer(
        position.x,
        position.y,
        team,
        number,
        kind === 'goalie' ? 'G' : 'F'
      );

      dispatch({ type: 'ADD_PLAYER', player });
      notify.toast({
        message:
          kind === 'goalie'
            ? `Goalie #${number} placed in the ${team} end`
            : `${team === 'home' ? 'Home' : 'Away'} #${number} placed`,
        type: 'success',
        dedupeKey: `placed:${player.id}`,
      });
      return done(player.id);
    },

    async removePlayer(id) {
      const player = findPlayer(id);
      if (!player) return rejected('That player is no longer on the ice.');

      const confirmed = await host.confirm({
        ...CONFIRMATIONS.removePlayer,
        title: `Remove #${player.number}?`,
      });
      if (!confirmed) return { status: 'cancelled' };

      dispatch({ type: 'REMOVE_PLAYER', id });
      dispatch({ type: 'CLOSE_INSPECTOR' });
      notify.toast({ message: `#${player.number} removed`, type: 'success' });
      return done();
    },

    beginPlayerMove(id) {
      if (!findPlayer(id)) return rejected('That player is no longer on the ice.');
      // One undo entry for the whole gesture, recorded before the first move.
      dispatch({ type: 'PUSH_UNDO' });
      dispatch({ type: 'SET_PENDING_ACTION', action: { kind: 'move-player', playerId: id } });
      return done();
    },

    movePlayerTo(id, x, y) {
      const position = constrainToRink({ x, y }, RINK_MARGIN);
      dispatch({ type: 'MOVE_PLAYER', id, x: position.x, y: position.y });
      return done();
    },

    async setPuckCarrier(id) {
      const state = getState();
      const player = findPlayer(id);
      if (!player) return rejected('That player is no longer on the ice.');

      if (state.drill.events.length > 0) {
        const confirmed = await host.confirm({
          ...CONFIRMATIONS.restartPossession,
          title: `Give the puck to #${player.number}?`,
        });
        if (!confirmed) return { status: 'cancelled' };
        dispatch({ type: 'CLEAR_PUCK_ACTIONS' });
      }

      dispatch({ type: 'SET_PUCK_CARRIER', id });
      notify.toast({ message: `#${player.number} starts with the puck`, type: 'success' });
      return done();
    },

    updatePlayerVisual(id, visual) {
      dispatch({ type: 'UPDATE_PLAYER_VISUAL', id, visual });
    },

    setJersey(team, hex) {
      dispatch({ type: 'SET_JERSEY', team, hex });
    },

    swapJerseys() {
      dispatch({ type: 'SWAP_JERSEYS' });
      notify.toast({ message: 'Team colours swapped', type: 'success', dedupeKey: 'swap-jerseys' });
    },

    addCoach(point) {
      const position = constrainToRink(point, RINK_MARGIN);
      const coach: CoachMarker = createCoach(position.x, position.y);
      dispatch({ type: 'ADD_COACH', coach });
      notify.toast({ message: 'Coach placed', type: 'success', dedupeKey: `coach:${coach.id}` });
      return done(coach.id);
    },

    moveCoach(id, x, y) {
      const position = constrainToRink({ x, y }, RINK_MARGIN);
      dispatch({ type: 'MOVE_COACH', id, x: position.x, y: position.y });
    },

    removeCoach(id) {
      dispatch({ type: 'REMOVE_COACH', id });
      notify.toast({ message: 'Coach removed', type: 'success' });
      return done();
    },

    // ------------------------------------------------------------------------
    // Routes
    // ------------------------------------------------------------------------

    commitRoute(ownerId, rawPoints) {
      const owner = findPlayer(ownerId);
      if (!owner) return rejected('That player is no longer on the ice.');
      if (rawPoints.length < 2) return rejected('That route was too short to keep.');

      // Hundreds of raw pointer samples become a handful of CONTROL POINTS,
      // every one of which is a grabbable handle. The route is stored as that
      // control polygon; its shape decides how it is drawn and skated.
      const points = simplifyToControls(rawPoints, ROUTE_CONTROL_TARGET).map(point =>
        constrainToRink(point, RINK_MARGIN)
      );
      const path: SkatePath = createSkatePath(ownerId, owner.team, points);

      dispatch({ type: 'ADD_SKATE_PATH', path });
      dispatch({ type: 'SELECT_PLAYER', id: ownerId });
      dispatch({ type: 'CANCEL_PENDING_ACTION' });
      notify.toast({
        message: `Route drawn for #${owner.number} — drag its handles to reshape`,
        type: 'success',
        dedupeKey: 'route-drawn',
      });
      return done(path.id);
    },

    // ------------------------------------------------------------------------
    // Reshaping a route after it is drawn
    //
    // `points` is the stored control polygon, so these move exactly the point
    // the author grabbed. The previous implementation resampled five proxy
    // handles and, on drag, replaced the whole route with a five-point smooth -
    // adjusting a route destroyed it.
    // ------------------------------------------------------------------------

    moveRouteControl(pathId, index, to) {
      const path = findRoute(pathId);
      if (!path) return rejected('That route is no longer on the ice.');
      if (index <= 0 || index >= path.points.length) {
        // Index 0 is pinned to the player: a route has to start where they do.
        return rejected('That point cannot be moved.');
      }

      dispatch({
        type: 'UPDATE_SKATE_POINTS',
        id: pathId,
        points: moveControl(path.points, index, constrainToRink(to, RINK_MARGIN)),
      });
      return done();
    },

    insertRouteControl(pathId, index, at) {
      const path = findRoute(pathId);
      if (!path) return rejected('That route is no longer on the ice.');

      dispatch({ type: 'PUSH_UNDO' });
      dispatch({
        type: 'UPDATE_SKATE_POINTS',
        id: pathId,
        points: insertControl(path.points, index, constrainToRink(at, RINK_MARGIN)),
      });
      return done();
    },

    removeRouteControl(pathId, index) {
      const path = findRoute(pathId);
      if (!path) return rejected('That route is no longer on the ice.');
      if (path.points.length <= MIN_CONTROLS) {
        return reject('A route needs at least two points.');
      }
      if (index <= 0) return rejected('The starting point cannot be removed.');

      dispatch({ type: 'PUSH_UNDO' });
      dispatch({ type: 'UPDATE_SKATE_POINTS', id: pathId, points: removeControl(path.points, index) });
      return done();
    },

    setRouteShape(pathId, shape) {
      const path = findRoute(pathId);
      if (!path) return rejected('That route is no longer on the ice.');
      if ((path.shape ?? 'spline') === shape) return done();

      dispatch({ type: 'UPDATE_SKATE_PATH', id: pathId, updates: { shape } });
      notify.toast({
        message: shape === 'spline' ? 'Route curves through its points' : 'Route runs straight between its points',
        type: 'info',
        duration: 2200,
        dedupeKey: `route-shape:${shape}`,
      });
      return done();
    },

    simplifyRoute(pathId) {
      const path = findRoute(pathId);
      if (!path) return rejected('That route is no longer on the ice.');
      if (path.points.length <= MAX_COMFORTABLE_CONTROLS) {
        return reject('That route already has a handful of editable points.');
      }

      const before = path.points.length;
      dispatch({ type: 'PUSH_UNDO' });
      dispatch({
        type: 'UPDATE_SKATE_POINTS',
        id: pathId,
        points: simplifyToControls(path.points),
      });
      notify.toast({
        message: `Route reduced from ${before} points to ${ROUTE_CONTROL_TARGET} editable ones`,
        type: 'success',
      });
      return done();
    },

    updateRouteStyle(pathId, updates) {
      const path = findRoute(pathId);
      if (!path) return;
      dispatch({
        type: 'UPDATE_SKATE_PATH',
        id: pathId,
        updates: { mode: updates.mode ?? path.mode ?? 'skate', finish: updates.finish ?? path.finish ?? 'stop' },
      });
    },

    removeRoute(pathId) {
      dispatch({ type: 'REMOVE_SKATE_PATH', id: pathId });
      notify.toast({ message: 'Route removed', type: 'success' });
      return done();
    },

    // ------------------------------------------------------------------------
    // Puck actions
    // ------------------------------------------------------------------------

    requestPass(fromPlayerId, toPlayerId, options) {
      const state = getState();
      const fromPlayer = findPlayer(fromPlayerId);
      const toPlayer = findPlayer(toPlayerId);
      if (!fromPlayer || !toPlayer) return reject('That pass no longer has both players.');

      const validation = validatePass(fromPlayer, toPlayer, state.drill.players, state.drill.events);
      if (!validation.valid) return reject(validation.error!);

      dispatch({ type: 'ADD_PASS', event: buildPassEvent(fromPlayer, toPlayer, options?.fromPoint) });
      dispatch({ type: 'CANCEL_PENDING_ACTION' });
      notify.toast({
        message: `Pass to #${toPlayer.number}`,
        type: 'success',
        dedupeKey: `pass:${fromPlayerId}:${toPlayerId}`,
      });
      return done();
    },

    requestShot(fromPlayerId, target) {
      const state = getState();
      const fromPlayer = findPlayer(fromPlayerId);
      if (!fromPlayer) return reject('That shooter is no longer on the ice.');

      const validation = validateShot(fromPlayer, state.drill.players, state.drill.events);
      if (!validation.valid) return reject(validation.error!);

      const route = state.drill.skatePaths.find(path => path.ownerId === fromPlayerId);
      const authoredSource = route?.points.length
        ? route.points[route.points.length - 1]
        : { x: fromPlayer.x, y: fromPlayer.y };
      const at = releaseTimeFor(fromPlayerId, authoredSource);
      const source = getAuthoredPlayerBlade(state.drill, fromPlayerId, at) ?? authoredSource;
      const flight = Math.max(0.025, distance(source, target) / 5 / 75 / drillDurationSeconds());

      dispatch({
        type: 'ADD_SHOT',
        event: {
          id: generateId(),
          type: 'shot',
          fromPlayerId,
          fromPoint: source,
          toPoint: target,
          targetNet: target.x < RINK_CENTER_X ? 'L' : 'R',
          team: fromPlayer.team,
          at,
          arrivalAt: Math.min(1, at + flight),
        },
      });
      dispatch({ type: 'CANCEL_PENDING_ACTION' });
      notify.toast({ message: 'Shot on net', type: 'success', dedupeKey: `shot:${fromPlayerId}` });
      return done();
    },

    requestDump(fromPlayerId, target, fromPoint) {
      const state = getState();
      const fromPlayer = findPlayer(fromPlayerId);
      if (!fromPlayer) return reject('That player is no longer on the ice.');
      if (!canAddEvents(state.drill.events)) {
        return reject('This drill already ends with a shot or dump. Undo it to continue.');
      }

      const authoredSource = fromPoint ?? { x: fromPlayer.x, y: fromPlayer.y };
      const at = releaseTimeFor(fromPlayerId, authoredSource);
      const source = getAuthoredPlayerBlade(state.drill, fromPlayerId, at) ?? authoredSource;
      const landing = constrainToRink(target, RINK_MARGIN);
      const flight = Math.max(0.035, distance(source, landing) / 5 / 50 / drillDurationSeconds());

      dispatch({
        type: 'ADD_DUMP',
        event: {
          id: generateId(),
          type: 'dump',
          fromPlayerId,
          fromPoint: source,
          toPoint: landing,
          targetNet: 'dump',
          team: fromPlayer.team,
          at,
          arrivalAt: Math.min(1, at + flight),
        },
      });
      dispatch({ type: 'CANCEL_PENDING_ACTION' });
      notify.toast({
        message: 'Puck sent to open ice — assign a receiver from the event details',
        type: 'success',
        dedupeKey: `dump:${fromPlayerId}`,
      });
      return done();
    },

    requestPickup(playerId) {
      const state = getState();
      const player = findPlayer(playerId);
      if (!player) return reject('That player is no longer on the ice.');

      const last = state.drill.events[state.drill.events.length - 1];
      if (!last) return reject('There is no loose puck to recover yet.');

      // Walk the authored timeline for the moment this skater is closest to
      // the loose puck; if they never get near it, say so rather than
      // inventing a teleport.
      const searchStart = Math.min(0.96, (last.arrivalAt ?? 0.72) + 0.01);
      let best: { at: number; puck: Point; stick: Point; gap: number } | null = null;

      for (let sample = 0; sample <= 48; sample++) {
        const at = searchStart + (0.98 - searchStart) * (sample / 48);
        const puck = getAuthoredPuck(state.drill, at);
        if (!puck || puck.state !== 'loose') continue;
        const stick = getAuthoredPlayerBlade(state.drill, playerId, at) ?? { x: player.x, y: player.y };
        const gap = distance(puck, stick);
        if (!best || gap < best.gap) best = { at, puck: { x: puck.x, y: puck.y }, stick, gap };
      }

      if (!best || best.gap > 32) {
        return reject(
          `#${player.number} cannot reach the puck. Draw their route through the loose puck first.`
        );
      }

      const arrivalAt = Math.min(0.995, best.at + 0.02);
      dispatch({
        type: 'ADD_PICKUP',
        event: {
          id: generateId(),
          type: 'pickup',
          fromPlayerId: playerId,
          fromPoint: best.puck,
          toPoint: getAuthoredPlayerBlade(state.drill, playerId, arrivalAt) ?? best.stick,
          team: player.team,
          at: best.at,
          arrivalAt,
        },
      });
      notify.toast({ message: `#${player.number} recovers the puck`, type: 'success' });
      return done();
    },

    retargetPass(eventId, receiverId) {
      const state = getState();
      const existing = state.drill.events.find(event => event.id === eventId);
      const receiver = findPlayer(receiverId);
      if (!existing || existing.type !== 'pass' || !receiver) {
        return reject('That receiver is not available for this pass.');
      }
      const passer = findPlayer(existing.fromPlayerId);
      if (!passer) return reject('That pass no longer has a passer.');

      // The same-team rule applies here exactly as it does to a fresh pass.
      const validation = validatePass(
        passer,
        receiver,
        state.drill.players,
        state.drill.events.filter(event => event.id !== eventId)
      );
      if (!validation.valid) return reject(validation.error!);

      const at = existing.at ?? 0.5;
      const interception = getAuthoredPassInterception(state.drill, existing.fromPoint, receiver.id, at) ?? {
        toPoint: { x: receiver.x, y: receiver.y },
        arrivalAt: Math.min(0.98, at + 0.08),
      };

      dispatch({
        type: 'RETARGET_PASS',
        event: {
          ...existing,
          toPlayerId: receiver.id,
          toPoint: interception.toPoint,
          arrivalAt: interception.arrivalAt,
          catchResult: undefined,
          catchQuality: undefined,
        },
      });
      notify.toast({ message: `Receiver changed to #${receiver.number}`, type: 'success' });
      return done();
    },

    convertDumpToPass(eventId, receiverId) {
      const state = getState();
      const existing = state.drill.events.find(event => event.id === eventId);
      const receiver = findPlayer(receiverId);
      if (!existing || existing.type !== 'dump' || !receiver) {
        return reject('That receiver is not available for this puck action.');
      }
      const passer = findPlayer(existing.fromPlayerId);
      if (!passer) return reject('That action no longer has a source player.');

      const validation = validatePass(
        passer,
        receiver,
        state.drill.players,
        state.drill.events.filter(event => event.id !== eventId)
      );
      if (!validation.valid) return reject(validation.error!);

      const at = existing.at ?? 0.5;
      const interception = getAuthoredPassInterception(state.drill, existing.fromPoint, receiver.id, at) ?? {
        toPoint: { x: receiver.x, y: receiver.y },
        arrivalAt: Math.min(0.98, at + 0.08),
      };

      dispatch({
        type: 'CONVERT_DUMP_TO_PASS',
        event: {
          id: existing.id,
          type: 'pass',
          fromPlayerId: existing.fromPlayerId,
          toPlayerId: receiver.id,
          fromPoint: existing.fromPoint,
          toPoint: interception.toPoint,
          team: existing.team,
          at,
          arrivalAt: interception.arrivalAt,
        },
      });
      notify.toast({ message: `#${receiver.number} will collect it`, type: 'success' });
      return done();
    },

    removeEvent(eventId) {
      const event = getState().drill.events.find(item => item.id === eventId);
      if (!event) return rejected('That puck action is already gone.');
      dispatch({ type: 'REMOVE_EVENT', id: eventId });
      dispatch({ type: 'CLOSE_INSPECTOR' });
      notify.toast({ message: `${event.type} removed`, type: 'success' });
      return done();
    },

    updatePassResult(eventId, result) {
      dispatch({ type: 'UPDATE_PASS_RESULT', id: eventId, result });
    },

    updateShotResult(eventId, result) {
      dispatch({ type: 'UPDATE_SHOT_RESULT', id: eventId, result });
    },

    // ------------------------------------------------------------------------
    // Reshaping a puck line after it is authored
    //
    // Waypoints are simulated, not decorative: the puck walks the arc length
    // of the drawn curve, so every one of these re-times the event's arrival
    // to keep the puck travelling at the speed it was authored with.
    // ------------------------------------------------------------------------

    moveEventWaypoint(eventId, index, to) {
      const event = findEvent(eventId);
      if (!event) return rejected('That puck action is already gone.');

      const waypoints = event.waypoints ?? [];
      if (index < 0 || index >= waypoints.length) return rejected('That point cannot be moved.');

      const next = moveControl(waypoints, index, constrainToRink(to, RINK_MARGIN));
      applyEventGeometry(event, { waypoints: next });
      return done();
    },

    setEventTarget(eventId, to) {
      const event = findEvent(eventId);
      if (!event) return rejected('That puck action is already gone.');
      if (event.type === 'pass') {
        // A pass ends on its receiver's blade; re-aim it by changing receiver.
        return rejected('A pass lands on its receiver — choose a different one instead.');
      }

      applyEventGeometry(event, { toPoint: constrainToRink(to, RINK_MARGIN) });
      return done();
    },

    insertEventWaypoint(eventId, index, at) {
      const event = findEvent(eventId);
      if (!event) return rejected('That puck action is already gone.');

      const waypoints = event.waypoints ?? [];
      if (waypoints.length >= MAX_EVENT_WAYPOINTS) {
        return reject(`A puck line can bend through at most ${MAX_EVENT_WAYPOINTS} points.`);
      }

      const clamped = Math.max(0, Math.min(waypoints.length, index));
      const next = [...waypoints];
      next.splice(clamped, 0, constrainToRink(at, RINK_MARGIN));

      dispatch({ type: 'PUSH_UNDO' });
      applyEventGeometry(event, { waypoints: next });
      return done();
    },

    removeEventWaypoint(eventId, index) {
      const event = findEvent(eventId);
      if (!event) return rejected('That puck action is already gone.');

      const waypoints = event.waypoints ?? [];
      if (index < 0 || index >= waypoints.length) return rejected('There is no such point.');

      dispatch({ type: 'PUSH_UNDO' });
      applyEventGeometry(event, { waypoints: waypoints.filter((_, current) => current !== index) });
      return done();
    },

    setEventShape(eventId, shape) {
      const event = findEvent(eventId);
      if (!event) return rejected('That puck action is already gone.');
      if ((event.shape ?? 'spline') === shape) return done();

      applyEventGeometry(event, { shape });
      notify.toast({
        message:
          shape === 'spline'
            ? 'Puck line curves through its points'
            : 'Puck line runs straight between its points',
        type: 'info',
        duration: 2200,
        dedupeKey: `event-shape:${shape}`,
      });
      return done();
    },

    // ------------------------------------------------------------------------
    // Recovery of legacy off-rink content
    // ------------------------------------------------------------------------

    recoverOffRinkObjects() {
      const { drill } = getState();
      let recovered = 0;

      for (const player of drill.players) {
        if (isInsideRink(player, RINK_MARGIN)) continue;
        const fixed = constrainToRink(player, RINK_MARGIN);
        dispatch({ type: 'MOVE_PLAYER', id: player.id, x: fixed.x, y: fixed.y });
        recovered += 1;
      }

      for (const coach of drill.coaches ?? []) {
        if (isInsideRink(coach, RINK_MARGIN)) continue;
        const fixed = constrainToRink(coach, RINK_MARGIN);
        dispatch({ type: 'MOVE_COACH', id: coach.id, x: fixed.x, y: fixed.y });
        recovered += 1;
      }

      for (const route of drill.skatePaths) {
        if (route.points.every(point => isInsideRink(point, RINK_MARGIN))) continue;
        dispatch({
          type: 'UPDATE_SKATE_POINTS',
          id: route.id,
          points: route.points.map(point => constrainToRink(point, RINK_MARGIN)),
        });
        recovered += 1;
      }

      for (const event of drill.events) {
        // A bent line can have waypoints outside the boards even when both of
        // its endpoints are fine.
        const waypoints = event.waypoints ?? [];
        if (waypoints.length > 0 && waypoints.some(point => !isInsideRink(point, RINK_MARGIN))) {
          dispatch({
            type: 'UPDATE_EVENT_GEOMETRY',
            id: event.id,
            waypoints: waypoints.map(point => constrainToRink(point, RINK_MARGIN)),
          });
          recovered += 1;
        }

        // A shot legitimately ends inside the net, so only dumps and passes
        // are pulled back onto the sheet.
        if (event.type === 'shot') continue;
        if (isInsideRink(event.toPoint, RINK_MARGIN)) continue;
        dispatch({
          type: 'UPDATE_EVENT_GEOMETRY',
          id: event.id,
          toPoint: constrainToRink(event.toPoint, RINK_MARGIN),
        });
        recovered += 1;
      }

      notify.toast({
        message: recovered === 0 ? 'Everything is already on the rink' : `Recovered ${recovered} off-rink item(s)`,
        type: recovered === 0 ? 'info' : 'success',
        dedupeKey: 'recover-off-rink',
      });
      return done(recovered);
    },

    // ------------------------------------------------------------------------
    // Destructive clears
    // ------------------------------------------------------------------------

    async clearPuckActions() {
      const state = getState();
      if (state.drill.events.length === 0) return rejected('There are no puck actions to clear.');
      if (!(await host.confirm(CONFIRMATIONS.clearPuckActions))) return { status: 'cancelled' };

      dispatch({ type: 'CLEAR_PUCK_ACTIONS' });
      notify.toast({ message: 'Puck actions cleared — routes kept', type: 'success' });
      return done();
    },

    async clearMovementRoutes() {
      const state = getState();
      if (state.drill.skatePaths.length === 0) return rejected('There are no routes to clear.');
      if (!(await host.confirm(CONFIRMATIONS.clearMovementRoutes))) return { status: 'cancelled' };

      dispatch({ type: 'CLEAR_MOVEMENT_ROUTES' });
      notify.toast({ message: 'Routes cleared — puck actions kept', type: 'success' });
      return done();
    },

    async resetBoard() {
      if (!(await host.confirm(CONFIRMATIONS.resetBoard))) return { status: 'cancelled' };
      dispatch({ type: 'RESET_BOARD' });
      notify.toast({ message: 'Board reset to the default lineup', type: 'success' });
      return done();
    },

    // ------------------------------------------------------------------------
    // History
    // ------------------------------------------------------------------------

    undo() {
      if (getState().undoStack.length === 0) {
        notify.toast({ message: 'Nothing to undo', type: 'info', duration: 1400, dedupeKey: 'nothing-to-undo' });
        return;
      }
      dispatch({ type: 'POP_UNDO' });
      host.announce('Undone');
    },

    redo() {
      if (getState().redoStack.length === 0) {
        notify.toast({ message: 'Nothing to redo', type: 'info', duration: 1400, dedupeKey: 'nothing-to-redo' });
        return;
      }
      dispatch({ type: 'REDO' });
      host.announce('Redone');
    },

    pushUndo() {
      dispatch({ type: 'PUSH_UNDO' });
    },
  };
}

/** Exposed for the canvas: who currently holds the puck, if anyone. */
export function currentCarrier(host: CommandHost): Player | null {
  const { drill } = host.getState();
  return getCurrentPuckHolder(drill.players, drill.events);
}

/** Exported so tests can assert the failure path without a host. */
export { failed };
