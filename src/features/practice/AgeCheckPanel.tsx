// ============================================================================
// AGE-APPROPRIATE CHECK PANEL
//
// The practice plan graded for the age group it is for: what is right, what
// to change, and roughly how much of the ice time each skater is moving.
// ============================================================================

import { useMemo, useState } from 'react';
import type { AgeBand } from '@/domain/v3/types';
import { AGE_LABELS } from '@/domain/practice/practiceGenerator';
import { assessPractice, guessAgeBand, type FindingLevel } from '@/domain/practice/ageCheck';
import type { PracticeSession } from '@/domain/practice/types';

const AGES = Object.keys(AGE_LABELS) as AgeBand[];
const ICON: Record<FindingLevel, string> = { good: '✓', warn: '!', issue: '✕' };
const TONE: Record<FindingLevel, string> = {
  good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  issue: 'border-red-500/40 bg-red-500/10 text-red-300',
};

export function AgeCheckPanel({ session, onAgeChange }: { session: PracticeSession; onAgeChange: (ageBand: AgeBand) => void }) {
  const ageBand = guessAgeBand(session);
  const [skaters, setSkaters] = useState(15);
  const report = useMemo(() => assessPractice(session, ageBand, skaters), [session, ageBand, skaters]);
  const gradeTone = report.grade === 'Great' ? 'text-emerald-400' : report.grade === 'Good' ? 'text-cyan-300' : 'text-amber-300';

  return (
    <section aria-label="Age-appropriate check" className="mt-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className={`text-[26px] font-black leading-none ${gradeTone}`}>{report.score}</div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-white/50">score</div>
          </div>
          <div>
            <div className="text-[13px] font-black text-white">
              Age-appropriate check · <span className={gradeTone}>{report.grade}</span>
            </div>
            <div className="text-[11.5px] text-white/60">
              Based on USA Hockey ADM and Hockey Canada development guidelines.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-bold text-white/60">
            Age{' '}
            <select
              aria-label="Age group for this plan"
              value={ageBand}
              onChange={event => onAgeChange(event.target.value as AgeBand)}
              className="rounded-lg border border-app-border bg-slate-900 px-2 py-1 text-[12px] font-bold text-white"
            >
              {AGES.map(age => <option key={age} value={age}>{AGE_LABELS[age]}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-bold text-white/60">
            Skaters{' '}
            <input
              aria-label="Skaters at practice"
              type="number"
              min={2}
              max={40}
              value={skaters}
              onChange={event => setSkaters(Math.max(2, Math.min(40, Number(event.target.value) || 2)))}
              className="w-14 rounded-lg border border-app-border bg-slate-900 px-2 py-1 text-[12px] font-bold text-white"
            />
          </label>
        </div>
      </div>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {report.findings.map((finding, index) => (
          <li key={index} className={`flex gap-2 rounded-xl border p-2 text-[12px] ${TONE[finding.level]}`}>
            <span aria-hidden="true" className="font-black">{ICON[finding.level]}</span>
            <span>
              <span className="font-bold">{finding.title}</span>
              <span className="block text-white/70">{finding.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
