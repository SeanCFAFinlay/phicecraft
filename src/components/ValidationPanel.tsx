// ============================================================================
// VALIDATION PANEL
//
// Desktop only: on phone and tablet the same issues are shown in the expanded
// playback sheet, so they never eat rink height.
//
// It reads the revision-keyed validation cache, so it does not re-simulate the
// drill on every render - and when it is hidden, nothing simulates at all.
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useDrillValidation } from '@/editor/useDrillValidation';

export function ValidationPanel() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const issues = useDrillValidation();

  const blocking = issues.filter(issue => issue.severity === 'error');

  // Warnings are only worth the space during review; blocking errors always are.
  if (issues.length === 0) return null;
  if (state.ui.editorStep !== 'review' && blocking.length === 0) return null;

  return (
    <aside
      aria-label="Drill check"
      className="absolute bottom-3 left-3 z-30 w-72 rounded-xl border border-white/10 bg-[#071522]/94 p-3 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Drill check</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
            blocking.length > 0 ? 'bg-red-500/20 text-red-200' : 'bg-yellow-400/15 text-yellow-200'
          }`}
        >
          {blocking.length > 0 ? `${blocking.length} blocking` : `${issues.length} notes`}
        </span>
      </div>

      <ul className="mt-2 space-y-1.5">
        {issues.slice(0, 4).map((issue, index) => (
          <li key={`${issue.message}-${index}`}>
            <button
              type="button"
              onClick={() => {
                if (issue.playerId) commands.openPlayerInspector(issue.playerId);
                else if (issue.eventId) commands.openEventInspector(issue.eventId);
              }}
              className={`w-full rounded-lg border px-2.5 py-2 text-left text-[12px] leading-snug ${
                issue.severity === 'error'
                  ? 'border-red-400/25 bg-red-500/10 text-red-100'
                  : 'border-yellow-300/20 bg-yellow-300/5 text-yellow-100/80'
              }`}
            >
              {issue.message}
            </button>
          </li>
        ))}
      </ul>

      {issues.length > 4 && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'playback' })}
          className="mt-2 w-full rounded-lg border border-app-border bg-white/5 px-2 py-2 text-[12px] font-bold text-white/70"
        >
          See all {issues.length}
        </button>
      )}
    </aside>
  );
}
