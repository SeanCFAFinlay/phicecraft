// ============================================================================
// EFFICIENCY SUMMARY
//
// The activity grade for one drill, with the few numbers a coach decides from
// and what to change. Shared by the library details sheet and the coaching
// panel, so both say the same thing about the same drill.
// ============================================================================

import type { DrillEfficiency } from '@/domain/validation/drillEfficiency';

const GRADE_STYLE: Record<DrillEfficiency['grade'], string> = {
  A: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300',
  B: 'border-app-cyan/50 bg-app-cyan/15 text-app-cyan',
  C: 'border-amber-400/50 bg-amber-500/15 text-amber-300',
  D: 'border-rose-400/50 bg-rose-500/15 text-rose-300',
};

export function EfficiencySummary({ efficiency, compact = false }: { efficiency: DrillEfficiency; compact?: boolean }) {
  const facts: [string, string][] = [
    ['Reps per player', `${efficiency.repsPerPlayerPerMinute.toFixed(1)} / min`],
    ['Wait between reps', efficiency.waitSeconds < 1 ? 'None' : `${Math.round(efficiency.waitSeconds)} s`],
    ['Busy', `${Math.round(efficiency.activeShare * 100)}% of the time`],
    ['Puck touches', `${efficiency.touchesPerRep.toFixed(1)} per rep`],
  ];
  if (efficiency.shotsPerGoaliePerMinute !== null) {
    facts.push(['Shots per goalie', `${efficiency.shotsPerGoaliePerMinute.toFixed(1)} / min`]);
  }
  const suggestions = compact ? efficiency.suggestions.slice(0, 2) : efficiency.suggestions;

  return (
    <div className="flex flex-col gap-2" aria-label={`Activity grade ${efficiency.grade}, ${efficiency.score} out of 100`} role="group">
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border text-[17px] font-black ${GRADE_STYLE[efficiency.grade]}`}>
          {efficiency.grade}
        </span>
        <p className="text-[11.5px] leading-snug text-white/60">
          Activity {efficiency.score}/100 with {efficiency.roster} skaters,{' '}
          {efficiency.groupsAtOnce > 1 ? `${efficiency.groupsAtOnce} groups at once` : 'one group at a time'},{' '}
          {efficiency.repSeconds.toFixed(0)} s a rep.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-1.5">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white/5 px-2.5 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-white/40">{label}</dt>
            <dd className="text-[12px] font-bold text-app-text">{value}</dd>
          </div>
        ))}
      </dl>
      {suggestions.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-4 text-[11.5px] leading-snug text-white/70">
          {suggestions.map(suggestion => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
