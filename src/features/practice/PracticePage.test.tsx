import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '@/hooks/useAppState';
import { PracticePage } from './PracticePage';
import { PRESET_PRACTICE_SESSIONS, savePracticeSessions } from '@/domain/practice/practiceStore';

function renderPracticePage() {
  return render(
    <AppProvider autoInitialize={false}>
      <PracticePage isOpen={true} />
    </AppProvider>
  );
}

describe('PracticePage', () => {
  beforeEach(() => {
    localStorage.clear();
    savePracticeSessions(PRESET_PRACTICE_SESSIONS);
  });

  it('renders the Practice Session Planner header and default plan', () => {
    renderPracticePage();

    expect(screen.getByRole('heading', { name: /Practice Session Planner/i })).toBeInTheDocument();
    expect(screen.getByText(/Timeline Schedule/i)).toBeInTheDocument();
    expect(screen.getByText(/Consolidated Equipment Checklist/i)).toBeInTheDocument();
  });

  it('displays the preset practice drill blocks and equipment checklist', () => {
    renderPracticePage();

    expect(screen.getByText(/Four Dot Flow Warm-up/i)).toBeInTheDocument();
    expect(screen.getByText(/Station A: Gates Passing & Stickhandling/i)).toBeInTheDocument();
    expect(screen.getByText(/Print Coaching Sheet \/ PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/Copy Plan Text/i)).toBeInTheDocument();
  });

  it('can adjust block duration with stepper buttons', () => {
    renderPracticePage();

    const decreaseButtons = screen.getAllByRole('button', { name: /Decrease drill duration/i });
    expect(decreaseButtons.length).toBeGreaterThan(0);

    // Initial first block is 10m
    expect(screen.getAllByText('10m').length).toBeGreaterThan(0);
    fireEvent.click(decreaseButtons[0]);
    // 10 - 2 = 8m
    expect(screen.getAllByText('8m').length).toBeGreaterThan(0);
  });

  it('can add a custom block to the practice session', () => {
    renderPracticePage();

    const addCustomBtn = screen.getByRole('button', { name: /\+ Custom Block/i });
    fireEvent.click(addCustomBtn);

    expect(screen.getByText(/Custom Drill \/ Station/i)).toBeInTheDocument();
  });

  it('opens and closes the live practice runner from the header action', () => {
    renderPracticePage();

    const runBtn = screen.getByRole('button', { name: /Run Live Practice/i });
    expect(runBtn).toBeInTheDocument();
    fireEvent.click(runBtn);

    // PracticeRunner renders high-contrast timer and runner UI
    expect(screen.getByText(/Live Session/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exit Runner/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Exit Runner/i }));
    expect(screen.queryByText(/Live Session/i)).not.toBeInTheDocument();
  });

  it('supports toggling inline editing for a block', () => {
    renderPracticePage();

    const editButtons = screen.getAllByRole('button', { name: /^Edit /i });
    expect(editButtons.length).toBeGreaterThan(0);

    fireEvent.click(editButtons[0]);
    expect(screen.getByText(/Block Title/i)).toBeInTheDocument();
    expect(screen.getByText(/Station Split \(ADM\)/i)).toBeInTheDocument();
  });

  it('renders drill picker modal with playbook templates and personal drill tabs', () => {
    renderPracticePage();

    const addDrillBtn = screen.getByRole('button', { name: /\+ Add Drill from Playbook/i });
    fireEvent.click(addDrillBtn);

    expect(screen.getByRole('heading', { name: /Add Drill to Practice/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Playbook Templates/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /My Saved Drills/i })).toBeInTheDocument();
  });
});
