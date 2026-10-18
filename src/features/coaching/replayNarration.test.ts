import { describe, expect, it } from 'vitest';
import { replayNarration } from './replayNarration';
import { buildDrill, buildPass, buildPlayer, buildSettings, buildShot } from '@/test/builders';
import { EMPTY_FRAME, derivePlaybackFrame, type PlaybackFrame } from '@/playback/playbackFrame';
import { SHOWCASE_PRESET } from '@/engine/showcase';

const players = [buildPlayer({ id: 'a', number: '9', name: 'Alex' }), buildPlayer({ id: 'b', number: '12', name: 'Sam' })];
const pass = buildPass({ id: 'pass', fromPlayerId: 'a', toPlayerId: 'b' });
const shot = buildShot({ id: 'shot', fromPlayerId: 'b' });
const drill = buildDrill({ players, events: [pass, shot] });
const frame = (execution: NonNullable<PlaybackFrame['eventExecutions']>[number]): PlaybackFrame => ({ ...EMPTY_FRAME, eventExecutions: [execution] });

describe('replay narration', () => {
  it('follows actual simulation through a successful catch and an explicitly planned save', () => {
    const roster = SHOWCASE_PRESET.players();
    const demo = buildDrill({ players: roster, initialPuck: SHOWCASE_PRESET.initialPuck, ...SHOWCASE_PRESET.sequence!(roster), settings: buildSettings(SHOWCASE_PRESET.settings) });
    const catchFrame = derivePlaybackFrame(demo, 3.2 / 8, false);
    expect(replayNarration(demo, catchFrame).title).toBe('Receive and support');
    const result = replayNarration(demo, derivePlaybackFrame(demo, 7 / 8, false));
    expect(result.title).toBe('Shot outcome: save');
    expect(result.detail).toContain('Planned save scenario');
  });

  it('distinguishes flight, a caught pass and an actual missed pass using named players', () => {
    const active = replayNarration(drill, frame({ eventId: 'pass', index: 0, status: 'active' }));
    expect(active.title).toBe('Pass in flight');
    expect(active.detail).toContain('#9 Alex → #12 Sam');
    expect(replayNarration(drill, frame({ eventId: 'pass', index: 0, status: 'completed', outcome: 'caught' })).title).toBe('Receive and support');
    expect(replayNarration(drill, frame({ eventId: 'pass', index: 0, status: 'completed', outcome: 'missed' })).title).toBe('Loose puck after the pass');
  });

  it('reports the blocked action and its real reason instead of celebrating the authored outcome', () => {
    const planned = buildDrill({ players, events: [{ ...shot, result: 'goal' }] });
    const result = replayNarration(planned, frame({ eventId: 'shot', index: 0, status: 'blocked', reason: 'The puck is loose or dead at release time.' }));
    expect(result).toEqual({ title: 'Action blocked', detail: 'The puck is loose or dead at release time.' });
    expect(replayNarration(planned, frame({ eventId: 'shot', index: 0, status: 'blocked' })).detail).toContain('Review possession');
  });

  it('shows computed shot outcomes without calling them a planned scenario', () => {
    const result = replayNarration(drill, frame({ eventId: 'shot', index: 1, status: 'completed', outcome: 'rebound' }));
    expect(result.title).toBe('Shot outcome: rebound');
    expect(result.detail).not.toContain('Planned');
    expect(result.detail).toContain('simulation');
  });

  it('does not let a later pending shot hide the current completed pass', () => {
    expect(replayNarration(drill, { ...EMPTY_FRAME, eventExecutions: [
      { eventId: 'pass', index: 0, status: 'completed', outcome: 'caught' },
      { eventId: 'shot', index: 1, status: 'pending' },
    ] }).title).toBe('Receive and support');
  });

  it('does not describe a completed but missed pickup as secured possession', () => {
    const pickup = buildDrill({ players, initialPuck: { x: 845, y: 322.5 }, events: [{
      id: 'pickup', type: 'pickup', fromPlayerId: 'a', team: 'home',
      fromPoint: { x: 845, y: 322.5 }, toPoint: { x: 845, y: 322.5 }, at: 0, arrivalAt: 0.1,
    }] });
    const result = replayNarration(pickup, frame({ eventId: 'pickup', index: 0, status: 'completed', outcome: 'missed' }));
    expect(result.title).not.toBe('Possession secured');
    expect(result.title).toMatch(/loose|missed|recover/i);
  });
});
