// ============================================================================
// useDrillSteps
//
// The numbered steps of the current drill, kept in step with playback: which
// one is on the ice now, and a way to jump to any of them - mid-play or
// paused - without dropping out of playback.
// ============================================================================

import { useCallback, useMemo } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { usePlaybackSnapshot } from '@/playback/usePlaybackSnapshot';
import { buildDrillStory, stepAt, type DrillStory, type StoryStep } from './drillStory';

export interface DrillSteps {
  story: DrillStory;
  current: StoryStep | null;
  timeSeconds: number;
  /** Move the playhead to a step's start; keeps playing if it was playing. */
  goToStep: (step: StoryStep) => void;
}

export function useDrillSteps(): DrillSteps {
  const { state } = useAppState();
  const { playback, controller } = useEditorRuntime();
  const snapshot = usePlaybackSnapshot(playback);
  const story = useMemo(() => buildDrillStory(state.drill), [state.drill]);

  const duration = story.durationSeconds || snapshot.durationSeconds;
  const timeSeconds = (snapshot.progressPercent / 100) * snapshot.durationSeconds;
  // The snapshot is rounded to 1%: lean forward half a percent so a jump to a
  // step's exact start lands on that step, not the one before it.
  const current = stepAt(story, timeSeconds + duration * 0.006);

  const isPlaying = state.playback.isPlaying;
  const speed = state.playback.speed;
  const goToStep = useCallback(
    (step: StoryStep) => {
      const progress = duration > 0 ? Math.min(0.999, step.startSeconds / duration) : 0;
      if (isPlaying) {
        controller.stop();
        playback.seek(progress);
        controller.start(speed);
      } else {
        playback.seek(progress);
      }
    },
    [controller, duration, isPlaying, playback, speed]
  );

  return { story, current, timeSeconds, goToStep };
}
