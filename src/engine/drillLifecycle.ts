import type { DrillLifecycleState } from '@/core/types';

export function nextLifecycle(
  current: DrillLifecycleState,
  action: 'start' | 'succeed' | 'fail' | 'finish-review' | 'reset'
): DrillLifecycleState {
  if (action === 'reset') return 'ready';
  if (action === 'start' && (current === 'ready' || current === 'review')) return 'active';
  if (action === 'succeed' && current === 'active') return 'success';
  if (action === 'fail' && current === 'active') return 'failure';
  if (action === 'finish-review' && (current === 'success' || current === 'failure' || current === 'active')) return 'review';
  return current;
}
