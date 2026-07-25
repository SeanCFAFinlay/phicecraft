// ============================================================================
// IMPORT PREVIEW SHEET
//
// Nothing is written until the user has seen exactly what will happen. The
// default for every entry is COPY; replacing a local play requires flipping
// that entry explicitly, and the local drill it would overwrite is named.
// ============================================================================

import { useEffect, useState } from 'react';
import { Sheet } from '../a11y/Sheet';
import { useAppState, useCommands } from '@/hooks/useAppState';
import type { ImportDecision, ImportPreview } from '@/persistence';

export function ImportPreviewSheet({
  preview,
  onClose,
}: {
  preview: ImportPreview | null;
  onClose: () => void;
}) {
  const { state } = useAppState();
  const commands = useCommands();
  const [decisions, setDecisions] = useState<Record<number, 'copy' | 'replace'>>({});
  const [busy, setBusy] = useState(false);

  // Every fresh preview starts as all-copies.
  useEffect(() => {
    setDecisions({});
    setBusy(false);
  }, [preview]);

  const open = state.ui.openSheet === 'import-preview' && preview !== null;
  if (!preview) return null;

  const replacements = preview.candidates.filter(
    candidate => (decisions[candidate.sourceIndex] ?? 'copy') === 'replace'
  ).length;

  const commit = async () => {
    setBusy(true);
    const list: ImportDecision[] = preview.candidates.map(candidate => ({
      sourceIndex: candidate.sourceIndex,
      mode: decisions[candidate.sourceIndex] ?? 'copy',
    }));
    await commands.commitImport(preview, list);
    onClose();
  };

  return (
    <Sheet
      open={open}
      title="Import preview"
      description={`${preview.candidates.length} play(s) read from the file. Nothing has been saved yet.`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="touch-target flex-1 rounded-xl border border-app-border bg-white/5 px-3 py-3 text-[14px] font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void commit()}
            className="touch-target flex-1 rounded-xl bg-app-cyan px-3 py-3 text-[14px] font-bold text-[#03121c] disabled:opacity-50"
          >
            {replacements > 0
              ? `Import (${replacements} replacement${replacements === 1 ? '' : 's'})`
              : 'Import as copies'}
          </button>
        </div>
      }
    >
      <ul className="space-y-2 px-2 py-1">
        {preview.candidates.map(candidate => {
          const mode = decisions[candidate.sourceIndex] ?? 'copy';
          return (
            <li
              key={candidate.sourceIndex}
              className="rounded-xl border border-app-border bg-white/[0.03] p-3"
            >
              <div className="truncate text-[14px] font-bold text-app-text">{candidate.name}</div>
              <div className="mt-0.5 text-[12px] text-white/50">
                {candidate.drill.players.length} players · {candidate.drill.skatePaths.length} routes ·{' '}
                {candidate.drill.events.length} puck actions
              </div>

              {candidate.collidesWith ? (
                <>
                  <p className="mt-2 text-[12px] leading-snug text-amber-200">
                    This file shares an ID with your local play “{candidate.collidesWith.name}”.
                  </p>
                  <div
                    className="mt-2 flex gap-2"
                    role="radiogroup"
                    aria-label={`How to import ${candidate.name}`}
                  >
                    {(['copy', 'replace'] as const).map(option => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={mode === option}
                        onClick={() =>
                          setDecisions(current => ({ ...current, [candidate.sourceIndex]: option }))
                        }
                        className={`touch-target flex-1 rounded-xl border px-2 py-2 text-[12px] font-bold ${
                          mode === option
                            ? option === 'replace'
                              ? 'border-red-400/60 bg-red-500/15 text-red-200'
                              : 'border-app-cyan bg-app-cyan/15 text-app-cyan'
                            : 'border-app-border bg-white/5 text-white/60'
                        }`}
                      >
                        {option === 'copy' ? 'Import as a copy' : 'Replace matching drill'}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[12px] text-white/45">
                  Imported as a new play with fresh IDs.
                </p>
              )}

              {candidate.warnings.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-amber-200/80">
                  {candidate.warnings.slice(0, 3).map(warning => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}

        {preview.failures.length > 0 && (
          <li className="rounded-xl border border-red-400/40 bg-red-500/10 p-3">
            <div className="text-[13px] font-bold text-red-200">
              {preview.failures.length} entr{preview.failures.length === 1 ? 'y' : 'ies'} could not be read
            </div>
            <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-red-200/80">
              {preview.failures.slice(0, 3).map(failure => (
                <li key={`${failure.sourceIndex}-${failure.code}`}>
                  • #{failure.sourceIndex + 1}: {failure.message}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-white/45">
              The original values are kept; you can download them from the menu.
            </p>
          </li>
        )}
      </ul>
    </Sheet>
  );
}
