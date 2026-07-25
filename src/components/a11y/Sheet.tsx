// ============================================================================
// SHEET
//
// The responsive disclosure surface: a bottom sheet on a portrait phone, a
// width-limited side sheet everywhere else. Used for the menu, the inspectors,
// expanded playback, help, and the import preview.
//
// It never covers the centre or lower-middle of the rink during normal
// editing, it scrolls internally, and it is dismissible by Escape, by a
// close button, and by dragging it down on touch.
// ============================================================================

import { useId, useRef, useState, type ReactNode } from 'react';
import { useFocusTrap } from './useFocusTrap';
import { useResponsive } from '@/ui/useResponsive';

export interface SheetProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  /** Left-hand side sheet, for the main menu. Default is right. */
  side?: 'left' | 'right';
  children: ReactNode;
  /** Rendered pinned at the bottom, outside the scrolling area. */
  footer?: ReactNode;
}

/** Vertical drag past this many pixels dismisses a bottom sheet. */
const DISMISS_DISTANCE = 80;

export function Sheet({ open, title, description, onClose, side = 'right', children, footer }: SheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const { isPhone, isLandscape } = useResponsive();
  const closeRef = useRef<HTMLButtonElement>(null);

  const containerRef = useFocusTrap<HTMLDivElement>({
    active: open,
    onEscape: onClose,
    initialFocus: closeRef,
  });

  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef<number | null>(null);

  // A portrait phone gets a bottom sheet; anything wider gets a side sheet, so
  // the rink keeps its full height.
  const asBottomSheet = isPhone && !isLandscape;

  if (!open) return null;

  const panelClass = asBottomSheet
    ? 'sheet-enter safe-bottom absolute inset-x-0 bottom-0 max-h-[var(--sheet-max-height)] rounded-t-2xl border-t'
    : `sheet-enter safe-top safe-bottom absolute inset-y-0 ${
        side === 'left' ? 'left-0 border-r' : 'right-0 border-l'
      } w-[min(360px,88vw)] max-h-full`;

  return (
    <div className="fixed inset-0 z-[120]">
      <div
        className="absolute inset-0 bg-black/55"
        onPointerDown={onClose}
        aria-hidden="true"
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        style={dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined}
        className={`${panelClass} safe-x flex flex-col border-app-border bg-[rgba(5,14,24,0.98)] shadow-2xl`}
      >
        {asBottomSheet && (
          <div
            className="flex justify-center pt-2 pb-1"
            onPointerDown={event => {
              dragStart.current = event.clientY;
            }}
            onPointerMove={event => {
              if (dragStart.current === null) return;
              setDragOffset(Math.max(0, event.clientY - dragStart.current));
            }}
            onPointerUp={() => {
              if (dragOffset > DISMISS_DISTANCE) onClose();
              dragStart.current = null;
              setDragOffset(0);
            }}
            onPointerCancel={() => {
              dragStart.current = null;
              setDragOffset(0);
            }}
          >
            <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />
          </div>
        )}

        <div className="app-chrome flex items-center gap-2 border-b border-app-border px-4 py-3">
          <h2 id={titleId} className="flex-1 truncate text-[15px] font-black text-app-text">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="touch-target flex items-center justify-center rounded-xl border border-app-border bg-white/5 px-3 text-sm text-app-text hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {description && (
          <p id={descriptionId} className="selectable px-4 pt-3 text-[13px] leading-relaxed text-white/60">
            {description}
          </p>
        )}

        {/*
          tabIndex on the scroll container: a region that scrolls but cannot be
          focused is unreachable for a keyboard user who has no other way to
          scroll it (axe: scrollable-region-focusable).
        */}
        <div
          tabIndex={0}
          className="sheet-scroll sheet-content min-h-0 flex-1 overflow-y-auto px-1 py-2 focus-visible:outline-none"
        >
          {children}
        </div>

        {footer && <div className="border-t border-app-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
