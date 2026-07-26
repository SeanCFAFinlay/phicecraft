// ============================================================================
// QUICK SHEETS
//
// The small disclosure sheets the phone dock and rink chips open. Each is a
// list of large targets rather than a dense row of 9px labels.
//
// The Action sheet is gone: Route, Pass and Shoot lived in it, and all three
// are now either a dock button or derived, so the sheet had nothing left to
// disclose.
// ============================================================================

import type { ReactNode } from 'react';
import { Sheet } from '../a11y/Sheet';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { getPuckChain } from '@/engine/puck';
import { isReviewComplete } from '@/commands';
import type { Tool } from '@/core/types';

export function SheetItem({
  icon,
  label,
  detail,
  onClick,
  selected,
  tone = 'default',
  disabled,
}: {
  icon: string;
  label: string;
  detail?: string;
  onClick: () => void;
  selected?: boolean;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors disabled:opacity-40 ${
        selected
          ? 'bg-app-cyan/15 text-app-cyan'
          : tone === 'danger'
            ? 'text-red-200 hover:bg-red-500/10'
            : 'text-app-text hover:bg-app-cyan/8'
      }`}
      style={{ minHeight: 'var(--touch-target)' }}
    >
      <span className="w-6 text-center text-[17px]" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{label}</span>
        {detail && <span className="block text-[12px] leading-snug text-white/50">{detail}</span>}
      </span>
      {selected && <span aria-hidden="true">✓</span>}
    </button>
  );
}

export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-1 py-1">
      <h3 className="px-3 pb-1 pt-2 text-[11px] font-black uppercase tracking-wider text-app-cyan/80">
        {title}
      </h3>
      {children}
    </section>
  );
}

// ----------------------------------------------------------------------------

export function AddSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const open = state.ui.openSheet === 'add';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  const choose = (tool: Tool) => {
    commands.setTool(tool);
    close();
  };

  return (
    <Sheet
      open={open}
      title="Add to the rink"
      description="Pick what to place, then tap empty ice."
      onClose={close}
    >
      <SheetItem
        icon="🔴"
        label="Home player"
        detail="Defends the left net"
        selected={state.ui.currentTool === 'home'}
        onClick={() => choose('home')}
      />
      <SheetItem
        icon="🔵"
        label="Away player"
        detail="Defends the right net"
        selected={state.ui.currentTool === 'away'}
        onClick={() => choose('away')}
      />
      <SheetItem
        icon="🥅"
        label="Goalie"
        detail="Joins whichever team defends the end you tap"
        selected={state.ui.currentTool === 'goalie'}
        onClick={() => choose('goalie')}
      />
      <SheetItem
        icon="🧔"
        label="Coach"
        detail="A marker on the ice; never handles the puck"
        selected={state.ui.currentTool === 'coach'}
        onClick={() => choose('coach')}
      />
    </Sheet>
  );
}

// ----------------------------------------------------------------------------

export function PossessionSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const open = state.ui.openSheet === 'possession';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  const chain = getPuckChain(state.drill.players, state.drill.events);

  return (
    <Sheet
      open={open}
      title="Puck possession"
      description="The full chain, in order. Tap an action to inspect it."
      onClose={close}
    >
      {chain.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-white/50">
          No one has the puck yet. Open a player's Details to give it to them.
        </p>
      ) : (
        <ol className="px-1">
          {chain.map((node, index) => {
            const event = node.eventIndex == null ? null : state.drill.events[node.eventIndex];
            const label = node.player
              ? `#${node.player.number} (${node.player.team})`
              : node.action === 'shot'
                ? `Shot — ${event?.type === 'shot' ? event.result ?? 'engine result' : ''}`
                : 'Loose puck';

            return (
              <li key={`${node.eventIndex ?? 'start'}-${index}`}>
                <SheetItem
                  icon={node.player ? '🏒' : node.action === 'shot' ? '🥅' : '💨'}
                  label={label}
                  detail={
                    node.action ? `Step ${index + 1} · ${node.action}` : `Step ${index + 1} · starts with the puck`
                  }
                  onClick={() => {
                    if (event) commands.openEventInspector(event.id);
                    else if (node.player) commands.openPlayerInspector(node.player.id);
                    close();
                  }}
                />
              </li>
            );
          })}
        </ol>
      )}
    </Sheet>
  );
}

// ----------------------------------------------------------------------------

const STEPS = [
  { id: 'setup', label: 'Setup', hint: 'Place players and choose who starts with the puck.' },
  { id: 'movement', label: 'Movement', hint: 'Select a player and tap Skate, or just drag them.' },
  { id: 'puck', label: 'Puck actions', hint: 'Tap Pass, then tap the receiver or the line they are skating.' },
  { id: 'review', label: 'Review', hint: 'Play it through and correct anything the check flags.' },
] as const;

export function WorkflowSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const open = state.ui.openSheet === 'workflow';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  const hasCarrier = state.drill.players.filter(player => player.hasPuck).length === 1;
  const complete: Record<string, boolean> = {
    setup: state.drill.players.length > 0 && hasCarrier,
    movement: state.drill.skatePaths.length > 0,
    puck: state.drill.events.length > 0,
    // Real completion: no blocking errors for THIS revision, and the drill has
    // been played to the end or explicitly marked reviewed.
    review: isReviewComplete(state),
  };

  return (
    <Sheet open={open} title="Workflow" description="A guide, not a gate — every step is available at any time." onClose={close}>
      {STEPS.map(step => (
        <SheetItem
          key={step.id}
          icon={complete[step.id] ? '✓' : '•'}
          label={step.label}
          detail={step.hint}
          selected={state.ui.editorStep === step.id}
          onClick={() => {
            commands.setEditorStep(step.id);
            close();
          }}
        />
      ))}

      {state.ui.editorStep === 'review' && !complete.review && (
        <div className="px-4 pb-2 pt-3">
          <button
            type="button"
            onClick={() => {
              commands.completeReview();
              close();
            }}
            className="touch-target w-full rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-3 text-[13px] font-bold text-emerald-200"
          >
            Mark this version reviewed
          </button>
          <p className="mt-2 text-[12px] leading-snug text-white/50">
            Playing the drill all the way through does this automatically. Any later edit reopens it.
          </p>
        </div>
      )}
    </Sheet>
  );
}
