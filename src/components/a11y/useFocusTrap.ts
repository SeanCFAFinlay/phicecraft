// ============================================================================
// FOCUS TRAP
//
// A small, focused primitive rather than a UI framework. It does exactly four
// things, which is what every dialog and sheet in the app needs:
//
//   1. move focus in when the surface opens, deterministically,
//   2. keep Tab inside it,
//   3. close on Escape,
//   4. return focus to whatever opened it.
//
// The old code used `setTimeout(..., 80)` to focus an input and had no trap at
// all, so Tab walked straight out into the page behind the modal.
// ============================================================================

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    element => element.offsetParent !== null || element === document.activeElement
  );
}

export interface FocusTrapOptions {
  active: boolean;
  onEscape?: () => void;
  /** Selector or ref for the element that should receive focus first. */
  initialFocus?: React.RefObject<HTMLElement>;
  /** Set false for non-modal surfaces where Escape should not close. */
  closeOnEscape?: boolean;
}

export function useFocusTrap<T extends HTMLElement>(options: FocusTrapOptions): React.RefObject<T> {
  const containerRef = useRef<T>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const { active, onEscape, initialFocus, closeOnEscape = true } = options;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Remember the opener so focus can go back exactly where it came from.
    restoreRef.current = document.activeElement as HTMLElement | null;

    // Deterministic initial focus: the requested element, else the first
    // focusable, else the container itself.
    const target =
      initialFocus?.current ??
      focusableWithin(container)[0] ??
      container;
    target.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.stopPropagation();
        event.preventDefault();
        onEscape?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // Restore focus, but only if it is still inside the surface being closed
      // - otherwise the user has already moved on and we would yank them back.
      const restore = restoreRef.current;
      if (restore && document.contains(restore)) {
        restore.focus({ preventScroll: true });
      }
    };
  }, [active, onEscape, initialFocus, closeOnEscape]);

  return containerRef;
}
