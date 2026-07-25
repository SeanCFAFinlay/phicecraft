// ============================================================================
// CONFIRMATION COPY
//
// One exact string per destructive decision, used from every surface. Each one
// says what is removed AND what remains, so the user is never guessing which
// of the three clears they just pressed.
// ============================================================================

import type { ConfirmationRequest } from './commandTypes';

export const CONFIRMATIONS = {
  clearPuckActions: {
    id: 'clear-puck-actions',
    title: 'Clear puck actions?',
    body:
      'Removes every pass, dump, pickup and shot in this drill. Players, coaches, skating routes, jerseys and settings are kept, and the puck returns to the starting carrier. This can be undone.',
    confirmLabel: 'Clear puck actions',
    cancelLabel: 'Keep them',
    destructive: true,
  },

  clearMovementRoutes: {
    id: 'clear-movement-routes',
    title: 'Clear skating routes?',
    body:
      'Removes every skating route. Players, coaches, puck actions, jerseys and settings are all kept. This can be undone.',
    confirmLabel: 'Clear routes',
    cancelLabel: 'Keep them',
    destructive: true,
  },

  resetBoard: {
    id: 'reset-board',
    title: 'Reset the board?',
    body:
      'Restores the default lineup and clears every route, puck action and coach. The drill keeps its name, jersey colours and settings. This can be undone.',
    confirmLabel: 'Reset board',
    cancelLabel: 'Cancel',
    destructive: true,
  },

  newDrill: {
    id: 'new-drill',
    title: 'Start a new drill?',
    body: 'Your current play stays saved in Saved Plays. A new drill opens with the default lineup.',
    confirmLabel: 'New drill',
    cancelLabel: 'Cancel',
    destructive: false,
  },

  removePlayer: {
    id: 'remove-player',
    title: 'Remove this player?',
    body:
      'Removes the player, their skating route, and any puck action that involves them. Everything else is kept. This can be undone.',
    confirmLabel: 'Remove player',
    cancelLabel: 'Cancel',
    destructive: true,
  },

  restartPossession: {
    id: 'restart-possession',
    title: 'Restart the possession sequence?',
    body:
      'Giving the puck to a different player clears every existing pass, dump, pickup and shot. Skating routes, players and settings are kept. This can be undone.',
    confirmLabel: 'Restart possession',
    cancelLabel: 'Cancel',
    destructive: true,
  },
} as const satisfies Record<string, ConfirmationRequest>;

/** Deleting a named play needs the name in the copy, so it is built here. */
export function deleteDrillConfirmation(name: string): ConfirmationRequest {
  return {
    id: 'delete-drill',
    title: `Delete “${name}”?`,
    body:
      'This permanently removes the play from this device. It cannot be undone. Export your drills first if you want a copy.',
    confirmLabel: 'Delete play',
    cancelLabel: 'Keep it',
    destructive: true,
  };
}

/** Replacing a local drill during import. */
export function replaceDrillConfirmation(localName: string, incomingName: string): ConfirmationRequest {
  return {
    id: 'replace-drill',
    title: 'Replace the matching play?',
    body: `“${localName}” on this device will be replaced by “${incomingName}” from the file. A recovery copy of your version is kept, and you can download it from the menu. Choose Import as copy instead to keep both.`,
    confirmLabel: 'Replace it',
    cancelLabel: 'Import as copy',
    destructive: true,
  };
}
