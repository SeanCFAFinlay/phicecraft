import type { Point } from '@/core/types';
import { constrainToRink } from './rinkGeometry';

export function resolveBoardCollision(
  position: Point,
  velocity: Point,
  puckRadius: number,
  restitution: number,
  tangentialFriction: number
): { position: Point; velocity: Point; collided: boolean } {
  const constrained = constrainToRink(position, puckRadius);
  if (!constrained.collided) return { position, velocity, collided: false };

  const normalSpeed = velocity.x * constrained.normal.x + velocity.y * constrained.normal.y;
  if (normalSpeed <= 0) {
    return { position: constrained.position, velocity, collided: true };
  }

  const tangent = {
    x: velocity.x - normalSpeed * constrained.normal.x,
    y: velocity.y - normalSpeed * constrained.normal.y,
  };
  return {
    position: constrained.position,
    velocity: {
      x: tangent.x * (1 - tangentialFriction) - constrained.normal.x * normalSpeed * restitution,
      y: tangent.y * (1 - tangentialFriction) - constrained.normal.y * normalSpeed * restitution,
    },
    collided: true,
  };
}
