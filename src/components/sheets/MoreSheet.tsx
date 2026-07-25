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

export function MoreSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();

  const open = state.ui.openSheet === 'more';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  const run = (action: () => unknown) => () => {
    close();
    void action();
  };

  return (
    <Sheet open={open} title="More" onClose={close}>
      <SheetSection title="History">
        <SheetItem
          icon="↩"
          label="Undo"
          detail={state.undoStack.length === 0 ? 'Nothing to undo' : `${state.undoStack.length} step(s)`}
          disabled={state.undoStack.length === 0}
          onClick={run(commands.undo)}
        />
        <SheetItem
          icon="↪"
          label="Redo"
          detail={state.redoStack.length === 0 ? 'Nothing to redo' : `${state.redoStack.length} step(s)`}
          disabled={state.redoStack.length === 0}
          onClick={run(commands.redo)}
        />
      </SheetSection>

      <SheetSection title="Clear">
        <SheetItem
          icon="🏒"
          label="Clear puck actions"
          detail="Removes passes, dumps, pickups and shots. Routes are kept."
          tone="danger"
          disabled={state.drill.events.length === 0}
          onClick={run(commands.clearPuckActions)}
        />
        <SheetItem
          icon="〰"
          label="Clear skating routes"
          detail="Removes routes only. Puck actions are kept."
          tone="danger"
          disabled={state.drill.skatePaths.length === 0}
          onClick={run(commands.clearMovementRoutes)}
        />
        <SheetItem
          icon="♻️"
          label="Reset the board"
          detail="Back to the default lineup. Keeps the name, jerseys and settings."
          tone="danger"
          onClick={run(commands.resetBoard)}
        />
      </SheetSection>

      <SheetSection title="Repair">
        <SheetItem
          icon="🧲"
          label="Recover off-rink objects"
          detail="Pulls anything outside the boards back onto the ice"
          onClick={run(commands.recoverOffRinkObjects)}
        />
      </SheetSection>

      <SheetSection title="Diagnostics">
        <SheetItem
          icon="📊"
          label="Mechanics overlay"
          detail="Draws velocities, blade positions and puck state on the rink"
          selected={state.ui.showDiagnostics}
          onClick={() => dispatch({ type: 'TOGGLE_DIAGNOSTICS' })}
        />
      </SheetSection>
    </Sheet>
  );
}
