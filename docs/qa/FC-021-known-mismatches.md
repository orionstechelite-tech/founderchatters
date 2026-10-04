# FC-021 known mismatches

These are Figma / copy differences against already-frozen implementation contracts. FC-021 does not change product behavior to resolve them.

## Appeal adjudication

- Figma Build Acceptance node `113:416` says an appeal can uphold or reverse a moderation decision.
- FC-019 froze appeal adjudication / reversing moderation as **deferred / non-goal**.
- FC-021 follows the frozen implementation contract. No appeal-adjudication UI, API, or Admin capability was added.
- This is a documented design/acceptance mismatch for future product review. It does not block FC-021.

## Signup “Full name”

- Figma Create Account frame `136:22` shows a Full name field.
- The frozen `SignupRequest` contract is email + password only. Display name is collected during onboarding.
- `/signup` implements the frozen API contract and does not invent a name field.

## Admin Support screen title

- The implemented Admin support screen title is “Support & Appeals”.
- Appeal adjudication remains deferred. The screen is support-case operations only.
- No appeal workflow was added to match the title wording.
