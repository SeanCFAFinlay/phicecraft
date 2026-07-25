// ============================================================================
// HELP SHEET
//
// Semantic list items, not buttons. The old How-To section rendered every line
// as a <button> with an empty onClick, so a keyboard user tabbed through seven
// controls that did nothing and a screen reader announced them as actionable.
//
// The content is generated from `src/editor/instructions`, which shares the
// implementation's constants - so the documented hold duration is by
// construction the real one.
// ============================================================================

import { Sheet } from '../a11y/Sheet';
import { useAppState } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';
import { helpEntries } from '@/editor/instructions';
import { HOLD_DURATION } from '@/core/constants';

export function HelpSheet() {
  const { state, dispatch } = useAppState();
  const { isTouch } = useResponsive();

  const open = state.ui.openSheet === 'help';
  const entries = helpEntries(isTouch ? 'touch' : 'mouse', true);

  return (
    <Sheet
      open={open}
      title="How to use PhiceCraft"
      description="Everything is available from Select at any time; the workflow steps are only a guide."
      onClose={() => dispatch({ type: 'CLOSE_SHEET' })}
    >
      <ul className="selectable space-y-1 px-2 py-1">
        {entries.map(entry => (
          <li key={entry.text} className="flex items-start gap-3 rounded-xl px-2 py-2.5">
            <span className="w-6 shrink-0 text-center text-[17px]" aria-hidden="true">
              {entry.icon}
            </span>
            <span className="text-[14px] leading-relaxed text-white/80">{entry.text}</span>
          </li>
        ))}
      </ul>

      <div className="selectable px-4 pb-4 pt-2">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-app-cyan/80">Keyboard</h3>
        <dl className="mt-2 space-y-1.5 text-[13px] text-white/70">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-bold text-white/50">Escape</dt>
            <dd>Cancel the current action, or close the topmost panel.</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-bold text-white/50">Space</dt>
            <dd>Play or pause, unless you are typing in a field.</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-bold text-white/50">Ctrl/⌘ Z</dt>
            <dd>Undo. Add Shift to redo.</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-bold text-white/50">Enter</dt>
            <dd>Open the details of whatever is selected.</dd>
          </div>
        </dl>

        <p className="mt-4 text-[12px] leading-relaxed text-white/45">
          Hold-to-move waits {(HOLD_DURATION / 1000).toFixed(1)} seconds. On a touch screen the
          explicit Move button on the selection chip is the primary way to reposition a player.
        </p>
      </div>
    </Sheet>
  );
}
