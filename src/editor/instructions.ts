// ============================================================================
// INSTRUCTIONS
//
// Every piece of "what do I do now" copy in the app is generated here, from
// the actual tool, pending action, possession state, and pointer capability.
//
// The app used to carry three contradictory versions of this: TOOL_HINTS,
// hard-coded mode banners, and a static How-To list in the menu that described
// a 0.7s hold the code implemented as 230ms. Generating it from one place is
// what stops that drifting again.
// ============================================================================

import type { PendingEditorAction, Player, Tool } from '@/core/types';
import { HOLD_DURATION } from '@/core/constants';

export type PointerCapability = 'touch' | 'mouse';

export interface InstructionContext {
  tool: Tool;
  pendingAction: PendingEditorAction;
  /** The player who currently holds the puck, if anyone. */
  carrier: Player | null;
  /** Looked up from `pendingAction`, so the copy can name the player. */
  subject: Player | null;
  pointer: PointerCapability;
  holdToMoveEnabled: boolean;
}

export interface Instruction {
  /** Short label for the action chip, e.g. "Pass from #11". */
  label: string;
  /** The single next input the user should make. */
  next: string;
  /** True when a Cancel control must be shown alongside. */
  cancellable: boolean;
}

const verb = (pointer: PointerCapability) => (pointer === 'touch' ? 'Tap' : 'Click');
const dragVerb = (pointer: PointerCapability) => (pointer === 'touch' ? 'Drag' : 'Drag');

/**
 * The instruction for the current editor state. Always returns something, so
 * the chip never shows an empty string.
 */
export function instructionFor(context: InstructionContext): Instruction {
  const { pendingAction, subject, pointer } = context;
  const who = subject ? `#${subject.number}` : 'the player';

  switch (pendingAction.kind) {
    case 'pass':
      return {
        label: `Pass from ${who}`,
        next: `${verb(pointer)} a teammate, or ${dragVerb(pointer).toLowerCase()} to open ice for a dump.`,
        cancellable: true,
      };

    case 'shoot':
      return {
        label: `Shot from ${who}`,
        next: `${verb(pointer)} or drag toward a net.`,
        cancellable: true,
      };

    case 'draw-route':
      return {
        label: `Route for ${who}`,
        next: 'Draw the movement path, then release.',
        cancellable: true,
      };

    case 'move-player':
      return {
        label: `Moving ${who}`,
        next: 'Tap where they should stand, or drag them there.',
        cancellable: true,
      };

    case 'move-coach':
      return { label: 'Moving coach', next: 'Drag to the new spot, then release.', cancellable: true };

    case 'edit-route':
      return {
        label: 'Editing route',
        next: 'Drag a handle to reshape the path.',
        cancellable: true,
      };

    case 'edit-event':
      return {
        label: 'Editing puck line',
        next: 'Drag the middle handle to bend it, or the end to re-aim it.',
        cancellable: true,
      };

    case 'none':
      return { ...toolInstruction(context), cancellable: false };
  }
}

function toolInstruction(context: InstructionContext): Omit<Instruction, 'cancellable'> {
  const { tool, pointer, carrier } = context;

  switch (tool) {
    case 'move':
      return {
        label: 'Move',
        next: carrier
          ? `${verb(pointer)} a player to select it · ${dragVerb(pointer).toLowerCase()} #${carrier.number} to pass.`
          : `${verb(pointer)} a player to select it · ${dragVerb(pointer).toLowerCase()} one to draw a route.`,
      };
    case 'home':
      return { label: 'Add home', next: `${verb(pointer)} empty ice to place a home player.` };
    case 'away':
      return { label: 'Add away', next: `${verb(pointer)} empty ice to place an away player.` };
    case 'goalie':
      return {
        label: 'Add goalie',
        next: `${verb(pointer)} an end to place its goalie — home defends the left net.`,
      };
    case 'coach':
      return { label: 'Add coach', next: `${verb(pointer)} empty ice to place the coach.` };
  }
}

// ----------------------------------------------------------------------------
// Help content
//
// Generated from the same constants the implementation uses, so the documented
// hold duration is by construction the real one.
// ----------------------------------------------------------------------------

export interface HelpEntry {
  icon: string;
  text: string;
}

export function helpEntries(pointer: PointerCapability, holdToMoveEnabled: boolean): HelpEntry[] {
  const entries: HelpEntry[] = [
    { icon: '🏒', text: `${dragVerb(pointer)} from the puck carrier to a teammate to pass, or to open ice to dump.` },
    { icon: '🥅', text: 'Drag from the carrier toward a net to shoot. The shot starts at their final route position.' },
    { icon: '〰', text: `${dragVerb(pointer)} any other player to draw their skating route.` },
    { icon: '⟶', text: 'Drag from a point on a route to release the puck at that moment.' },
    {
      icon: '✋',
      text: `Select a player, then use Move to reposition them.${
        holdToMoveEnabled ? ` Holding a player for ${(HOLD_DURATION / 1000).toFixed(1)}s does the same thing.` : ''
      }`,
    },
    { icon: '🎯', text: 'Tap a selected player again, or press Details, to open its full inspector.' },
  ];

  if (pointer === 'touch') {
    entries.push({ icon: '🤏', text: 'Pinch to zoom. Drag empty ice to pan the rink.' });
  } else {
    entries.push({ icon: '🖱', text: 'Scroll to zoom. Drag empty ice to pan the rink.' });
  }

  entries.push({ icon: '⎋', text: 'Escape cancels the current action or closes the topmost panel.' });
  return entries;
}
