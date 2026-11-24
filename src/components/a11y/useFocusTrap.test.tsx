import { describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

function SearchSurface({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  // A fresh Escape handler every render, as most callers pass one.
  const closeRef = useRef<HTMLButtonElement>(null);
  // Initial focus on Close, exactly as Sheet.tsx asks for it.
  const ref = useFocusTrap<HTMLDivElement>({ active: true, onEscape: () => onClose(), initialFocus: closeRef });
  return (
    <div ref={ref}>
      <button ref={closeRef} type="button">Close</button>
      <input aria-label="Search" value={query} onChange={event => setQuery(event.target.value)} />
    </div>
  );
}

describe('useFocusTrap', () => {
  it('keeps focus in a text box while typing re-renders the surface', () => {
    render(<SearchSurface onClose={() => {}} />);
    const input = screen.getByRole('textbox', { name: 'Search' });
    input.focus();
    for (const letter of ['G', 'Gi', 'Giv', 'Give']) {
      fireEvent.change(input, { target: { value: letter } });
      expect(document.activeElement).toBe(input);
    }
    expect((input as HTMLInputElement).value).toBe('Give');
  });

  it('still closes on Escape with the latest handler', () => {
    const onClose = vi.fn();
    render(<SearchSurface onClose={onClose} />);
    const input = screen.getByRole('textbox', { name: 'Search' });
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
