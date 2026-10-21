import { describe, it, expect, vi } from 'vitest';
import {
  formatPracticePlanText,
  formatPracticePlanMarkdown,
  copyPracticePlanText,
  copyPracticePlanMarkdown,
  exportPracticePlanJson,
  printPracticePlan,
} from './exportPracticePlan';
import { PRESET_PRACTICE_SESSIONS } from '@/domain/practice/practiceStore';
import * as downloadModule from './download';

describe('exportPracticePlan', () => {
  const session = PRESET_PRACTICE_SESSIONS[0];

  it('formats practice plan into comprehensive structured text', () => {
    const text = formatPracticePlanText(session);

    expect(text).toContain('PHICECRAFT HOCKEY PRACTICE PLAN');
    expect(text).toContain('--- PRACTICE TIMELINE ---');
    expect(text).toContain('00:00 - 10:00');
    expect(text).toContain('Four Dot Flow Warm-up');
    expect(text).toContain('--- CONSOLIDATED EQUIPMENT CHECKLIST ---');
    expect(text).toContain('PUCKS');
    expect(text).toContain('CONE');
    expect(text).toContain('TRAIN · PLAY · IMPROVE');
  });

  it('formats practice plan into clean markdown table and sections', () => {
    const md = formatPracticePlanMarkdown(session);
    expect(md).toContain('# 🏒');
    expect(md).toContain('| Time | Drill / Activity | Area / Split | Dur | Coaching Points |');
    expect(md).toContain('### 📦 Equipment Checklist');
  });

  it('copies practice plan markdown to clipboard using navigator.clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const result = await copyPracticePlanMarkdown(session);
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('# 🏒'));
  });

  it('copies practice plan text to clipboard using navigator.clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const result = await copyPracticePlanText(session);
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('PHICECRAFT HOCKEY PRACTICE PLAN'));
  });

  it('exports practice plan JSON using downloadText', () => {
    const downloadSpy = vi.spyOn(downloadModule, 'downloadText').mockImplementation(() => true);

    exportPracticePlanJson(session);
    expect(downloadSpy).toHaveBeenCalledWith(
      expect.stringContaining('.json'),
      expect.stringContaining(session.title),
      'application/json'
    );
  });

  it('opens print window when printPracticePlan is called', () => {
    const writeMock = vi.fn();
    const openMock = vi.fn().mockReturnValue({
      document: {
        open: vi.fn(),
        write: writeMock,
        close: vi.fn(),
      },
    });
    vi.stubGlobal('open', openMock);

    printPracticePlan(session);
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('PRACTICE PLAN'));
    expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('Required Equipment Checklist'));
  });
});
