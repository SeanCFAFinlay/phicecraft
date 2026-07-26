// ============================================================================
// KEYBOARD SHORTCUTS
//
// Escape/Back cancels the pending action or closes the topmost dismissible
// surface. Space controls playback only when focus is not in a text field.
// Undo/redo are announced. Enter opens the details of the current selection.
//
// P, S and R are the three authoring verbs - pass, shoot, route - on the
// carrier or the selected player, so a drill can be built without the pointer
// ever leaving the rink.
// ============================================================================

import { useEffect } from 'react';
import { useAppState, useAppServices, useCommands } from '@/hooks/useAppState';
import { attackingNetFor, canAddEvents, countPasses, getCurrentPuckHolder, MAX_PASSES_PER_DRILL } from '@/engine/puck';

function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

export function useKeyboardShortcuts(): void {
  const { state, dispatch } = useAppState();
  const { announcer, dialogs } = useAppServices();
  const commands = useCommands();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog owns Escape while it is open; its own trap handles it.
      if (dialogs.getSnapshot()) return;

      if (event.key === 'Escape') {
        // Topmost first: pending action, then inspector, then sheet, then menu.
        if (state.pendingAction.kind !== 'none') {
          commands.cancelPendingAction();
        } else if (state.ui.inspector.kind !== 'none') {
          commands.closeInspector();
          announcer.announce('Details closed');
        } else if (state.ui.openSheet !== 'none') {
          dispatch({ type: 'CLOSE_SHEET' });
        } else if (state.ui.showMenu) {
          dispatch({ type: 'CLOSE_MENU' });
        } else if (state.selection.selectedPlayerId || state.selection.selectedEventId) {
          commands.selectPlayer(null);
          commands.selectEvent(null);
          announcer.announce('Selection cleared');
        }
        event.preventDefault();
        return;
      }

      if (isTextEntry(event.target)) return;

      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) commands.redo();
        else commands.undo();
        return;
      }

      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        commands.redo();
        return;
      }

      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void commands.saveDrill();
        return;
      }

      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        if (state.playback.isPlaying) commands.stopPlayback();
        else commands.requestPlaybackStart();
        return;
      }

      // The authoring verbs. Pass and Shoot act on whoever is carrying;
      // Route acts on the selection, since any player can be given one.
      const key = event.key.toLowerCase();
      if (!meta && (key === 'p' || key === 's' || key === 'r')) {
        const { players, events } = state.drill;
        const carrier = getCurrentPuckHolder(players, events);

        if (key === 'r') {
          const selected = state.selection.selectedPlayerId;
          if (!selected) return;
          event.preventDefault();
          commands.setPendingAction({ kind: 'draw-route', playerId: selected });
          return;
        }

        if (!carrier || !canAddEvents(events)) return;
        event.preventDefault();

        if (key === 's') {
          void commands.requestShot(carrier.id, attackingNetFor(carrier.team));
          return;
        }
        if (countPasses(events) >= MAX_PASSES_PER_DRILL) {
          announcer.announce(`A drill holds ${MAX_PASSES_PER_DRILL} passes.`);
          return;
        }
        commands.setPendingAction({ kind: 'pass', playerId: carrier.id });
        announcer.announce(`Pass from #${carrier.number}. Choose a teammate.`);
        return;
      }

      if (event.key === 'Enter') {
        if (state.selection.selectedPlayerId) {
          event.preventDefault();
          commands.openPlayerInspector(state.selection.selectedPlayerId);
        } else if (state.selection.selectedEventId) {
          event.preventDefault();
          commands.openEventInspector(state.selection.selectedEventId);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, dispatch, commands, announcer, dialogs]);
}
