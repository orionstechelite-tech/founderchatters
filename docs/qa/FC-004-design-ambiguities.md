# FC-004 Design QA Notes

## QA-004-01 — Mobile marketing footer text overlap

- Source: Marketing Footer · Mobile, Figma node `125:10`
- Observation: the rendered source frame visibly overlaps the primary navigation links, legal/auth links, and version label.
- Contract conflict: Developer Handoff and Build Acceptance require readable mobile content and accessible public/legal destinations.
- Implementation decision: retain the source content, typography, colors, spacing scale, and dark surface within the approved fluid mobile gutters, but place text in normal document flow so links remain readable and operable.
- Design follow-up: confirm the intended vertical spacing/height in Figma when evidence-driven design corrections are next authorized.

## QA-004-02 — Fixed component-set widths versus responsive shells

- Sources: component sets `12:34`, `15:43`, `101:28`, `101:41`, `101:42`, `101:56`; Responsive Completion `135:3` and `137:166`.
- Observation: component-set examples use fixed documentation widths, while the responsive contract requires fluid fields/cards within breakpoint gutters.
- Implementation decision: preserve canonical maximum widths and internal metrics while allowing components to shrink to `100%` of their container. No content or actions are hidden.

