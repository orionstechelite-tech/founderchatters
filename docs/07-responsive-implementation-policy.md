# 07 — Responsive Implementation Policy

Source of truth: Figma `49 — Responsive Completion`.

## Priority
1. Exact breakpoint frame
2. Approved responsive pattern
3. Behavior matrix
4. Desktop canonical

## Breakpoints
- 1440: canonical desktop
- 1024: supported desktop/tablet
- ~768: topology-change breakpoint
- 390: canonical mobile reference

Do not hard-code only these exact widths.

## Core behavior
- Member navigation: top nav → compact → bottom nav
- Marketing navigation: full → collapsed/menu
- 2 columns become 1 when readability requires
- 3-column card grids become 2 then 1
- Forms become full-width within mobile gutters
- Settings sidebar becomes compact selector/tabs + stacked content
- Discover filters become drawer/sheet on small screens
- Messages split-pane becomes route-based on tablet/mobile
- Mobile confirms/modals use near-full-width dialog or bottom-sheet behavior
- 44px minimum touch targets

## Admin
- 1440 canonical
- 1024 supported
- under ~900px: approved desktop-required state
