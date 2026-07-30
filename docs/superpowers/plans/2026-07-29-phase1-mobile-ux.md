# Phase 1 — Build / Preview / Present + Contextual Tray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce three visible product states (Build, Preview, Present), consolidate the floating rink chips into one bottom tray surface, and default phones to a zone view — without discarding the existing three-verb dock design that the test suite locks in.

**Architecture:** A new `mode: 'build' | 'preview' | 'present'` field in `UIState`, set through a new `setMode` command, gates all document-mutating actions at the reducer. Preview reuses the existing transport/validation machinery with editing disabled; Present is a full-bleed overlay whose Play button routes through the existing `requestPlaybackStart()` (an e2e-locked invariant). The current zone becomes shared state on `CameraStore` (today it is `useState` local to `ViewControls` and already disagrees with the camera). The possession/workflow `ContextChips` disappear from the rink; selection actions move from the floating `SelectionChip` into a second row of the dock tray, leaving `ActionChip` as the single floating instruction chip.

**Tech Stack:** Existing React 18 + reducer + command layer; no new dependencies. Vitest (jsdom via `.tsx`), Playwright.

## Global Constraints

- Coverage gates: `src/commands/**` 90% lines / 85% branches; `src/core/state.ts` inside the 80% floor. `src/components/**` is NOT coverage-gated, but shell changes break named tests listed per task — updating them is part of the task, not optional.
- `npm run lint` `--max-warnings 0`; `npm run typecheck` clean after every task.
- Dock invariant while nothing is selected in Build: `App.test.tsx` "offers exactly the three verbs, plus Add and Play" expects dock button text `['Move','Pass','Skate','Add','Play']` — preserved by design.
- Every Play surface must call `commands.requestPlaybackStart()` — locked by `e2e/flows.spec.ts:367`.
- Touch targets ≥ 44px (`--touch-target`); primary text ≥ 14px; no horizontal overflow; usable rink height floors in `e2e/viewports.spec.ts` (≥230px at 667×375 landscape, ≥250px at 844×390, >150px elsewhere).
- Component tests must call `__resetResponsiveCache()` after `setViewport(...)` or they read a stale snapshot.
- Visual baselines: any shell change requires `npm run test:visual:update` and committing the regenerated PNGs under `e2e/__screenshots__/`.
- Sheets open via raw `dispatch({ type: 'OPEN_SHEET', ... })`, not commands — follow that existing pattern for sheets; the new mode is a command because it has cross-cutting side effects.

---

### Task 1: `mode` in core state with reducer-level edit gating

**Files:**
- Modify: `src/core/types.ts` (UIState, AppAction union), `src/core/constants.ts:317` (`DEFAULT_UI`), `src/core/state.ts` (reducer)
- Test: `src/core/state.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export type AppMode = 'build' | 'preview' | 'present'` in `src/core/types.ts`; `UIState.mode: AppMode`; action `{ type: 'SET_MODE'; mode: AppMode }`. Tasks 2–8 read `state.ui.mode`.

- [ ] **Step 1: Write the failing reducer tests**

Append to `src/core/state.test.ts`, using its existing pattern of `appReducer(createInitialState(), action)`:

```ts
describe('SET_MODE', () => {
  it('defaults to build', () => {
    expect(createInitialState().ui.mode).toBe('build');
  });

  it('entering preview clears the pending action and closes chrome', () => {
    let state = createInitialState();
    state = appReducer(state, { type: 'SET_PENDING_ACTION', action: { kind: 'pass', playerId: state.drill.players[0].id } });
    state = appReducer(state, { type: 'OPEN_SHEET', sheet: 'more' });
    state = appReducer(state, { type: 'SET_MODE', mode: 'preview' });
    expect(state.ui.mode).toBe('preview');
    expect(state.pendingAction.kind).toBe('none');
    expect(state.ui.openSheet).toBe('none');
    expect(state.ui.showMenu).toBe(false);
    expect(state.ui.inspector.kind).toBe('none');
  });

  it('outside build, document edits are ignored', () => {
    let state = createInitialState();
    const before = state.drill;
    state = appReducer(state, { type: 'SET_MODE', mode: 'preview' });
    const moved = appReducer(state, {
      type: 'MOVE_PLAYER', playerId: before.players[0].id, x: 1, y: 1,
    } as never);
    expect(moved.drill).toBe(state.drill);
    expect(moved.undoStack).toBe(state.undoStack);
  });

  it('outside build, arming an action is ignored', () => {
    let state = createInitialState();
    state = appReducer(state, { type: 'SET_MODE', mode: 'present' });
    const armed = appReducer(state, { type: 'SET_PENDING_ACTION', action: { kind: 'pass', playerId: state.drill.players[0].id } });
    expect(armed.pendingAction.kind).toBe('none');
  });

  it('LOAD_DRILL still works outside build (library can hand over a drill)', () => {
    let state = createInitialState();
    state = appReducer(state, { type: 'SET_MODE', mode: 'preview' });
    const drill = { ...state.drill, id: 'other', name: 'Other' };
    const loaded = appReducer(state, { type: 'LOAD_DRILL', drill });
    expect(loaded.drill.id).toBe('other');
  });

  it('playback actions still work outside build', () => {
    let state = createInitialState();
    state = appReducer(state, { type: 'SET_MODE', mode: 'present' });
    state = appReducer(state, { type: 'START_PLAYBACK' });
    expect(state.playback.isPlaying).toBe(true);
  });
});
```

Adjust `MOVE_PLAYER`'s exact action shape to the real member of `AppAction` (`src/core/types.ts:571`) — pick any document-mutating action that exists; the point is the gate, not the specific edit. If `createInitialState()` starts with zero players, first apply the state file's existing player-adding action the way neighbouring tests do.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/core/state.test.ts`
Expected: FAIL — `mode` missing, `SET_MODE` unknown.

- [ ] **Step 3: Implement**

`src/core/types.ts`: add near `UIState`:

```ts
/** The three product states. Only 'build' may mutate the document. */
export type AppMode = 'build' | 'preview' | 'present';
```

Add `mode: AppMode;` to `UIState` (`src/core/types.ts:446`) and `| { type: 'SET_MODE'; mode: AppMode }` to `AppAction`.

`src/core/constants.ts`: add `mode: 'build',` to `DEFAULT_UI`.

`src/core/state.ts`, inside the inner `reduce()`:

```ts
case 'SET_MODE': {
  if (action.mode === state.ui.mode) return state;
  return {
    ...state,
    pendingAction: { kind: 'none' },
    ui: {
      ...state.ui, mode: action.mode,
      openSheet: 'none', showMenu: false,
      inspector: { kind: 'none' }, modeBanner: null,
    },
  };
}
```

And the gate at the top of the outer `appReducer`, before undo recording (same module, so the private `UNDOABLE_ACTIONS` set is in scope):

```ts
const EDIT_ONLY_OUTSIDE_UNDOABLE = new Set(['SET_PENDING_ACTION', 'SET_TOOL']);
// Preview and Present are read-only: a document mutation or an armed editing
// action arriving there is a bug in a caller, and the safe answer is a no-op.
if (
  state.ui.mode !== 'build' &&
  action.type !== 'LOAD_DRILL' &&
  (UNDOABLE_ACTIONS.has(action.type) || EDIT_ONLY_OUTSIDE_UNDOABLE.has(action.type))
) {
  return state;
}
```

If `LOAD_DRILL` is not in `UNDOABLE_ACTIONS`, the exemption is still harmless. Verify no other lifecycle-critical action sits in `UNDOABLE_ACTIONS` (read the set; if e.g. rename or settings actions are there, that is correct gating — they are edits).

- [ ] **Step 4: Run the core suites**

Run: `npx vitest run src/core/`
Expected: PASS, including all pre-existing reducer tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/
git commit -m "feat: Build/Preview/Present mode in app state, read-only outside Build"
```

---

### Task 2: `setMode` command with playback side effects

**Files:**
- Modify: `src/commands/commandTypes.ts:143-259` (`DrillCommandService`), `src/commands/playbackCommands.ts`
- Test: the commands test file covering playback commands (locate: `ls src/commands/*.test.*`; extend it with the same `commandHost` harness from `src/test/commandHost.ts`)

**Interfaces:**
- Consumes: `SET_MODE` (Task 1), existing `stopPlayback`, `resetPlayback`.
- Produces: `setMode(mode: AppMode): void` on `DrillCommandService`. All UI in Tasks 4–6 calls `commands.setMode(...)` — never raw `dispatch({ type: 'SET_MODE' })`.

Behavior: entering `'build'` while playing stops playback (you edit paused, not mid-flight); entering `'present'` resets playback to the start so presentation begins clean; entering any mode announces it via the host announcer (the pattern every command uses for screen readers).

- [ ] **Step 1: Write the failing tests**

```ts
describe('setMode', () => {
  it('entering build while playing stops playback', () => {
    const { service, getState } = createHarness(); // the file's existing helper name — reuse it
    service.setMode('present');
    service.requestPlaybackStart();
    expect(getState().playback.isPlaying).toBe(true);
    service.setMode('build');
    expect(getState().ui.mode).toBe('build');
    expect(getState().playback.isPlaying).toBe(false);
  });

  it('entering present resets playback progress', () => {
    const { service, getState } = createHarness();
    service.setMode('present');
    expect(getState().ui.mode).toBe('present');
    expect(getState().playback.isPlaying).toBe(false);
    expect(getState().playback.lifecycle).toBe('ready');
  });

  it('announces the mode change', () => {
    const { service, announcements } = createHarness();
    service.setMode('preview');
    expect(announcements.at(-1)).toMatch(/preview/i);
  });
});
```

Mirror the harness construction of neighbouring tests exactly (`src/test/commandHost.ts` provides the host; `requestPlaybackStart` needs a drill with at least one route or event — copy the seeded drill a neighbouring playback test uses).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/commands/`
Expected: FAIL — `setMode` not a function.

- [ ] **Step 3: Implement in `src/commands/playbackCommands.ts`**

```ts
setMode(mode) {
  const { state, dispatch } = host;
  if (state().ui.mode === mode) return;
  if (mode === 'build' && state().playback.isPlaying) {
    this.stopPlayback();
  }
  if (mode === 'present') {
    this.resetPlayback();
  }
  dispatch({ type: 'SET_MODE', mode });
  host.announce(
    mode === 'build' ? 'Build mode. Editing enabled.'
    : mode === 'preview' ? 'Preview mode. Editing is off; play and scrub the drill.'
    : 'Present mode. Full-screen playback.'
  );
},
```

Match the file's actual host access idiom (`host.state()` vs a captured getter, `this.` vs closure functions) — transcribe from `stopPlayback`'s own implementation in the same file. Add `setMode(mode: AppMode): void;` to `PlaybackCommands` in `commandTypes.ts` and import `AppMode` from `@/core/types`.

- [ ] **Step 4: Run commands suite + coverage**

Run: `npx vitest run src/commands/ && npm run test:coverage`
Expected: PASS; `src/commands/**` still ≥ 90/85.

- [ ] **Step 5: Commit**

```bash
git add src/commands/
git commit -m "feat: setMode command with playback side effects"
```

---

### Task 3: Icons for the mode switcher and glyph cleanup

**Files:**
- Modify: `src/ui/icons.tsx`, `src/components/shell/Transport.tsx`, `src/components/ViewControls.tsx`, `src/components/sheets/PlaybackSheet.tsx`
- Test: none new (icons are presentational; the components' existing accessible names must not change)

**Interfaces:**
- Produces: `BuildIcon`, `PreviewIcon` (eye), `PresentIcon` (screen/play), `PauseIcon`, `StepBackIcon`, `StepForwardIcon`, `ExpandIcon`, `RotateLeftIcon`, `RotateRightIcon`, `OrientationIcon` — same 24×24 grid, `stroke="currentColor"`, `size = 20` default, `aria-hidden="true"` props pattern as every existing icon in the file. Tasks 4–6 consume the first four.

- [ ] **Step 1: Add the icons**

Follow the file's existing component shape exactly (copy `PlayIcon`'s skeleton). Example for two; draw the rest in the same idiom:

```tsx
export function PreviewIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function PauseIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round"
      aria-hidden="true" {...props}>
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
    </svg>
  );
}
```

(`IconProps` = the file's existing prop type; if it is inlined per component, inline the same way.)

- [ ] **Step 2: Replace literal glyphs**

In `Transport.tsx` (`❚❚` `▶` `⏮`), `PlaybackSheet.tsx` (`⏮` `▶` `❚❚` `⏭` `↺`), `ViewControls.tsx` (`↺` `↻` `↔` `↕` `⛶` — `⛶` already has `FitIcon`): swap each literal character for the icon component, **keeping every `aria-label`/accessible name byte-identical** so no test's `getByRole('button', { name: ... })` query changes.

- [ ] **Step 3: Verify nothing renamed**

Run: `npx vitest run src/App.test.tsx && npx vitest run src/components/`
Expected: PASS with zero test edits — if a test fails, an accessible name drifted; fix the component, not the test.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
git add src/ui/icons.tsx src/components/
git commit -m "feat: first-party icons for modes and transport, dropping literal glyphs"
```

---

### Task 4: Mode switcher in the shell

**Files:**
- Create: `src/components/shell/ModeSwitch.tsx`
- Modify: `src/AppShell.tsx`, `src/components/shell/TopStrip.tsx`
- Test: `src/App.test.tsx` (extend)

**Interfaces:**
- Consumes: `commands.setMode` (Task 2), `state.ui.mode`, icons (Task 3), `useResponsive`.
- Produces: `export function ModeSwitch()` — no props; reads state itself like every shell component. Rendered by `TopStrip` (all breakpoints).

Spec: a `role="radiogroup"` labelled "Mode" with three `role="radio"` buttons — Build, Preview, Present. Phones show icon + text stacked small or icon-only with `aria-label`; ≥tablet shows icon + label. Present is also reachable from Preview; any mode reachable from any mode. 44px touch targets. The switcher must fit the phone top strip without breaking `e2e/mobile.spec.ts` "the top strip fits at phone width with no essential control hidden" — on phones, place it where the Undo/Redo pair sits on desktop (Undo stays; Redo is already phone-hidden per the existing pattern).

- [ ] **Step 1: Write the failing tests**

Append to `src/App.test.tsx` (reusing its `renderApp`/`buildServices` harness verbatim):

```tsx
describe('mode switcher', () => {
  it('offers Build, Preview and Present, with Build active by default', () => {
    renderApp();
    const group = screen.getByRole('radiogroup', { name: 'Mode' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map(r => r.getAttribute('aria-label') ?? r.textContent)).toEqual(
      expect.arrayContaining(['Build', 'Preview', 'Present'])
    );
    expect(within(group).getByRole('radio', { name: 'Build' })).toHaveAttribute('aria-checked', 'true');
  });

  it('preview hides the editing dock and shows the preview bar', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Preview' }));
    expect(screen.queryByRole('navigation', { name: 'Editing tools' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Preview' })).toBeInTheDocument();
  });

  it('returning to build restores the dock', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Preview' }));
    await user.click(screen.getByRole('radio', { name: 'Build' }));
    expect(screen.getByRole('navigation', { name: 'Editing tools' })).toBeInTheDocument();
  });
});
```

(The second test also drives Task 5's `PreviewBar` region — it will stay red until Task 5; that is acceptable ordering, or split the assertion in two and move the preview-bar line to Task 5's tests. Prefer the split: keep this task green on its own by asserting only dock absence.)

- [ ] **Step 2: Run to verify failure, then implement `ModeSwitch.tsx`**

```tsx
import { useAppState } from '@/hooks/useAppState';
import { BuildIcon, PresentIcon, PreviewIcon } from '@/ui/icons';
import type { AppMode } from '@/core/types';

const MODES: { mode: AppMode; label: string; icon: JSX.Element }[] = [
  { mode: 'build', label: 'Build', icon: <BuildIcon size={16} /> },
  { mode: 'preview', label: 'Preview', icon: <PreviewIcon size={16} /> },
  { mode: 'present', label: 'Present', icon: <PresentIcon size={16} /> },
];

export function ModeSwitch() {
  const { state, commands } = useAppState();
  return (
    <div role="radiogroup" aria-label="Mode" className="flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5">
      {MODES.map(({ mode, label, icon }) => (
        <button
          key={mode}
          role="radio"
          aria-checked={state.ui.mode === mode}
          aria-label={label}
          onClick={() => commands.setMode(mode)}
          className={/* match TopStrip's existing button classes; add an
                        active state: bg-white/15 text-white when checked,
                        min-h/min-w from --touch-target on touch */ ''}
        >
          {icon}
          <span className="hidden sm:inline text-sm">{label}</span>
        </button>
      ))}
    </div>
  );
}
```

Transcribe real class names from `TopStrip.tsx`'s existing buttons rather than inventing a new visual language. In `AppShell.tsx`, gate the editing chrome:

```tsx
const mode = state.ui.mode;
…
{mode === 'build' && <ContextTray />}   /* Task 7 — until then: <ToolDock /> */
{mode === 'build' && !isCompactLandscape && <Transport />}
```

(`ToolDock` hidden outside Build; `ViewControls` hidden in Present only — Preview keeps zoom/zone controls, per the audit's "camera presets only" applying to Present.)

- [ ] **Step 3: Run, then update the phone strip check**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (with the preview-bar assertion deferred to Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/ModeSwitch.tsx src/AppShell.tsx src/components/shell/TopStrip.tsx src/App.test.tsx
git commit -m "feat: Build/Preview/Present switcher in the shell"
```

---

### Task 5: Preview mode surface

**Files:**
- Create: `src/components/shell/PreviewBar.tsx`
- Modify: `src/AppShell.tsx`, `src/components/canvas/CanvasSurface.tsx:93,103,470` (suppression conditions)
- Test: `src/App.test.tsx` (extend)

**Interfaces:**
- Consumes: `Transport` (`{ inline?: boolean }`), `usePlaybackSnapshot`, `validateDrillMechanics` results the way `PlaybackSheet.tsx` reads them, `commands.requestPlaybackStart/stopPlayback/setPlaybackProgress/setPlaybackSpeed`.
- Produces: `export function PreviewBar()` — `role="region" aria-label="Preview"`; rendered by `AppShell` when `mode === 'preview'`.

Spec: replaces the dock at the bottom. Contents, top to bottom: (1) the existing `<Transport inline />` (play/pause, progressbar, clock — all already wired to commands); (2) a speed radiogroup identical in behavior to `PlaybackSheet`'s (extract the speed control into a small shared component in the same file if `PlaybackSheet`'s is file-private — do NOT duplicate the radio logic; lift it to `src/components/shell/SpeedControl.tsx` and use it in both); (3) a plain-language validation line: reuse the exact issue-listing logic `PlaybackSheet.tsx` uses, rendered as one sentence per issue, `role="status"`. Canvas: in preview, ghost trails stay on (they explain the drill), but pass-candidate rings and edit handles stay off — extend the conditions at `CanvasSurface.tsx:93,103,470` from `playback.isPlaying` to `playback.isPlaying || ui.mode !== 'build'` for the editing affordances, leaving the trail condition on `isPlaying` alone.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('preview mode', () => {
  it('shows the preview bar with transport and speed controls', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Preview' }));
    const bar = screen.getByRole('region', { name: 'Preview' });
    expect(within(bar).getByRole('button', { name: /play/i })).toBeInTheDocument();
    expect(within(bar).getByRole('radiogroup', { name: /speed/i })).toBeInTheDocument();
  });

  it('tapping a player in preview does not arm anything or open chips', async () => {
    const user = userEvent.setup();
    renderApp();
    // seed a player first, in build, using the harness's existing add-player path
    await user.click(screen.getByRole('radio', { name: 'Preview' }));
    // fire a pointer tap on the rink at a player location via src/test/utils pointer helpers
    expect(screen.queryByRole('button', { name: /Details/ })).not.toBeInTheDocument();
  });
});
```

Copy the player-seeding and rink-tap mechanics from the existing `App.test.tsx` tests that place and select players (they exist for the selection chip) — reuse their helper lines verbatim.

- [ ] **Step 2: Implement, run, commit**

Run: `npx vitest run src/App.test.tsx src/components/`
Expected: PASS.

```bash
git add src/components/shell/PreviewBar.tsx src/components/shell/SpeedControl.tsx src/AppShell.tsx src/components/canvas/CanvasSurface.tsx src/App.test.tsx
git commit -m "feat: Preview mode - read-only playback surface with plain-language validation"
```

---

### Task 6: Present mode surface

**Files:**
- Create: `src/components/shell/PresentOverlay.tsx`
- Modify: `src/AppShell.tsx`, `src/components/shell/useKeyboardShortcuts.ts` (Escape exits Present)
- Test: `src/App.test.tsx` (extend)

**Interfaces:**
- Consumes: `commands.requestPlaybackStart` / `stopPlayback` / `setPlaybackProgress` / `setPlaybackSpeed`, `commands.setMode`, `usePlaybackSnapshot`, `CameraStore.fit()` / `zoomToZone()` (camera presets), icons.
- Produces: `export function PresentOverlay()` — rendered by `AppShell` when `mode === 'present'` instead of `TopStrip`/dock/transport/chips/`ViewControls` (all of them — the audit's "all editing chrome hidden").

Spec: full-bleed canvas with one auto-hiding control bar (opacity fades after 3s idle, any pointer movement restores it — CSS transition + a `useRef` timer, no new state in the reducer). Bar contents: Exit (`aria-label="Exit presentation"`, calls `commands.setMode('build')`), Play/Pause (routes through `requestPlaybackStart`/`stopPlayback` — the e2e invariant), a scrubber `role="slider"` wired like `Transport`'s progressbar, speed control (shared `SpeedControl`), camera presets (Full / D Zone / O Zone buttons calling `camera.zoomToZone`). Escape exits Present (extend the Escape cascade in `useKeyboardShortcuts` — Present-exit takes priority over its other Escape behaviors when `mode === 'present'`). No `requestFullscreen` in this task — browser fullscreen is a follow-up; "full-screen" here means chrome-free.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('present mode', () => {
  it('hides all editing chrome', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Present' }));
    expect(screen.queryByRole('navigation', { name: 'Editing tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit presentation' })).toBeInTheDocument();
  });

  it('its Play button routes through playback validation', async () => {
    const user = userEvent.setup();
    renderApp(); // empty drill: no routes, no events
    await user.click(screen.getByRole('radio', { name: 'Present' }));
    await user.click(screen.getByRole('button', { name: /play/i }));
    // requestPlaybackStart rejects an empty drill with a warning toast:
    expect(await screen.findByText(/nothing to play|no routes/i)).toBeInTheDocument();
  });

  it('Escape exits to build', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Present' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Editing tools' })).toBeInTheDocument();
  });
});
```

For the toast text, transcribe the actual warning copy from `src/commands/playbackCommands.ts:17`'s empty-drill rejection — do not guess the regex.

- [ ] **Step 2: Implement, run, commit**

Note the mode-switcher visibility contradiction to resolve: `ModeSwitch` lives in `TopStrip`, which Present hides — so Present must be exit-able only via the overlay's Exit button and Escape; the third test's final assertions cover the return path. Ensure `PresentOverlay` renders `ModeSwitch` nowhere.

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

```bash
git add src/components/shell/PresentOverlay.tsx src/AppShell.tsx src/components/shell/useKeyboardShortcuts.ts src/App.test.tsx
git commit -m "feat: Present mode - chrome-free full-bleed playback with camera presets"
```

---

### Task 7: Shared zone state and phone zone default

**Files:**
- Modify: `src/camera/CameraStore.ts` (zone field), `src/components/ViewControls.tsx` (drop local `areaIndex`), `src/AppShell.tsx` (phone default effect)
- Test: `src/camera/CameraStore.test.ts` (extend), `src/App.test.tsx` (extend)

**Interfaces:**
- Consumes: `Zone` from `src/camera/cameraMath.ts` (`'full' | 'offensive' | 'defensive'`), `useResponsive().isPhone`.
- Produces: `CameraSnapshot` gains `zone: Zone | 'custom'`; `CameraStore` gains `get zone(): Zone | 'custom'`. `ViewControls` and `MenuSheet` both reflect the same zone truth (fixing the existing label/camera disagreement).

Zone-tracking rules in `CameraStore`: `zoomToZone(zone)` sets `zone`; `fit()` and `reset()` set `'full'`; `setCamera()` and `zoomAt()` set `'custom'`; `setViewport()` leaves it alone (auto-fit refresh is not a user zone change). Phone default: when a drill with zero players becomes current on a phone, apply `zoomToZone('offensive')` once per drill id — full rink remains one tap away (FULL in the cycle, or Fit).

- [ ] **Step 1: Write the failing store tests**

Append to `src/camera/CameraStore.test.ts` (bare `new CameraStore()` pattern):

```ts
describe('zone tracking', () => {
  it('starts at full', () => {
    expect(new CameraStore().zone).toBe('full');
  });
  it('follows zoomToZone and resets on fit', () => {
    const store = new CameraStore();
    store.setViewport(390, 700);
    store.zoomToZone('offensive');
    expect(store.zone).toBe('offensive');
    store.fit();
    expect(store.zone).toBe('full');
  });
  it('goes custom when the user pans or pinch-zooms', () => {
    const store = new CameraStore();
    store.setViewport(390, 700);
    store.zoomToZone('defensive');
    store.zoomAt(1.2, { x: 100, y: 100 });
    expect(store.zone).toBe('custom');
  });
  it('is part of the snapshot so React can subscribe', () => {
    const store = new CameraStore();
    store.zoomToZone('offensive');
    expect(store.getSnapshot().zone).toBe('offensive');
  });
});
```

- [ ] **Step 2: Write the failing phone-default test**

In `src/App.test.tsx`:

```tsx
it('a phone starts a new empty drill framed on a zone, not the full sheet', async () => {
  setViewport(VIEWPORTS.phonePortrait);
  __resetResponsiveCache();
  renderApp();
  await flush();
  expect(services.camera.zone).toBe('offensive');
});

it('a desktop keeps the full sheet', async () => {
  renderApp();
  await flush();
  expect(services.camera.zone).toBe('full');
});
```

- [ ] **Step 3: Implement**

`CameraStore.ts`: private `#zone: Zone | 'custom' = 'full'` (or the class's existing private-field idiom), mutated per the rules above, exposed via getter and added to `getSnapshot()` (remember the snapshot is memoized — include `zone` in the memo key the way `userAdjusted` already is).

`ViewControls.tsx`: delete `const [areaIndex, setAreaIndex] = useState(0)`; derive the label from `useCameraSnapshot(camera).zone` (`'custom'` displays as FULL's neighbor: show `FULL` label but do not claim a zone — use label `VIEW` for `'custom'`); the cycle button advances from the *current* store zone through the existing `AREAS` order.

`AppShell.tsx`:

```tsx
const appliedZoneFor = useRef<string | null>(null);
useEffect(() => {
  if (!isPhone || state.currentDrillId === null) return;
  if (appliedZoneFor.current === state.currentDrillId) return;
  appliedZoneFor.current = state.currentDrillId;
  if (state.drill.players.length === 0) camera.zoomToZone('offensive');
}, [isPhone, state.currentDrillId, state.drill.players.length, camera]);
```

- [ ] **Step 4: Run camera + app suites, commit**

Run: `npx vitest run src/camera/ src/App.test.tsx src/components/`

```bash
git add src/camera/ src/components/ViewControls.tsx src/AppShell.tsx src/App.test.tsx
git commit -m "feat: zone becomes shared camera state; phones default new drills to a zone"
```

---

### Task 8: One tray — selection actions dock, rink chips retired

**Files:**
- Create: `src/components/shell/ContextTray.tsx`
- Modify: `src/components/shell/RinkChips.tsx` (delete `ContextChips` and `SelectionChip`, keep `ActionChip`), `src/AppShell.tsx`, `src/components/sheets/MenuSheet.tsx` (workflow entry), `src/components/shell/Transport.tsx` (possession count)
- Test: `src/App.test.tsx` (update the selection tests)

**Interfaces:**
- Consumes: `ToolDock` (rendered inside, unchanged), `PuckActionButtons({ onlyFor?, compact? })` from `PuckActions.tsx`, `useHoldProgress`, `state.selection`, `state.pendingAction`, `commands.openPlayerInspector` / delete flows copied from today's `SelectionChip`.
- Produces: `export function ContextTray()` — the single bottom surface: a container that always renders `<ToolDock />` as its base row and, when a player or event is selected and no pending action is armed, a selection row above it inside the same container.

What moves where (exact disposition of today's three chip layers):
- `ActionChip` (pending-action instruction + Cancel) — **stays** as the one floating chip; unchanged.
- `SelectionChip` (`#N · role`, Move with hold progress, `PuckActionButtons`, Details, Delete) — its exact contents become the tray's selection row. Same handlers, same accessible names (`Move #N`, `Details`, `Delete`), so the e2e assertions about Details/Shoot need only a location update, not a semantics update.
- `ContextChips` possession chip (`Puck #N · n passes` → possession sheet) — becomes a compact button at the left end of `Transport` (it is playback-adjacent information); same accessible name so `mobile.spec.ts` keeps a one-line locator change.
- `ContextChips` workflow chip (`Step 1 of 4 · Setup` → workflow sheet) — becomes a `SheetItem` in `MenuSheet`'s existing structure labelled `Guide · Step ${n} of 4`; the rink loses it entirely.
- The non-phone lifecycle badge from `ContextChips` — moves into `PreviewBar`/`Transport` status text; delete the badge.

Layout rule: the selection row uses the same height token as the dock (`--tool-dock-height`) so the rink height floors in `e2e/viewports.spec.ts` are affected only while a selection exists; verify the 667×375 landscape floor (≥230px) still holds with the row visible — if it does not, the selection row in `isCompactLandscape` renders as a horizontal strip *inside* the dock row (replacing Add/Play while selected) instead of stacking.

- [ ] **Step 1: Update the unit tests first (they define the contract)**

In `src/App.test.tsx`, find the existing selection-chip tests (the ones asserting `Move #N` / `Details` / `Delete` on selection) and repoint their queries at the tray:

```tsx
const tray = screen.getByRole('group', { name: 'Selection' });
expect(within(tray).getByRole('button', { name: `Move #${number}` })).toBeInTheDocument();
```

Add:

```tsx
it('selecting a player extends the tray instead of floating a chip over the ice', async () => {
  // seed + select a player using the file's existing helper lines
  const main = screen.getByRole('main');
  expect(within(main).queryByRole('button', { name: /Details/ })).not.toBeInTheDocument();
  const tray = screen.getByRole('group', { name: 'Selection' });
  expect(within(tray).getByRole('button', { name: 'Details' })).toBeInTheDocument();
});

it('the workflow guide lives in the menu, not on the rink', async () => {
  const user = userEvent.setup();
  renderApp();
  expect(screen.queryByRole('button', { name: /Step 1 of 4/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /menu/i }));
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).getByRole('button', { name: /Step 1 of 4/ })).toBeInTheDocument();
});
```

(Transcribe the real menu-opener accessible name from `TopStrip.tsx` — likely `Menu` — before running.)

- [ ] **Step 2: Run to verify the new tests fail, then implement**

`ContextTray.tsx` skeleton:

```tsx
export function ContextTray() {
  const { state } = useAppState();
  const selectedPlayer = usePlayerSelection(state);   // same lookup SelectionChip used — move it here
  const showSelection = selectedPlayer !== null && state.pendingAction.kind === 'none';
  return (
    <div className="shrink-0">
      {showSelection && (
        <div role="group" aria-label="Selection" className="flex h-[var(--tool-dock-height)] items-center gap-1 border-t border-white/10 px-2">
          {/* the exact JSX moved from SelectionChip: label, Move-with-hold, 
              <PuckActionButtons onlyFor={selectedPlayer.id} compact={isPhone} />, Details, Delete */}
        </div>
      )}
      <ToolDock />
    </div>
  );
}
```

Move — do not copy — `SelectionChip`'s body; delete `SelectionChip` and `ContextChips` exports and their `AppShell` usages; keep `ActionChip`.

- [ ] **Step 3: Run everything unit-level**

Run: `npx vitest run src/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ src/AppShell.tsx src/App.test.tsx
git commit -m "feat: one bottom tray - selection actions dock with the verbs, rink chips retired"
```

---

### Task 9: First-run guided hint

**Files:**
- Create: `src/components/shell/FirstRunHint.tsx`
- Modify: `src/AppShell.tsx`
- Test: `src/App.test.tsx` (extend)

**Interfaces:**
- Consumes: `state.drill` emptiness, `localStorage` via the same guarded access pattern the codebase uses elsewhere (grep `localStorage` in `src/` and copy the try/catch idiom), `ActionChip`'s visual style.
- Produces: `export function FirstRunHint()` — one dismissible instruction chip shown in Build mode when the drill has no players and the flag `phicecraft.firstRunHintDone` is unset; it advances through exactly three messages keyed to state: no players → "Tap Add to place your first player."; players but no routes → "Select a player, then tap Skate to draw their route."; routes but no events → "Tap Pass with the puck carrier selected to connect a pass." Each stage auto-advances when its condition is met; dismissing at any stage (or completing the third) writes the flag permanently, per the audit's "show one instruction at a time and dismiss it permanently after successful completion".

- [ ] **Step 1: Failing tests**

```tsx
describe('first-run hint', () => {
  it('greets an empty drill with the Add hint', async () => {
    renderApp();
    expect(await screen.findByText(/tap add/i)).toBeInTheDocument();
  });
  it('never returns once dismissed', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Dismiss hint' }));
    cleanup();
    renderApp();
    expect(screen.queryByText(/tap add/i)).not.toBeInTheDocument();
  });
});
```

Use `installFakeLocalStorage()` from `src/test/utils.ts` in the describe's `beforeEach`.

- [ ] **Step 2: Implement, run, commit**

Render it in `AppShell` next to `ActionChip` in the same chip lane, mutually exclusive with a pending action (`if (state.pendingAction.kind !== 'none') return null` — same guard `SelectionChip` used).

```bash
git add src/components/shell/FirstRunHint.tsx src/AppShell.tsx src/App.test.tsx
git commit -m "feat: three-step first-run hint that dismisses permanently"
```

---

### Task 10: E2E and visual suite alignment

**Files:**
- Modify: `e2e/mobile.spec.ts`, `e2e/puckActions.spec.ts`, `e2e/viewports.spec.ts` (only if a floor assertion moved), `e2e/flows.spec.ts` (add Present to the every-Play-surface test)
- Regenerate: all baselines under `e2e/__screenshots__/`

**Interfaces:** consumes everything above; produces a green full gate.

- [ ] **Step 1: Update the named assertions**

- `mobile.spec.ts` "the possession and workflow bars are collapsed into chips" → retitle "possession lives on the transport and the guide lives in the menu"; possession locator moves to within the transport; workflow locator moves behind the menu.
- `mobile.spec.ts` "selecting a player shows a chip, not a panel" → the chip queries repoint to `role=group[name="Selection"]`.
- `puckActions.spec.ts` "Shoot appears on the chip for the player holding the puck" → same repoint; "Pass is a verb in the dock" unchanged.
- `flows.spec.ts` every-Play-surface test: add the Present overlay's Play button to the list of surfaces it iterates.
- Add one new spec block to `mobile.spec.ts`: switching to Preview on a phone shows the preview bar and taps on players are inert; switching to Present hides the top strip and Escape/Exit returns.

- [ ] **Step 2: Run the functional e2e projects**

Run: `npx playwright install --with-deps chromium` (once), then `npm run test:e2e`
Expected: PASS. Iterate on real regressions before touching any baseline.

- [ ] **Step 3: Regenerate visual baselines**

Run: `npm run test:visual:update`, then `npm run test:visual`
Expected: clean run against the new baselines. Eyeball each changed PNG (`git diff --stat e2e/__screenshots__/`) — the diffs should be exactly: no rink chips, tray at the bottom, mode switcher in the strip, zone-framed phone portrait.

- [ ] **Step 4: Full gate and commit**

Run: `npm run typecheck && npm run lint && npm run test && npm run check:budgets` (after `npm run build`)

```bash
git add e2e/
git commit -m "test: e2e and visual suites track the mode switcher and tray shell"
```

---

## Carried-in findings from the Phase 0 final review (service-worker update UX)

Two pre-existing `public/sw.js` behaviors became routine once Phase 0 made the worker's bytes change per deploy. Both were parked out of Phase 0's scope as product decisions; resolve them alongside this plan's UX work (they are small code changes but user-visible):

1. `public/sw.js:92` calls `skipWaiting()` in the install handler, which — combined with `clients.claim()` and `updateManager.ts`'s `controllerchange` reload — reloads the page under the coach on every deploy, contradicting `src/pwa/updateManager.ts:1-13`'s explicit consent-based update contract. Fix candidate: delete the `skipWaiting()` call; the message-driven `SKIP_WAITING` handler (line 115) already implements the consent path. First-visit caching is unaffected (no active worker to wait behind).
2. `public/sw.js:84-88,103` — install precaches with `Promise.allSettled` (partial failure still installs), then activate deletes every cache not matching the new VERSION. With per-deploy versions, an update on a flaky connection can leave a half-filled new cache and no old fallback. Fix candidates: fail install when precache is incomplete, or key the asset cache by content-hashed filenames instead of VERSION.

## Self-review notes (already applied)

- **Deliberate divergence from the audit:** its tray spec (`Add / Select / Preview` when idle) would delete the shipped three-verb dock that README documents and three test suites lock. This plan keeps the dock as the tray's base row and delivers the audit's actual goals — one action surface, no floating selection chrome, no rink-top chips. If the user wants the literal `Add/Select/Preview` idle tray instead, only Task 8 changes.
- Out of scope, deliberately: browser `requestFullscreen` and wake lock in Present; a `station`/`half` zone preset (needs `Zone` union + `rinkRegion()` design); magnified editing lens; center-logo de-emphasis (`RinkRenderer` change — belongs with the renderer work); moving sheets onto the command layer.
- Type consistency: `AppMode` (Tasks 1,2,4), `ContextTray` (4,8), `SpeedControl` (5,6), `zone: Zone | 'custom'` (7) spelled identically throughout.
- Ordering note: Task 4's preview-bar assertion is split so each task lands green on its own.
