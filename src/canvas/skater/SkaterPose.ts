import type { PlaybackPlayerFrame, SkaterAction } from '@/core/types';

export interface SkaterPose {
  heading: number;
  lean: number;
  stridePhase: number;
  leftLegAngle: number;
  rightLegAngle: number;
  shoulderAngle: number;
  stickAngle: number;
  stickSide: 'forehand' | 'backhand';
  action: SkaterAction;
}

export function deriveSkaterPose(frame: PlaybackPlayerFrame): SkaterPose {
  const stride = Math.sin(frame.stridePhase * Math.PI * 2);
  const activeStride = frame.action === 'stride' || frame.action === 'turn';
  const actionLoad = frame.action === 'shot' ? -0.34 : frame.action === 'pass' ? 0.22 : 0;
  return {
    heading: frame.heading,
    lean: Math.max(-0.28, Math.min(0.28, frame.angularVelocity * 0.08)),
    stridePhase: frame.stridePhase,
    leftLegAngle: activeStride ? stride * 0.34 : frame.action === 'stop' ? 0.58 : 0.05,
    rightLegAngle: activeStride ? -stride * 0.34 : frame.action === 'stop' ? 0.58 : -0.05,
    shoulderAngle: actionLoad + Math.max(-0.22, Math.min(0.22, frame.angularVelocity * 0.05)),
    stickAngle: frame.action === 'receive' ? -0.24 : frame.action === 'shot' ? -0.46 : frame.action === 'pass' ? 0.32 : 0.08,
    stickSide: frame.action === 'receive' ? 'backhand' : 'forehand',
    action: frame.action,
  };
}
