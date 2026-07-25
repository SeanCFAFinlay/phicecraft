// ============================================================================
// DIALOG HOST
//
// Renders whatever the command layer asked the user, and resolves its promise.
// This is the only place `confirm()` and `prompt()` semantics exist, and none
// of it uses the browser's blocking dialogs.
// ============================================================================

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAppServices } from '@/hooks/useAppState';
import { Dialog, DialogPrimaryButton, DialogSecondaryButton } from './a11y/Dialog';
import { describePersistenceError } from '@/persistence';

export function DialogHost() {
  const { dialogs } = useAppServices();
  const pending = useSyncExternalStore(dialogs.subscribe, dialogs.getSnapshot, dialogs.getSnapshot);

  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Seed the field when a prompt opens, keyed so reopening resets it.
  useEffect(() => {
    if (pending?.kind === 'prompt') setText(pending.request.initialValue);
  }, [pending]);

  if (!pending) return null;

  if (pending.kind === 'confirm') {
    const { request } = pending;
    return (
      <Dialog
        key={pending.key}
        open
        variant={request.destructive ? 'alertdialog' : 'dialog'}
        title={request.title}
        description={request.body}
        onClose={() => dialogs.cancel()}
        initialFocusRef={confirmRef}
        footer={
          <>
            <DialogSecondaryButton onClick={() => dialogs.cancel()}>
              {request.cancelLabel}
            </DialogSecondaryButton>
            <DialogPrimaryButton
              buttonRef={confirmRef}
              destructive={request.destructive}
              onClick={() => dialogs.resolve(true)}
            >
              {request.confirmLabel}
            </DialogPrimaryButton>
          </>
        }
      />
    );
  }

  if (pending.kind === 'prompt') {
    const { request } = pending;
    const submit = () => dialogs.resolve(text);
    return (
      <Dialog
        key={pending.key}
        open
        title={request.title}
        onClose={() => dialogs.cancel()}
        initialFocusRef={inputRef}
        footer={
          <>
            <DialogSecondaryButton onClick={() => dialogs.cancel()}>Cancel</DialogSecondaryButton>
            <DialogPrimaryButton onClick={submit}>{request.confirmLabel}</DialogPrimaryButton>
          </>
        }
      >
        <label className="block text-[12px] font-bold uppercase tracking-wide text-white/50">
          {request.label}
          <input
            ref={inputRef}
            type="text"
            value={text}
            maxLength={request.maxLength ?? 60}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
            className="mt-2 w-full rounded-xl border border-app-border bg-white/5 px-3 py-3 text-[15px] font-normal normal-case tracking-normal text-app-text outline-none focus:border-app-cyan"
          />
        </label>
      </Dialog>
    );
  }

  // The blocking export decision. There is deliberately no default: the user
  // has to say whether an unsaved copy is what they want.
  return (
    <Dialog
      key={pending.key}
      open
      variant="alertdialog"
      title="Your latest changes could not be saved"
      description={`${describePersistenceError(
        pending.error
      )} You can still export what is on screen, but the file will contain a revision that is not stored on this device.`}
      dismissible={false}
      onClose={() => dialogs.resolve('cancel')}
      initialFocusRef={confirmRef}
      footer={
        <>
          <DialogSecondaryButton buttonRef={confirmRef} onClick={() => dialogs.resolve('cancel')}>
            Cancel
          </DialogSecondaryButton>
          <DialogPrimaryButton onClick={() => dialogs.resolve('export-anyway')}>
            Export current unsaved data anyway
          </DialogPrimaryButton>
        </>
      }
    />
  );
}
