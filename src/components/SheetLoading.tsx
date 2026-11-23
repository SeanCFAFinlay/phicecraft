// ============================================================================
// SHEET LOADING
//
// The library, practice planner, menu and inspectors load on first use. On a
// slow phone that used to be a tap followed by nothing at all for a moment;
// this says the tap landed. One look everywhere a surface is still loading.
// ============================================================================

export function SheetLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[140] flex items-center justify-center">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 rounded-full border border-app-cyan/30 bg-[#071522]/95 px-4 py-2 text-[12.5px] font-bold text-app-text shadow-2xl backdrop-blur-md"
      >
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-full border-2 border-app-cyan/25 border-t-app-cyan motion-safe:animate-spin"
        />
        {label}…
      </div>
    </div>
  );
}
