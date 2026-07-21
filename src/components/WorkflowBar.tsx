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
              // Steps are now optional guides, not gates - everything is doable
              // from Select at any time. Tapping one just re-centres the coaching.
              actions.setEditorStep(step.id);
              actions.setTool('select');
              actions.showToast(
                step.id === 'setup' ? 'Place players (Home/Away/Goalie/Coach); the carrier holds the puck'
                  : step.id === 'movement' ? 'Drag any player to draw their route — both teams move'
                    : step.id === 'puck' ? 'Drag the puck carrier to a teammate (pass), a net (shot), or open ice (dump)'
                      : 'Play, scrub, inspect timing, and correct the drill',
                'info',
                3600
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
