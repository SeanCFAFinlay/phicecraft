// ============================================================================
// MORE SHEET
//
// Everything moved off the phone top strip: redo, the three destructive
// clears, the off-rink recovery command, and diagnostics.
//
// The clears are three separate items with three exact meanings. The single
// "Clear all paths and events?" they replaced removed routes AND puck actions
// while saying only "clear paths".
// ============================================================================

import { Sheet } from '../a11y/Sheet';
import { SheetItem, SheetSection } from './QuickSheets';
import { useAppState, useCommands } from '@/hooks/useAppState';
import type { FinishPolicy, RendererPreference } from '@/core/types';
import { DEFAULT_RENDERER_PREFERENCE } from '@/core/constants';
import { readRendererPreference, writeRendererPreference } from '@/render/selectRenderer';
import {
  ChartIcon,
  MagnetIcon,
  PuckIcon,
  RedoIcon,
  ResetIcon,
  SkateIcon,
  UndoIcon,
} from '@/ui/icons';

/**
 * The renderer toggle (Phase 3). Switching takes effect from the next full
 * load, not live - swapping BoardRenderer implementations mid-session would
 * mean tearing down and recreating both canvases, and a coach mid-drill
 * should not have that happen invisibly - so this reloads the app
 * immediately after persisting the choice, the same "explicit, not silent"
 * contract UpdateBanner uses for its own reload.
 *
 * WebGL became the default on 2026-07-31 (see docs/v2/PROGRESS.md, Phase 3);
 * Canvas 2D remains the always-available compatibility fallback, and
 * `selectRenderer` drops to it automatically if WebGL cannot initialize.
 */
const RENDERERS: { pref: RendererPreference; label: string; detail: string }[] = [
  {
    pref: 'webgl',
    label: 'GPU renderer',
    detail: 'PixiJS/WebGL — the default, falls back to standard automatically if unsupported',
  },
  { pref: 'canvas2d', label: 'Standard renderer', detail: 'Canvas 2D — the compatibility fallback' },
];

/**
 * How a drill can end. Only the shot option makes the app derive a puck
 * action; the rest simply record what the coach intends, which is what lets a
 * possession game or a passing warm-up stop being described as a missing shot.
 */
const FINISHES: { policy: FinishPolicy; label: string; detail: string }[] = [
  { policy: 'none', label: 'No set finish', detail: 'The drill ends when the sequence does' },
  { policy: 'finish-with-shot', label: 'Finish with a shot', detail: 'The last carrier shoots, worked out for you' },
  { policy: 'finish-with-zone-entry', label: 'Finish on zone entry', detail: 'Breakouts and rushes that end at the line' },
  { policy: 'finish-with-possession', label: 'Finish on possession', detail: 'Battles and small-area games' },
  { policy: 'loop', label: 'Loop', detail: 'Continuous patterns that run back to the start' },
  { policy: 'stop-after-sequence', label: 'Stop after the sequence', detail: 'Races and timed stations' },
];

export function MoreSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();

  const open = state.ui.openSheet === 'more';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });
  // Preview and Present are read-only: history, finish policy, the
  // destructive clears and repair all mutate the document, so none of them
  // belong here outside Build. Diagnostics is a display overlay, not a
  // mutation, and stays available in every mode.
  const isBuild = state.ui.mode === 'build';
  const rendererPreference = readRendererPreference() ?? DEFAULT_RENDERER_PREFERENCE;

  const run = (action: () => unknown) => () => {
    close();
    void action();
  };

  return (
    <Sheet open={open} title="More" onClose={close}>
      {isBuild && (
        <SheetSection title="History">
          <SheetItem
            icon={<UndoIcon />}
            label="Undo"
            detail={state.undoStack.length === 0 ? 'Nothing to undo' : `${state.undoStack.length} step(s)`}
            disabled={state.undoStack.length === 0}
            onClick={run(commands.undo)}
          />
          <SheetItem
            icon={<RedoIcon />}
            label="Redo"
            detail={state.redoStack.length === 0 ? 'Nothing to redo' : `${state.redoStack.length} step(s)`}
            disabled={state.redoStack.length === 0}
            onClick={run(commands.redo)}
          />
        </SheetSection>
      )}

      {isBuild && (
        <SheetSection title="How this drill ends">
          {FINISHES.map(option => (
            <SheetItem
              key={option.policy}
              icon={(state.drill.settings?.finishPolicy ?? 'none') === option.policy ? '●' : '○'}
              label={option.label}
              detail={option.detail}
              selected={(state.drill.settings?.finishPolicy ?? 'none') === option.policy}
              onClick={() => commands.setFinishPolicy(option.policy)}
            />
          ))}
        </SheetSection>
      )}

      {isBuild && (
        <SheetSection title="Clear">
          <SheetItem
            icon={<PuckIcon />}
            label="Clear puck actions"
            detail="Removes passes, dumps, pickups and shots. Routes are kept."
            tone="danger"
            disabled={state.drill.events.length === 0}
            onClick={run(commands.clearPuckActions)}
          />
          <SheetItem
            icon={<SkateIcon />}
            label="Clear skating routes"
            detail="Removes routes only. Puck actions are kept."
            tone="danger"
            disabled={state.drill.skatePaths.length === 0}
            onClick={run(commands.clearMovementRoutes)}
          />
          <SheetItem
            icon={<ResetIcon />}
            label="Reset the board"
            detail="Back to the default lineup. Keeps the name, jerseys and settings."
            tone="danger"
            onClick={run(commands.resetBoard)}
          />
        </SheetSection>
      )}

      {isBuild && (
        <SheetSection title="Repair">
          <SheetItem
            icon={<MagnetIcon />}
            label="Recover off-rink objects"
            detail="Pulls anything outside the boards back onto the ice"
            onClick={run(commands.recoverOffRinkObjects)}
          />
        </SheetSection>
      )}

      <SheetSection title="Diagnostics">
        <SheetItem
          icon={<ChartIcon />}
          label="Mechanics overlay"
          detail="Draws velocities, blade positions and puck state on the rink"
          selected={state.ui.showDiagnostics}
          onClick={() => dispatch({ type: 'TOGGLE_DIAGNOSTICS' })}
        />
      </SheetSection>

      {isBuild && (
        <SheetSection title="Renderer">
          {RENDERERS.map(option => (
            <SheetItem
              key={option.pref}
              icon={rendererPreference === option.pref ? '●' : '○'}
              label={option.label}
              detail={option.detail}
              selected={rendererPreference === option.pref}
              onClick={() => {
                if (option.pref === rendererPreference) {
                  close();
                  return;
                }
                writeRendererPreference(option.pref);
                window.location.reload();
              }}
            />
          ))}
        </SheetSection>
      )}
    </Sheet>
  );
}
