// ============================================================================
// DIALOG
//
// The one accessible dialog primitive. Every confirmation, prompt and blocking
// choice in the app uses it, so they cannot drift apart in semantics.
// ============================================================================

import { useId, useRef, type ReactNode } from 'react';
import { useFocusTrap } from './useFocusTrap';

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** `alertdialog` for a destructive or blocking decision. */
  variant?: 'dialog' | 'alertdialog';
  onClose: () => void;
  /** Escape and the backdrop are disabled when a decision is mandatory. */
  dismissible?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  children?: ReactNode;
  footer: ReactNode;
}

export function Dialog({
  open,
  title,
  description,
  variant = 'dialog',
  onClose,
  dismissible = true,
  initialFocusRef,
  children,
  footer,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const fallbackFocus = useRef<HTMLButtonElement>(null);

  const containerRef = useFocusTrap<HTMLDivElement>({
    active: open,
    onEscape: onClose,
    closeOnEscape: dismissible,
    initialFocus: initialFocusRef ?? (children ? undefined : fallbackFocus),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onPointerDown={event => {
        if (!dismissible) return;
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role={variant}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="sheet-enter safe-bottom max-h-[86dvh] w-full overflow-y-auto rounded-t-2xl border border-app-border bg-app-surface p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <h2 id={titleId} className="text-base font-black text-app-text">
          {title}
        </h2>

        {description && (
          <p id={descriptionId} className="mt-2 text-[13px] leading-relaxed text-white/70">
            {description}
          </p>
        )}

        {children && <div className="mt-4">{children}</div>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Buttons, so every dialog's actions look and behave the same.
// ----------------------------------------------------------------------------

const BASE_BUTTON =
  'touch-target flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-colors sm:flex-none sm:px-5';

export function DialogPrimaryButton({
  children,
  onClick,
  destructive,
  buttonRef,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={`${BASE_BUTTON} ${
        destructive
          ? 'bg-red-500 text-white hover:bg-red-400'
          : 'bg-app-cyan text-[#03121c] hover:bg-cyan-300'
      }`}
    >
      {children}
    </button>
  );
}

export function DialogSecondaryButton({
  children,
  onClick,
  buttonRef,
}: {
  children: ReactNode;
  onClick: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={`${BASE_BUTTON} border border-app-border bg-white/5 text-app-text hover:bg-white/10`}
    >
      {children}
    </button>
  );
}
