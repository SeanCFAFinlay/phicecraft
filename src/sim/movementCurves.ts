import type { MotionProfile } from './types';

/** Build a triangular or trapezoidal accelerate-cruise-brake profile. */
export function buildMotionProfile(
  distance: number,
  maxSpeed: number,
  acceleration: number,
  braking: number
): MotionProfile {
  const safeDistance = Math.max(0, distance);
  if (safeDistance <= 0.001) {
    return {
      distance: 0,
      duration: 0,
      accelerationTime: 0,
      cruiseTime: 0,
      brakingTime: 0,
      peakSpeed: 0,
      accelerationDistance: 0,
      cruiseDistance: 0,
    };
  }

  const accelDistanceAtMax = (maxSpeed * maxSpeed) / (2 * acceleration);
  const brakeDistanceAtMax = (maxSpeed * maxSpeed) / (2 * braking);
  let peakSpeed = maxSpeed;

  if (accelDistanceAtMax + brakeDistanceAtMax > safeDistance) {
    peakSpeed = Math.sqrt((2 * safeDistance * acceleration * braking) / (acceleration + braking));
  }

  const accelerationTime = peakSpeed / acceleration;
  const brakingTime = peakSpeed / braking;
  const accelerationDistance = (peakSpeed * peakSpeed) / (2 * acceleration);
  const brakingDistance = (peakSpeed * peakSpeed) / (2 * braking);
  const cruiseDistance = Math.max(0, safeDistance - accelerationDistance - brakingDistance);
  const cruiseTime = peakSpeed > 0 ? cruiseDistance / peakSpeed : 0;

  return {
    distance: safeDistance,
    duration: accelerationTime + cruiseTime + brakingTime,
    accelerationTime,
    cruiseTime,
    brakingTime,
    peakSpeed,
    accelerationDistance,
    cruiseDistance,
  };
}

export function sampleMotionProfile(
  profile: MotionProfile,
  timeSeconds: number
): { distance: number; speed: number; phase: 'idle' | 'accelerate' | 'cruise' | 'brake' | 'finished' } {
  const t = Math.max(0, timeSeconds);
  if (profile.distance <= 0) return { distance: 0, speed: 0, phase: 'idle' };

  if (t < profile.accelerationTime) {
    const acceleration = profile.peakSpeed / Math.max(profile.accelerationTime, 0.0001);
    return { distance: 0.5 * acceleration * t * t, speed: acceleration * t, phase: 'accelerate' };
  }

  const afterAcceleration = t - profile.accelerationTime;
  if (afterAcceleration < profile.cruiseTime) {
    return {
      distance: profile.accelerationDistance + profile.peakSpeed * afterAcceleration,
      speed: profile.peakSpeed,
      phase: 'cruise',
    };
  }

  const brakeTime = afterAcceleration - profile.cruiseTime;
  if (brakeTime < profile.brakingTime) {
    const braking = profile.peakSpeed / Math.max(profile.brakingTime, 0.0001);
    return {
      distance: Math.min(
        profile.distance,
        profile.accelerationDistance + profile.cruiseDistance +
          profile.peakSpeed * brakeTime - 0.5 * braking * brakeTime * brakeTime
      ),
      speed: Math.max(0, profile.peakSpeed - braking * brakeTime),
      phase: 'brake',
    };
  }

  return { distance: profile.distance, speed: 0, phase: 'finished' };
}
