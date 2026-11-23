// ============================================================================
// WELCOME
//
// A coach's very first visit. Before this, PHormation opened straight onto a
// rink of twelve players and a one-line hint - nothing said what the app was
// for or where to start. This says it in three steps and offers the three
// ways in: watch a finished play skate, pick a drill from the library, or
// start drawing (where the step-by-step FirstRunHint takes over).
//
// Shown once, ever: any choice (or Escape) writes `phicecraft.welcomeDone`.
// Not shown to someone opening a shared play - they came to see that play -
// nor under browser automation or unit tests, so the suites start on the rink as they
// always have; `?welcome` forces it for a test or a demo.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useAppState, useCommands } from '@/hooks/useAppState';

const FLAG_KEY = 'phicecraft.welcomeDone';
const EXAMPLE_TEMPLATE = 'tpl-play-131-power-play';

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false;
  const forced = new URLSearchParams(window.location.search).has('welcome');
  if (forced) return true;
  if (window.location.hash.includes('play=')) return false;
  if (navigator.webdriver || import.meta.env.MODE === 'test') return false;
  try {
    return localStorage.getItem(FLAG_KEY) !== '1';
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(FLAG_KEY, '1');
  } catch {
    /* storage disabled: the welcome simply shows again next visit */
  }
}

const STEPS = [
  { title: 'Set the players', detail: 'Drag players into place, or add your own.' },
  { title: 'Draw the play', detail: 'Draw each skater’s route and connect passes and shots.' },
  { title: 'Watch it skate', detail: 'Play it back, explain it to the team and share it by link.' },
];

export function WelcomeScreen() {
  const { dispatch } = useAppState();
  const commands = useCommands();
  const [open, setOpen] = useState(shouldShow);
  const primary = useRef<HTMLButtonElement>(null);

  const close = () => {
    markDone();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    primary.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      markDone();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 safe-x">
      <div aria-hidden="true" className="absolute inset-0 bg-[#02080e]/80 backdrop-blur-sm" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="relative flex max-h-full w-full max-w-[460px] flex-col overflow-y-auto rounded-2xl border border-app-cyan/25 bg-[#071522] p-5 shadow-2xl landscape:max-w-[640px] landscape:max-h-[calc(100dvh-24px)]"
      >
        <div className="flex items-center gap-3">
          <img src="/assets/ph-logo.webp" alt="" width={40} height={40} className="h-10 w-10 rounded-lg ring-1 ring-app-cyan/30" />
          <div className="min-w-0">
            <h2 id="welcome-title" className="text-[19px] font-black leading-tight text-white">
              Welcome to PH<span className="text-app-cyan">ORMATION</span>
            </h2>
            <p className="text-[13px] leading-snug text-white/60">Draw a hockey play, watch it skate, share it with your team.</p>
          </div>
        </div>

        <ol className="mt-4 grid gap-2 landscape:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 landscape:flex-col landscape:gap-1.5">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-app-cyan/15 text-[15px] font-black text-app-cyan"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-black text-app-text">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </p>
                <p className="text-[12px] leading-snug text-white/55">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-col gap-2 landscape:flex-row">
          <button
            ref={primary}
            type="button"
            onClick={async () => {
              close();
              await commands.useTemplate(EXAMPLE_TEMPLATE);
              commands.requestPlaybackStart();
            }}
            className="touch-target flex-1 rounded-xl bg-app-cyan px-4 text-[14px] font-black text-[#041019] shadow hover:bg-cyan-300"
          >
            ▶ Watch an example
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              dispatch({ type: 'OPEN_SHEET', sheet: 'library' });
            }}
            className="touch-target flex-1 rounded-xl border border-app-cyan/40 bg-app-cyan/10 px-4 text-[14px] font-bold text-app-cyan hover:bg-app-cyan/20"
          >
            Browse the drill library
          </button>
          <button
            type="button"
            onClick={close}
            className="touch-target flex-1 rounded-xl border border-white/15 bg-white/5 px-4 text-[14px] font-bold text-app-text hover:bg-white/10"
          >
            Start drawing
          </button>
        </div>
      </div>
    </div>
  );
}
