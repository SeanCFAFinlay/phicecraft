// ============================================================================
// "A NEW VERSION IS READY"
//
// The update is never applied on its own. A coach mid-drill should not have
// the page reload underneath them because a deploy happened, so the new build
// waits and this offers it.
//
// TWO THINGS THIS GOT WRONG FIRST TIME, both worth keeping written down:
//
//   1. It also announced "saved on this device and will open without a
//      network" in the same banner. That is not information a coach acts on -
//      it is the product congratulating itself - and it appeared on every
//      first visit. It is now announced to assistive tech only.
//
//   2. It sat at the bottom of the screen, on top of the tool dock, so a
//      coach's first visit had Move, Pass, Skate, Add and Play covered by a
//      message about caching. It now lives in the chip lane at the TOP of the
//      rink, which is the strip already reserved for transient messages and is
//      clear of every primary control.
// ============================================================================

import { useEffect, useState } from 'react';
import { useAppServices } from '@/hooks/useAppState';
import { applyUpdate, subscribeToUpdates, type UpdateState } from './updateManager';

export function UpdateBanner() {
  const { announcer } = useAppServices();
  const [state, setState] = useState<UpdateState>({ updateReady: false, offlineReady: false });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeToUpdates(setState), []);

  // Worth saying once, to anyone listening rather than looking. Not worth a
  // panel over the controls.
  const offlineReady = state.offlineReady;
  useEffect(() => {
    if (offlineReady) announcer.announce('PhiceCraft is saved on this device and will open without a network.');
  }, [offlineReady, announcer]);

  if (!state.updateReady || dismissed) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-11 z-[60] flex justify-center px-2">
      <div
        role="status"
        aria-live="polite"
        className="rink-chip pointer-events-auto flex max-w-[min(560px,94vw)] items-center gap-2 rounded-2xl px-3 py-2"
      >
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-app-text">
          A new version is ready.
        </span>
        <button
          type="button"
          onClick={applyUpdate}
          className="touch-target shrink-0 rounded-xl border border-app-cyan bg-app-cyan/15 px-3 text-[12px] font-bold text-app-cyan"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="touch-target shrink-0 rounded-xl border border-app-border bg-white/5 px-3 text-[12px] font-bold text-white/65"
        >
          Later
        </button>
      </div>
    </div>
  );
}
