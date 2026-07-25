// ============================================================================
// LIVE REGION
//
// One polite announcer for things that only exist on the canvas: a pass added,
// an action cancelled, playback starting. Without it, a screen-reader user gets
// no feedback at all from the rink.
// ============================================================================

import { useSyncExternalStore } from 'react';
import { useAppServices } from '@/hooks/useAppState';

export function LiveRegion() {
  const { announcer } = useAppServices();
  useSyncExternalStore(announcer.subscribe, announcer.getSnapshot, announcer.getSnapshot);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcer.getMessage()}
    </div>
  );
}
