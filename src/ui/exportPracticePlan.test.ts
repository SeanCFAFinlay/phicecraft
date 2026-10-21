import { describe, it, expect } from 'vitest';
import {
  formatPracticePlanText,
  formatPracticePlanMarkdown,
} from './exportPracticePlan';
import { PRESET_PRACTICE_SESSIONS } from '@/domain/practice/practiceStore';

describe('exportPracticePlan', () => {
  const preset = PRESET_PRACTICE_SESSIONS[0];

  it('formats practice plan into plain text summary with schedule and equipment', () => {
    const text = formatPracticePlanText(preset);

    expect(text).toContain('PHICECRAFT HOCKEY PRACTICE PLAN');
    expect(text).toContain('PRACTICE TIMELINE');
    expect(text).toContain('CONSOLIDATED EQUIPMENT CHECKLIST');
    expect(text).toContain('Four Dot Flow Warm-up');
    expect(text).toContain('CONE');
  });

  it('formats practice plan into structured markdown table with cues and equipment', () => {
    const md = formatPracticePlanMarkdown(preset);

    expect(md).toContain(`# 🏒 ${preset.title}`);
    expect(md).toContain('| Time | Drill / Activity | Area / Split | Dur | Coaching Points |');
    expect(md).toContain('Four Dot Flow Warm-up');
    expect(md).toContain('### 📦 Equipment Checklist');
  });
});
