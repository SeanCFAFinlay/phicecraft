import type {
  AnimatedPuck,
  Drill,
  DrillEvent,
  DrillLifecycleState,
  ID,
  PlaybackPlayerFrame,
  Player,
  Point,
  SkatePath,
} from '@/core/types';

export interface MechanicsConfig {
  durationSeconds: number;
  fixedStepSeconds: number;
  maxForwardSpeed: number;
  maxBackwardSpeed: number;
  acceleration: number;
  braking: number;
  puckFriction: number;
  boardRestitution: number;
  boardTangentialFriction: number;
  passSpeed: number;
  shotSpeed: number;
  catchRadius: number;
  pickupRadius: number;
  catchSpeed: number;
  puckRadius: number;
  assistance: 'off' | 'standard' | 'high';
  recovery: 'authored' | 'nearest-teammate';
  /** Drill seconds per standard-pace second: above 1 for a slower age group. Absent = 1. */
  timeScale?: number;
}

export interface MotionProfile {
  distance: number;
  duration: number;
  accelerationTime: number;
  cruiseTime: number;
  brakingTime: number;
  peakSpeed: number;
  accelerationDistance: number;
  cruiseDistance: number;
}

export interface CompiledRoute {
  ownerId: ID;
  source: SkatePath | null;
  points: Point[];
  segmentLengths: number[];
  cumulativeLengths: number[];
  totalLength: number;
  durationSeconds: number;
  motion: MotionProfile;
  warnings: string[];
  /**
   * Real distance along the route against straight-line-equivalent distance:
   * a stretch through a tight turn counts for more, so it is skated slower.
   * Absent for a route with no turn to slow for, where the two are equal.
   */
  turnWarp?: TurnWarp;
  /**
   * Present when the route skates in timed legs. `points` and the lengths
   * above are then the legs joined end to end, and each leg's distances are
   * measured from `distanceOffset` along them.
   */
  legs?: CompiledLeg[];
}

/** Matching columns, sampled about every foot, both starting at 0. */
export interface TurnWarp {
  actual: number[];
  nominal: number[];
}

export interface CompiledLeg {
  startAtSeconds: number;
  /** Where along the whole route this leg begins. */
  distanceOffset: number;
  /** `distanceOffset` in straight-line-equivalent distance (see CompiledRoute.turnWarp). */
  nominalOffset?: number;
  length: number;
  motion: MotionProfile;
  mode: 'skate' | 'glide' | 'backward';
}

export interface CompiledEvent {
  source: DrillEvent;
  index: number;
  departureSeconds: number;
  arrivalSeconds: number;
}

export interface CompiledDrill {
  source: Drill;
  config: MechanicsConfig;
  durationSeconds: number;
  players: Map<ID, Player>;
  routes: Map<ID, CompiledRoute>;
  events: CompiledEvent[];
}

export interface SimulationFrame {
  timeSeconds: number;
  progress: number;
  durationSeconds: number;
  lifecycle: DrillLifecycleState;
  players: Record<ID, PlaybackPlayerFrame>;
  puck: AnimatedPuck | null;
  firedEventIndices: number[];
  eventExecutions: EventExecution[];
}

export interface EventExecution {
  eventId: ID;
  index: number;
  status: 'pending' | 'active' | 'completed' | 'blocked';
  outcome?: AnimatedPuck['result'] | 'released' | 'recovered';
  reason?: string;
}

export interface PuckMotionState {
  position: Point;
  velocity: Point;
  stopped: boolean;
  collisions: number;
}

export type ReceptionQuality = 'good' | 'assisted' | 'unreachable';

export interface ReceptionEvaluation {
  caught: boolean;
  quality: ReceptionQuality;
  gap: number;
  relativeSpeed: number;
}
