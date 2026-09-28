# FC-004 — Design System + Responsive Application Shells

## Objective

Build the reusable visual and responsive foundation for FounderChatters from the frozen implementation pack and authoritative Figma sources. This task does not implement product feature pages.

## Authoritative Figma sources

- Foundations: `11:63`
- Button documentation/component: `12:6`, `12:34`
- Field documentation/component: `15:5`, `15:43`
- Member component contract/primitives: `101:64`, `101:12`, `101:19`, `101:28`, `101:41`, `101:42`, `101:56`, `101:57`
- Member shell references: `23:7`, `38:2`, `137:166`
- Marketing shell references: `123:12`, `123:21`, `123:62`, `125:10`, `124:2`, `126:207`, `126:366`
- Admin shell references: `74:3`, `100:12`, `137:201`
- Responsive Completion: `135:3`
- Build Acceptance & QA: `113:3`
- Developer Handoff: `40:2`
- MVP Freeze/Coverage: `92:3`

Figma is read-only. Page 31, page 99, and any LEGACY or Do Not Implement frame are excluded.

## Scope

- Figma-mapped color, spacing, radius, and typography tokens
- Button: Small/Medium, Primary/Secondary, Default/Hover/Disabled
- Field: Input/Textarea with Default/Focus/Error/Disabled behavior
- Frozen member primitives needed by the component contract
- Public/marketing, member, and Admin application shells
- Responsive behavior at 1440, 1024, 768, and 390
- Admin unsupported-small-screen state below the approved breakpoint
- Component, accessibility, responsive, build, and visual verification

## Boundaries

- No Auth, Application, Home, Discover, Requests, Messages, Reputation, or Admin business-screen implementation
- No backend/domain/database work
- No deployment or external-infrastructure changes
- No speculative product components or interaction models
- Do not modify Figma
- Do not start the next task

## Acceptance criteria

- Tokens match the inspected Figma variables and typography styles.
- Button and Field primitives implement every frozen variant/state with semantic controls and accessible focus, labels, errors, and disabled behavior.
- Required member primitives compose content without embedding separate CTA actions or follower behavior.
- Public, member, and Admin shells match their canonical sources and responsive contracts.
- Member/public rendering is verified at 1440, 1024, 768, and 390.
- Admin rendering is verified at 1440, 1024, and below 900 using the approved unsupported state.
- Component/unit and applicable accessibility checks pass.
- Formatting, lint, strict TypeScript, tests, production build, and `npm run validate` pass.
- Visual comparison is completed against the authoritative Figma screenshots, with unresolved discrepancies recorded as QA/design issues.

## Development-only verification route

`/fc-004-preview/[view]` is a local development visual-QA harness. It returns Not Found outside `NODE_ENV=development` and is not a production product surface.

