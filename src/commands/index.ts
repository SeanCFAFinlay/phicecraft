// ============================================================================
// COMMANDS - the single authoring path
// ============================================================================

import { createAuthoringCommands } from './authoringCommands';
import { createDocumentCommands } from './documentCommands';
import { createPlaybackCommands } from './playbackCommands';
import type { CommandHost, DrillCommandService } from './commandTypes';

export * from './commandTypes';
export * from './confirmations';
export { isReviewComplete } from './playbackCommands';
export { RINK_MARGIN } from './authoringCommands';

/**
 * Build the command service. Composed from three focused factories so no one
 * file owns everything, while callers still see one flat surface.
 */
export function createDrillCommandService(host: CommandHost): DrillCommandService {
  return {
    ...createAuthoringCommands(host),
    ...createPlaybackCommands(host),
    ...createDocumentCommands(host),
  };
}
