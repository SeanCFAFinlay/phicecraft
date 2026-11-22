// ============================================================================
// PRACTICE BUILDER
//
// "60 min U11 passing and breakouts, 1 goalie, 14 skaters" -> a full plan.
// Type it, or set the same things with the controls below; the typed request
// fills the controls in so the coach can see exactly what was understood.
// ============================================================================

import { useState } from 'react';
import type { AgeBand, DrillCategory } from '@/domain/v3/types';
import {
  AGE_LABELS,
  FOCUS_OPTIONS,
  generatePractice,
  parsePracticeRequest,
  type PracticeRequest,
} from '@/domain/practice/practiceGenerator';
import type { PracticeSession } from '@/domain/practice/types';

const AGES = Object.keys(AGE_LABELS) as AgeBand[];
const MINUTES = [30, 45, 50, 60, 75, 90];

const chip = (on: boolean) =>
  `touch-target rounded-xl border px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
    on ? 'border-app-cyan bg-app-cyan text-[#041019]' : 'border-app-border bg-white/5 text-white/75 hover:bg-white/10'
  }`;

export function PracticeBuilder({ onCreate, onCancel }: { onCreate: (session: PracticeSession) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const [request, setRequest] = useState<PracticeRequest>({ minutes: 60, ageBand: 'u11', focus: [], goalies: 1, skaters: 15 });

  const toggleFocus = (category: DrillCategory) =>
    setRequest(current => ({
      ...current,
      focus: current.focus.includes(category)
        ? current.focus.filter(item => item !== category)
        : [...current.focus, category].slice(-3),
    }));

  return (
    <section
      aria-label="Build a practice"
      className="space-y-3 rounded-2xl border border-app-cyan/40 bg-gradient-to-br from-cyan-950/50 to-[#0b1723] p-4"
    >
      <div>
        <h3 className="text-[15px] font-black text-white">Build a practice</h3>
        <p className="text-[12px] text-white/60">
          Describe it, or pick below. Drills come from the library and fit your age group, ice time and goalies.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={event => {
          event.preventDefault();
          setRequest(current => parsePracticeRequest(text, current));
        }}
      >
        <input
          type="text"
          aria-label="Describe the practice"
          value={text}
          maxLength={300}
          placeholder="e.g. 60 min U11 passing and breakouts, 1 goalie, 14 skaters"
          onChange={event => {
            setText(event.target.value);
            setRequest(current => parsePracticeRequest(event.target.value, current));
          }}
          className="min-w-0 flex-1 rounded-xl border border-app-border bg-white/5 px-3 py-2 text-[16px] text-white placeholder-white/35 focus:border-app-cyan focus:outline-none sm:text-[13.5px]"
        />
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">Ice time</div>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ice time">
            {MINUTES.map(minutes => (
              <button key={minutes} type="button" role="radio" aria-checked={request.minutes === minutes} onClick={() => setRequest({ ...request, minutes })} className={chip(request.minutes === minutes)}>
                {minutes}m
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">Age group</div>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Age group">
            {AGES.map(ageBand => (
              <button key={ageBand} type="button" role="radio" aria-checked={request.ageBand === ageBand} onClick={() => setRequest({ ...request, ageBand })} className={chip(request.ageBand === ageBand)}>
                {AGE_LABELS[ageBand]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">Focus (up to 3)</div>
        <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Practice focus">
          {FOCUS_OPTIONS.map(option => (
            <button key={option.category} type="button" aria-pressed={request.focus.includes(option.category)} onClick={() => toggleFocus(option.category)} className={chip(request.focus.includes(option.category))}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">Goalies</div>
          <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label="Goalies">
            {[0, 1, 2].map(goalies => (
              <button key={goalies} type="button" role="radio" aria-checked={request.goalies === goalies} onClick={() => setRequest({ ...request, goalies })} className={chip(request.goalies === goalies)}>
                {goalies}
              </button>
            ))}
          </div>
        </div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          Skaters
          <input
            type="number"
            min={2}
            max={40}
            value={request.skaters}
            onChange={event => setRequest({ ...request, skaters: Math.max(2, Math.min(40, Number(event.target.value) || 2)) })}
            className="mt-1 block w-20 rounded-xl border border-app-border bg-white/5 px-3 py-1.5 text-[16px] font-bold normal-case tracking-normal text-white focus:border-app-cyan focus:outline-none sm:text-[13px]"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancel} className="touch-target rounded-xl border border-white/20 bg-white/5 px-3.5 py-2 text-[12.5px] font-bold text-white/80 hover:bg-white/10">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onCreate(generatePractice(request))}
            className="touch-target rounded-xl bg-app-cyan px-4 py-2 text-[13px] font-black text-[#041019] shadow hover:bg-cyan-300"
          >
            Generate practice
          </button>
        </div>
      </div>
    </section>
  );
}
