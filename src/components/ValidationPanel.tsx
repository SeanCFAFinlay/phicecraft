import { validateDrillMechanics } from '@/engine/drillValidation';
import { useAppState } from '@/hooks/useAppState';

export function ValidationPanel() {
  const { state, actions } = useAppState();
  const issues = validateDrillMechanics(state.drill);
  const blocking = issues.filter(issue => issue.severity === 'error');
  if (issues.length === 0 || (state.ui.editorStep !== 'review' && blocking.length === 0)) return null;

  return (
    <aside className="absolute bottom-3 right-3 z-30 w-72 rounded-xl border border-white/10 bg-[#071522]/92 p-3 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-[0.13em] text-white/45">Drill check</span>
        <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${blocking.length ? 'bg-red-500/15 text-red-300' : 'bg-yellow-400/10 text-yellow-200'}`}>
          {blocking.length ? `${blocking.length} BLOCKING` : `${issues.length} NOTES`}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        {issues.slice(0, 3).map((issue, index) => (
          <button
            key={`${issue.message}-${index}`}
            onClick={() => issue.playerId ? actions.selectPlayer(issue.playerId) : issue.eventId ? actions.selectEvent(issue.eventId) : undefined}
            className={`w-full rounded-lg border px-2.5 py-2 text-left text-[9px] leading-snug ${issue.severity === 'error' ? 'border-red-400/20 bg-red-500/10 text-red-200' : 'border-yellow-300/15 bg-yellow-300/5 text-yellow-100/75'}`}
          >
            {issue.message}
          </button>
        ))}
      </div>
    </aside>
  );
}
