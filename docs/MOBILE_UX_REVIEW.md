# Mobile UX and Effectiveness Review

Date: 2026-09-21

## Scope

Reviewed the PhiceCraft React/Vite app for ease of use, drill-authoring effectiveness, and mobile layout quality. Evidence came from source inspection plus live Playwright viewport checks at 390x844, 360x740, 667x390, and 1366x768.

## Confirmed strengths

- Mobile-first shell with safe-area padding and no disabled browser zoom.
- Primary touch targets meet the 44px minimum across tested phone sizes.
- Bottom dock keeps the core authoring verbs close to the thumb: Move, Pass, Skate, Add, Play.
- Sheets and inspectors avoid cramped desktop sidebars on phones.
- Rink rendering remains clear in portrait and compact landscape.

## Changes applied in this review

1. Reduced mobile rink clutter in 2D by hiding the disabled spin-left and spin-right controls until the user enters 3D mode.
2. Improved first-run hint readability on narrow phones by allowing the guidance text to wrap instead of truncating.
3. Capped and centered desktop dock buttons so desktop does not inherit huge phone-style full-width buttons.
4. Removed duplicate compact save-status screen-reader text so assistive tech does not announce `Saved` twice.

## Prioritized remaining recommendations

### P0: Keep guidance from covering the work surface

The first-run hint is useful, but it still floats over the rink. It should become one of:

- a compact top instructional strip integrated below the app bar,
- a bottom sheet-style teaching card that can be advanced or dismissed,
- or a dock-adjacent hint tied to the disabled action it explains.

Success check: at 360px portrait and 667px landscape, the hint should not cover active players near center ice.

### P0: Collapse secondary view controls on phones

The right rail still contains multiple view operations. After hiding disabled spin controls, the 2D rail is better, but the long-term phone pattern should be a single **View** button that opens 3D, rotate, full-zone, and fit actions in a sheet or popover.

Success check: phone portrait should show no more than two floating view buttons over the rink in 2D.

### P1: Make disabled actions self-explaining

The Skate button is disabled until a player is selected, but the reason is only exposed through a title/ARIA path. Add visible microcopy such as `Select player first` in the context tray or change the disabled label temporarily.

Success check: a new user can understand why Skate cannot be tapped without opening help.

### P1: Add mobile validation access

Validation appears desktop-only. Mobile should show an `Issues` chip when playback or save is blocked.

Success check: on a phone, validation-blocked flows show the issue count and a sheet with fix steps.

### P1: Improve top-bar clarity

The phone top bar is compact but icon-heavy. Consider moving Undo into More when no undo is available, and make save state readable through a short toast after save or a `Saved` row in More.

Success check: at 320px width, play name remains readable and no inactive/low-value icon competes with primary actions.

### P2: Menu information architecture

The main menu mixes play operations, guide, and jerseys. Use stronger grouping:

- This play
- Guide
- Teams and jerseys
- Import/export
- Settings

Success check: first-time users can find rename, save-as, and guide without scanning unrelated jersey controls.

## Recommended mobile layout target

- Top bar: Menu, play name, concise save indicator, More.
- Rink: avoid persistent overlays except one compact View entry point.
- Context strip: selected player or puck state plus one next-best action.
- Bottom dock: Move, Pass, Skate, Add, Play.
- Sheets: secondary controls, help, validation, jerseys, settings, import/export.

## Validation notes

- Tested DOM control sizing via Playwright: primary phone controls remained at least 44px tall/wide before and after the code changes.
- Ran automated unit/type validation after edits.
