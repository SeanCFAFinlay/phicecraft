import { useAppState } from '@/hooks/useAppState';

const STEPS = [
  { id: 'setup', number: 1, label: 'Setup' },
  { id: 'movement', number: 2, label: 'Movement' },
  { id: 'puck', number: 3, label: 'Puck Actions' },
  { id: 'review', number: 4, label: 'Review' },
] as const;

export function WorkflowBar() {
  const { state, actions } = useAppState();
  const hasCarrier = state.drill.players.filter(player => player.hasPuck).length === 1;
  const complete = {
    setup: state.drill.players.length > 0 && hasCarrier,
    movement: state.drill.skatePaths.length > 0,
    puck: state.drill.events.length > 0,
    review: false,
  };

  return (
    <nav className="flex h-10 flex-shrink-0 items-center justify-center gap-1 border-b border-app-border bg-[#07131f]/95 px-2">
      {STEPS.map(step => {
        const active = state.ui.editorStep === step.id;
        return (
          <button
            key={step.id}
            onClick={() => {
              actions.setEditorStep(step.id);
              actions.setTool(step.id === 'puck' ? 'pass' : 'select');
              actions.showToast(
                step.id === 'setup' ? 'Place players and confirm the puck carrier'
                  : step.id === 'movement' ? 'Select a player and use the cyan handle to draw movement'
                    : step.id === 'puck' ? 'Drag from the carrier or their route to pass, dump, or shoot'
                      : 'Play, scrub, inspect timing, and correct the drill',
                'info',
                3200
              );
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide transition-colors ${
              active
                ? 'border-app-cyan/70 bg-app-cyan/15 text-app-cyan'
                : 'border-transparent bg-white/[0.03] text-white/40 hover:text-white/70'
            }`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] ${
              complete[step.id] ? 'bg-green-400/20 text-green-300' : 'bg-white/10 text-white/45'
            }`}>
              {complete[step.id] ? '✓' : step.number}
            </span>
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}
