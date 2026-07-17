import type { Point } from '@/core/types';
import type { MechanicsConfig, PuckMotionState } from './types';
import { resolveBoardCollision } from './collision/puckCollisions';

function applyFriction(velocity: Point, friction: number, dt: number): Point {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= 0.001) return { x: 0, y: 0 };
  const nextSpeed = Math.max(0, speed - friction * dt);
  const scale = nextSpeed / speed;
  return { x: velocity.x * scale, y: velocity.y * scale };
}

/** Fixed-step deterministic loose-puck solver with rounded-board collisions. */
export function solveLoosePuck(
  start: Point,
  initialVelocity: Point,
  elapsedSeconds: number,
  config: MechanicsConfig
): PuckMotionState {
  let position = { ...start };
  let velocity = { ...initialVelocity };
  let remaining = Math.max(0, elapsedSeconds);
  let collisions = 0;

  while (remaining > 0.000001) {
    const dt = Math.min(config.fixedStepSeconds, remaining);
    velocity = applyFriction(velocity, config.puckFriction, dt);
    const candidate = {
      x: position.x + velocity.x * dt,
      y: position.y + velocity.y * dt,
    };
    const resolved = resolveBoardCollision(
      candidate,
      velocity,
      config.puckRadius,
      config.boardRestitution,
      config.boardTangentialFriction
    );
    position = resolved.position;
    velocity = resolved.velocity;
    if (resolved.collided) collisions++;
    remaining -= dt;
    if (Math.hypot(velocity.x, velocity.y) < 0.05) {
      velocity = { x: 0, y: 0 };
      break;
    }
  }

  return { position, velocity, stopped: velocity.x === 0 && velocity.y === 0, collisions };
}
