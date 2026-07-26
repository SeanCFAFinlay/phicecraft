// ============================================================================
// ICONS
//
// A first-party SVG set, drawn on one 24x24 grid with one stroke weight.
//
// The product used emoji as its primary controls - a raised hand for Select, a
// hockey stick for Action, a net for Shoot. Emoji are not an icon system:
// every operating system draws them differently, so the optical weight,
// baseline and colour of the toolbar changed depending on the device a coach
// happened to own, and none of them could inherit the interface's own colour.
//
// These are stroked paths that take `currentColor`, so a control's active,
// disabled and hover states apply to its icon as well as its label.
// ============================================================================

import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Icon({ size = 20, ...props }: IconProps & { children?: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative: every control that uses one also carries a text label or
      // an aria-label, so announcing the icon as well would be noise.
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

/** Select and move: a cursor over a target. */
export function MoveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v18M3 12h18" opacity="0.45" />
      <path d="M12 3l-2.6 2.9M12 3l2.6 2.9M12 21l-2.6-2.9M12 21l2.6-2.9" />
      <path d="M3 12l2.9-2.6M3 12l2.9 2.6M21 12l-2.9-2.6M21 12l-2.9 2.6" />
    </Icon>
  );
}

/** A pass: the puck leaving a stick toward a target. */
export function PassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17c4.5 0 6.5-9 11-9" />
      <path d="M18 5.4l2.6 2.6-2.6 2.6" />
      <circle cx="4" cy="17" r="1.6" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** A skating route: a curved path with direction. */
export function SkateIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 18c3.4 0 3.4-12 6.8-12S13.2 18 16.6 18" />
      <path d="M17 15l3 3-3 3" transform="translate(0,-3)" />
    </Icon>
  );
}

/** A shot on goal: the puck into a net. */
export function ShootIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 5h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-5" />
      <path d="M14 5v14" opacity="0.5" />
      <path d="M3 12h7" />
      <path d="M8 9.4l2.6 2.6L8 14.6" />
    </Icon>
  );
}

/** Add something to the ice. */
export function AddIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" />
    </Icon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" />
    </Icon>
  );
}

/** A skater token, for the Add sheet. */
export function SkaterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M6.5 20c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6" />
    </Icon>
  );
}

/** A goalie: a skater with pads. */
export function GoalieIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="6.6" r="3" />
      <path d="M7 20v-6.2a5 5 0 0 1 10 0V20" />
      <path d="M4.6 12.5v6M19.4 12.5v6" />
    </Icon>
  );
}

/** A coach: a figure with a clipboard. */
export function CoachIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="6.4" r="2.8" />
      <path d="M4.8 20c0-3.3 2.3-5.6 5.2-5.6 1 0 1.9.3 2.7.8" />
      <rect x="14.5" y="11.5" width="6" height="8" rx="1" />
      <path d="M16.3 14.4h2.4M16.3 16.7h2.4" opacity="0.6" />
    </Icon>
  );
}

/** A puck. */
export function PuckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="12" rx="7" ry="4" fill="currentColor" stroke="none" opacity="0.9" />
    </Icon>
  );
}

/** Remove. */
export function DeleteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7" />
      <path d="M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </Icon>
  );
}

// ----------------------------------------------------------------------------
// Menu and secondary actions
//
// The same grid and weight as the primary set. A half-migrated toolbar - some
// controls drawn, some rendered by the operating system's emoji font - is the
// visual drift this set exists to end, so the sheets use it too.
// ----------------------------------------------------------------------------

export function SaveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 4v5h7V4" />
      <rect x="8" y="13" width="8" height="7" rx="1" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8.5" y="3.5" width="12" height="14" rx="1.6" />
      <path d="M15.5 20.5h-11a1 1 0 0 1-1-1v-13" />
    </Icon>
  );
}

export function RenameIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M14.5 5.5l4 4" />
    </Icon>
  );
}

export function NewDrillIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M12 9v6M9 12h6" />
    </Icon>
  );
}

export function SwapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9h13l-3-3M20 15H7l3 3" />
    </Icon>
  );
}

export function DrillIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M12 6v12" opacity="0.6" />
      <circle cx="12" cy="12" r="2.4" opacity="0.6" />
    </Icon>
  );
}

export function ExportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v11" />
      <path d="M8.4 10.6L12 14.2l3.6-3.6" />
      <path d="M4.5 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
    </Icon>
  );
}

export function ImportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 14.2V3.2" />
      <path d="M8.4 6.8L12 3.2l3.6 3.6" />
      <path d="M4.5 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
    </Icon>
  );
}

export function RecoveryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5l7 3v5.2c0 4.2-2.9 7.6-7 8.8-4.1-1.2-7-4.6-7-8.8V6.5z" />
      <path d="M9.2 12.2l2 2 3.6-3.9" />
    </Icon>
  );
}

export function FitIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
    </Icon>
  );
}

export function ZoneRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M14 6v12" />
      <path d="M17 10.5h2.6M17 13.5h2.6" opacity="0.55" />
    </Icon>
  );
}

export function ZoneLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M10 6v12" />
      <path d="M4.4 10.5H7M4.4 13.5H7" opacity="0.55" />
    </Icon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.7 9.6a2.4 2.4 0 1 1 3.2 2.3c-.6.2-.9.8-.9 1.4v.4" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9h9.5a5 5 0 0 1 0 10H8" />
      <path d="M7.2 5.6L3.8 9l3.4 3.4" />
    </Icon>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 9h-9.5a5 5 0 0 0 0 10H16" />
      <path d="M16.8 5.6L20.2 9l-3.4 3.4" />
    </Icon>
  );
}

export function ResetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4" />
      <path d="M19.8 4.5v4.2h-4.2" />
    </Icon>
  );
}

export function MagnetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 4v7a6 6 0 0 0 12 0V4" />
      <path d="M6 10.5h4.5M13.5 10.5H18" />
    </Icon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20V4" opacity="0.6" />
      <path d="M4 20h16" opacity="0.6" />
      <path d="M8 17V12M12 17V7M16 17v-7" />
    </Icon>
  );
}
