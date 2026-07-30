// ============================================================================
// MODE SWITCH
//
// Build, Preview and Present are not screens to navigate between - they are
// the same drill, viewed for a different purpose. A radio group says that:
// exactly one is active, and any of the three is one tap from any other.
//
// Three 44px touch targets side by side do not fit a phone-width top strip
// alongside the menu, play name, undo and more buttons it already has to
// share room with - at every required portrait width (320-390) the total is
// over budget even before the play name gets a usable share of it. There,
// `ModeSwitchTrigger` stands in for this component: one 44px button showing
// the current mode, opening `ModeSheet` (in QuickSheets.tsx), which renders
// this same radiogroup full-sized and unconstrained.
// ============================================================================

import type { ReactElement } from 'react';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { BuildIcon, PresentIcon, PreviewIcon } from '@/ui/icons';
import type { AppMode } from '@/core/types';

const MODES: { mode: AppMode; label: string; icon: ReactElement }[] = [
  { mode: 'build', label: 'Build', icon: <BuildIcon size={16} /> },
  { mode: 'preview', label: 'Preview', icon: <PreviewIcon size={16} /> },
  { mode: 'present', label: 'Present', icon: <PresentIcon size={16} /> },
];

export function ModeSwitch({ onSelect }: { onSelect?: () => void } = {}) {
  const { state } = useAppState();
  const commands = useCommands();

  return (
    <div
      role="radiogroup"
      aria-label="Mode"
      className="flex flex-shrink-0 items-center gap-0.5 rounded-xl border border-app-border bg-white/5 p-0.5"
    >
      {MODES.map(({ mode, label, icon }) => {
        const checked = state.ui.mode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            onClick={() => {
              commands.setMode(mode);
              onSelect?.();
            }}
            className={`touch-target flex items-center justify-center gap-1 rounded-lg px-1.5 text-[16px] transition-colors ${
              checked ? 'bg-app-cyan/15 text-app-cyan' : 'text-app-text hover:bg-app-cyan/10'
            }`}
          >
            {icon}
            <span className="hidden text-[12px] font-bold sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The phone-width stand-in for `ModeSwitch` - see the note above. */
export function ModeSwitchTrigger() {
  const { state, dispatch } = useAppState();
  const current = MODES.find(({ mode }) => mode === state.ui.mode) ?? MODES[0];

  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'mode' })}
      aria-haspopup="dialog"
      aria-label={`Mode: ${current.label}. Activate to switch.`}
      className="touch-target flex flex-shrink-0 items-center justify-center rounded-xl border border-app-border bg-white/5 text-app-cyan"
    >
      {current.icon}
    </button>
  );
}
