import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '@/hooks/useAppState';
import { IntelligencePanel } from './IntelligencePanel';
import { IntelligenceBadge } from './IntelligenceBadge';

describe('Coaching Intelligence UI', () => {
  it('renders the IntelligenceBadge pill', () => {
    render(
      <AppProvider autoInitialize={false}>
        <IntelligenceBadge />
      </AppProvider>
    );

    // Badge should render with coach intelligence status
    const button = screen.getByRole('button', { name: /toggle coaching intelligence/i });
    expect(button).toBeInTheDocument();
  });

  it('renders the IntelligencePanel drawer when open', () => {
    render(
      <AppProvider autoInitialize={false}>
        <IntelligencePanel isOpen={true} onClose={() => {}} />
      </AppProvider>
    );

    expect(screen.getByText(/COACHING INTELLIGENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/Tactical verification & pass synchronization/i)).toBeInTheDocument();
    expect(screen.getByText(/Drill Health/i)).toBeInTheDocument();
  });

  it('supports closing the intelligence panel', () => {
    let closed = false;
    render(
      <AppProvider autoInitialize={false}>
        <IntelligencePanel isOpen={true} onClose={() => { closed = true; }} />
      </AppProvider>
    );

    const closeBtn = screen.getByRole('button', { name: /close intelligence panel/i });
    fireEvent.click(closeBtn);
    expect(closed).toBe(true);
  });
});
