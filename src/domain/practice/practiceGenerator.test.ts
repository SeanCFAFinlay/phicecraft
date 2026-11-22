import { describe, expect, it } from 'vitest';
import type { AgeBand } from '@/domain/v3/types';
import { calculatePracticeMetrics, createBlankPracticeSession, createBlockFromTemplate } from './practiceStore';
import { generatePractice, parsePracticeRequest, SYSTEM_CATEGORIES, type PracticeRequest } from './practiceGenerator';
import { assessPractice, guessAgeBand } from './ageCheck';
import { practiceSessionSchema } from './schema';
import { DRILL_TEMPLATES } from '@/data/templates/registry';

const base: PracticeRequest = { minutes: 60, ageBand: 'u13', focus: [], goalies: 1, skaters: 15 };

describe('parsePracticeRequest', () => {
  it('reads minutes, age, focus, goalies and skaters from plain language', () => {
    const request = parsePracticeRequest('45 minutes, U11, work on breakouts and passing, no goalies, 12 skaters', base);
    expect(request.minutes).toBe(45);
    expect(request.ageBand).toBe('u11');
    expect(request.focus).toEqual(expect.arrayContaining(['breakout', 'passing']));
    expect(request.goalies).toBe(0);
    expect(request.skaters).toBe(12);
  });

  it('understands hours, PP and adult', () => {
    const request = parsePracticeRequest('1 hour adult practice on the PP with two goalies', base);
    expect(request.minutes).toBe(60);
    expect(request.ageBand).toBe('adult');
    expect(request.focus).toContain('power-play');
    expect(request.goalies).toBe(2);
    expect(request.focus).not.toContain('goalie');
  });

  it('reads goalie work as a focus only when it is asked for', () => {
    expect(parsePracticeRequest('U13 goalie tracking and shooting', base).focus).toEqual(expect.arrayContaining(['goalie', 'shooting']));
    expect(parsePracticeRequest('U13 shooting, 1 goalie', base).focus).toEqual(['shooting']);
  });

  it('keeps defaults for whatever it cannot find', () => {
    expect(parsePracticeRequest('make it fun', base)).toEqual(base);
  });
});

describe('generatePractice', () => {
  const ages: AgeBand[] = ['u7', 'u9', 'u11', 'u13', 'u15', 'u18', 'adult'];
  for (const ageBand of ages) {
    for (const minutes of [45, 60, 90]) {
      it(`fills ${minutes} minutes exactly for ${ageBand}`, () => {
        const session = generatePractice({ ...base, ageBand, minutes });
        expect(calculatePracticeMetrics(session).totalMinutes).toBe(minutes);
        expect(session.ageBand).toBe(ageBand);
        expect(practiceSessionSchema.safeParse(session).success).toBe(true);
        // No drill twice.
        const ids = session.blocks.map(block => block.drillId).filter(Boolean);
        expect(new Set(ids).size).toBe(ids.length);
        // Every library drill chosen suits the age.
        for (const block of session.blocks) {
          if (block.pinnedRevision) expect(block.pinnedRevision.metadata.ageBands).toContain(ageBand);
        }
      });
    }
  }

  it('builds U9 skill work as rotating stations and leaves out team systems', () => {
    const session = generatePractice({ ...base, ageBand: 'u9', focus: ['power-play', 'passing'] });
    expect(session.blocks.filter(block => block.stationSplit && block.stationSplit !== 'full')).toHaveLength(3);
    for (const block of session.blocks) {
      const categories = block.pinnedRevision?.metadata.categories ?? [];
      expect(categories.some(category => ['power-play', 'penalty-kill', 'forecheck'].includes(category))).toBe(false);
    }
  });

  it('uses the asked-for focus for older players', () => {
    const session = generatePractice({ ...base, ageBand: 'u15', focus: ['power-play'] });
    const categories = session.blocks.flatMap(block => block.pinnedRevision?.metadata.categories ?? []);
    expect(categories).toContain('power-play');
  });

  it('respects a practice with no goalie', () => {
    const session = generatePractice({ ...base, goalies: 0 });
    for (const block of session.blocks) {
      if (block.pinnedRevision) expect(block.pinnedRevision.metadata.goalieCount).toBe(0);
    }
  });

  it('is deterministic', () => {
    const a = generatePractice(base).blocks.map(block => block.drillId);
    const b = generatePractice(base).blocks.map(block => block.drillId);
    expect(a).toEqual(b);
  });

  it('generates plans its own age check has no complaints about', () => {
    for (const ageBand of ['u7', 'u9', 'u11', 'u13', 'u15', 'u18'] as AgeBand[]) {
      for (const focus of [[], ['skating'], ['passing', 'shooting'], ['breakout']] as PracticeRequest['focus'][]) {
        const report = assessPractice(generatePractice({ ...base, ageBand, focus }), ageBand, 15);
        const problems = report.findings.filter(finding => finding.level !== 'good');
        expect(problems, `${ageBand} ${focus.join('+')}: ${JSON.stringify(problems)}`).toEqual([]);
      }
    }
  });
});

describe('assessPractice', () => {
  const systems = DRILL_TEMPLATES.filter(template =>
    template.document.metadata.categories.some(category => SYSTEM_CATEGORIES.includes(category)) &&
    template.document.metadata.rinkArea !== 'quarter'
  );

  it('flags team systems and long full-ice drills for U9', () => {
    const session = createBlankPracticeSession(30);
    session.blocks = systems.slice(0, 2).map(template => createBlockFromTemplate(template, 15));
    const report = assessPractice(session, 'u9', 15);
    expect(report.findings.some(finding => finding.level === 'issue' && /systems/.test(finding.title))).toBe(true);
    expect(report.findings.some(finding => /longer than 10 min/.test(finding.title))).toBe(true);
    expect(report.findings.some(finding => /warm-up/.test(finding.title))).toBe(true);
    expect(report.grade).toBe('Needs work');
  });

  it('says there is nothing to check in an empty plan', () => {
    const report = assessPractice(createBlankPracticeSession(60), 'u11');
    expect(report.score).toBe(0);
    expect(report.findings[0].title).toMatch(/No drills/);
  });

  it('guesses the age from the team name', () => {
    expect(guessAgeBand({ ...createBlankPracticeSession(), team: 'U11 Blue' })).toBe('u11');
    expect(guessAgeBand({ ...createBlankPracticeSession(), team: 'Senior A' })).toBe('adult');
    expect(guessAgeBand({ ...createBlankPracticeSession(), team: 'Team', ageBand: 'u7' })).toBe('u7');
  });
});

describe('practice schema', () => {
  it('accepts quarter- and third-ice drill blocks (imports used to reject them)', () => {
    const quarter = DRILL_TEMPLATES.find(template => template.document.metadata.rinkArea === 'quarter')!;
    const session = createBlankPracticeSession(30);
    session.blocks = [createBlockFromTemplate(quarter)];
    expect(practiceSessionSchema.safeParse(session).success).toBe(true);
  });
});
