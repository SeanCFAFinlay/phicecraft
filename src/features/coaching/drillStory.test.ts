import { describe, expect, it } from 'vitest';
import { DRILL_TEMPLATES, findTemplate } from '@/data/templates/registry';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { RINK, FT } from '@/core/constants';
import { buildDrillStory, describeSpot, stepAt, storyText } from './drillStory';

describe('describeSpot', () => {
  it('names offensive-zone spots from the attacking team\'s point of view', () => {
    // Home attacks the right net; its left is the top of the screen.
    expect(describeSpot({ x: RINK.goalLineRightX - 8 * FT, y: RINK.centerY }, 'home')).toBe('the net front');
    expect(describeSpot({ x: RINK.goalLineRightX - 28 * FT, y: RINK.centerY + 5 }, 'home')).toBe('the slot');
    expect(describeSpot({ x: RINK.goalLineRightX + 5 * FT, y: RINK.centerY }, 'home')).toBe('behind the net');
    expect(describeSpot({ x: RINK.blueLineRightX + 4 * FT, y: 40 }, 'home')).toBe('the left point');
    expect(describeSpot({ x: RINK.goalLineRightX - 40 * FT, y: 395 }, 'home')).toBe('the right half-wall');
  });

  it('mirrors for the away team, which attacks the left net', () => {
    expect(describeSpot({ x: RINK.blueLineLeftX - 4 * FT, y: 395 }, 'away')).toBe('the left point');
    expect(describeSpot({ x: RINK.goalLineLeftX + 8 * FT, y: RINK.centerY }, 'home')).toBe('the front of your net');
  });

  it('names the neutral zone', () => {
    expect(describeSpot({ x: RINK.centerX, y: RINK.centerY }, 'home')).toBe('centre ice');
    expect(describeSpot({ x: RINK.blueLineRightX - 5 * FT, y: 20 }, 'home')).toBe('the left wall at the offensive blue line');
  });
});

describe('buildDrillStory over the whole library', () => {
  for (const template of DRILL_TEMPLATES) {
    it(`explains ${template.document.metadata.title}`, () => {
      const drill = projectToV2(template.document).drill;
      const story = buildDrillStory(drill);

      expect(story.durationSeconds).toBeGreaterThan(0);
      expect(story.setup.length).toBeGreaterThan(0);
      expect(story.steps.length).toBeGreaterThan(0);
      // Steps are numbered 1..n and run forward in time.
      story.steps.forEach((step, index) => {
        expect(step.number).toBe(index + 1);
        expect(step.endSeconds).toBeGreaterThan(step.startSeconds);
        if (index > 0) expect(step.startSeconds).toBeGreaterThanOrEqual(story.steps[index - 1].startSeconds);
      });
      // Every player gets a card with at least one job and one cue.
      expect(story.players).toHaveLength(drill.players.length);
      for (const card of story.players) {
        expect(card.duties.length).toBeGreaterThan(0);
        expect(card.cues.length).toBeGreaterThan(0);
        expect(card.duties.every(duty => !/undefined|NaN/.test(duty.text))).toBe(true);
      }
      expect(storyText(story)).not.toMatch(/undefined|NaN/);
    });
  }
});

describe('a passing play', () => {
  const template = DRILL_TEMPLATES.find(item => item.document.puckTracks.some(track => track.actions.some(action => action.type === 'pass')))!;
  const drill = projectToV2(template.document).drill;
  const story = buildDrillStory(drill);

  it('gives the passer and the receiver matching jobs', () => {
    const pass = drill.events.find(event => event.type === 'pass')!;
    if (pass.type !== 'pass') throw new Error('expected a pass');
    const passer = story.players.find(card => card.playerId === pass.fromPlayerId)!;
    const receiver = story.players.find(card => card.playerId === pass.toPlayerId)!;
    const receiverNumber = drill.players.find(player => player.id === pass.toPlayerId)!.number;
    const passerNumber = drill.players.find(player => player.id === pass.fromPlayerId)!.number;
    expect(passer.duties.some(duty => duty.text.startsWith(`Pass to #${receiverNumber}`))).toBe(true);
    expect(receiver.duties.some(duty => duty.text.startsWith(`Receive the pass from #${passerNumber}`))).toBe(true);
    expect(receiver.cues.join(' ')).toMatch(/target/);
  });

  it('finds the step on the ice at any moment', () => {
    const last = story.steps.at(-1)!;
    expect(stepAt(story, 0)).toBe(story.steps[0]);
    expect(stepAt(story, last.startSeconds + 0.01)).toBe(last);
    expect(stepAt(story, story.durationSeconds + 5)).toBe(last);
  });
});

it('prints a readable handout', () => {
  const template = findTemplate(DRILL_TEMPLATES[0].id)!;
  const text = storyText(buildDrillStory(projectToV2(template.document).drill));
  expect(text).toMatch(/SETUP/);
  expect(text).toMatch(/PLAYER JOBS/);
});
