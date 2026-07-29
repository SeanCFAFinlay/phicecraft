// ============================================================================
// PREVIEW BAR
//
// Replaces the tool dock and transport in Preview mode. Preview is read-only:
// nothing here arms an edit, so the bar offers exactly what watching a drill
// needs - play it back, change its speed, and see in plain language what
// keeps it from validating clean.
// ============================================================================

import { useDrillValidation } from '@/editor/useDrillValidation';
import { Transport } from './Transport';
import { SpeedControl } from './SpeedControl';

export function PreviewBar() {
  const issues = useDrillValidation();

  return (
    <div
      role="region"
      aria-label="Preview"
      className="app-chrome safe-bottom safe-x flex flex-shrink-0 flex-col gap-2 bg-[#0c1825] px-2 pb-2 pt-1.5"
    >
      <Transport showExpand={false} />

      <div className="px-1">
        <SpeedControl />
      </div>

      <div role="status" className="px-1 text-[12px] leading-snug text-white/70">
        {issues.length === 0 ? (
          <p>This drill has no validation issues.</p>
        ) : (
          issues.map((issue, index) => <p key={`${issue.message}-${index}`}>{issue.message}</p>)
        )}
      </div>
    </div>
  );
}
