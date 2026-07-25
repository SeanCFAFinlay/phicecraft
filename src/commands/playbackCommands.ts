// ============================================================================
// PLAYBACK COMMANDS
//
// `requestPlaybackStart()` is the ONLY way playback begins. Every Play button,
// menu item, and keyboard shortcut routes here, so validation, menu closing,
// lifecycle, and announcements behave identically wherever you pressed play.
// ============================================================================

import { validateDrillMechanics } from '@/engine/drillValidation';
import { getNextPlaybackCheckpoint } from '@/engine/playback';
import { done, rejected, type CommandHost, type PlaybackCommands } from './commandTypes';

export function createPlaybackCommands(host: CommandHost): PlaybackCommands {
  const { dispatch, getState, notify } = host;

  return {
    requestPlaybackStart() {
      const state = getState();

      if (state.playback.isPlaying) return done();

      // Close whatever is covering the rink before the play runs.
      dispatch({ type: 'CLOSE_MENU' });
      dispatch({ type: 'CLOSE_SHEET' });
      dispatch({ type: 'CANCEL_PENDING_ACTION' });

      if (state.drill.skatePaths.length === 0 && state.drill.events.length === 0) {
        const reason = 'Add a skating route or a puck action before playing.';
        notify.toast({ message: reason, type: 'warning', dedupeKey: 'play-empty' });
        host.announce(reason);
        return rejected(reason);
      }

      const blocking = validateDrillMechanics(state.drill).filter(issue => issue.severity === 'error');
      if (blocking.length > 0) {
        // Open the surface that explains the problem rather than flashing a
        // toast the user cannot re-read.
        dispatch({ type: 'SET_EDITOR_STEP', step: 'review' });
        if (blocking[0].playerId) dispatch({ type: 'SELECT_PLAYER', id: blocking[0].playerId });
        else if (blocking[0].eventId) dispatch({ type: 'SELECT_EVENT', id: blocking[0].eventId });

        notify.toast({
          message: blocking[0].message,
          type: 'error',
          duration: 0,
          dedupeKey: `play-blocked:${blocking[0].message}`,
        });
        host.announce(`Playback blocked. ${blocking[0].message}`);
        return rejected(blocking[0].message);
      }

      dispatch({ type: 'START_PLAYBACK' });
      dispatch({ type: 'SET_PLAY_BANNER', message: `▶  ${state.drill.name}` });
      host.announce(`Playing ${state.drill.name}`);
      return done();
    },

    stopPlayback() {
      dispatch({ type: 'STOP_PLAYBACK' });
      dispatch({ type: 'CLEAR_BANNERS' });
    },

    setPlaybackProgress(progress) {
      // Scrubbing writes straight into the frame store: the canvas redraws,
      // and React only hears about it at the coarse snapshot's granularity.
      host.playback.seek(progress);
    },

    setPlaybackSpeed(speed) {
      dispatch({ type: 'SET_PLAYBACK_SPEED', speed });
      notify.toast({
        message: `Speed ${speed}×`,
        type: 'info',
        duration: 1400,
        dedupeKey: `speed:${speed}`,
      });
    },

    resetPlayback() {
      dispatch({ type: 'STOP_PLAYBACK' });
      dispatch({ type: 'RESET_PLAYBACK' });
      dispatch({ type: 'CLEAR_BANNERS' });
      host.playback.reset();
    },

    stepPlayback() {
      const state = getState();
      if (state.playback.isPlaying) {
        dispatch({ type: 'STOP_PLAYBACK' });
        return;
      }
      const current = host.playback.getFrame().progress;
      host.playback.seek(getNextPlaybackCheckpoint(state.drill.events, current));
    },

    completeReview(options) {
      const state = getState();

      // Review completes only when the current revision has no blocking
      // errors. A drill you cannot play has not been reviewed.
      const blocking = validateDrillMechanics(state.drill).filter(issue => issue.severity === 'error');
      if (blocking.length > 0) {
        if (options?.announce !== false) {
          notify.toast({
            message: `Review is not complete: ${blocking[0].message}`,
            type: 'warning',
            dedupeKey: 'review-blocked',
          });
        }
        return;
      }

      dispatch({ type: 'MARK_REVIEWED' });
      if (options?.announce !== false) {
        notify.toast({ message: 'Review complete', type: 'success', dedupeKey: 'review-complete' });
        host.announce('Review complete for this version of the drill');
      }
    },
  };
}

/** True when the current document revision has been reviewed. */
export function isReviewComplete(state: { documentRevision: number; reviewedRevision: number | null }): boolean {
  return state.reviewedRevision !== null && state.reviewedRevision === state.documentRevision;
}
