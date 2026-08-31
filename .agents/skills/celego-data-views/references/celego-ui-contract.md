# Celego UI contract for data views

Use this reference before recommending implementation details and re-verify it against the repository. It applies only to the Next.js web surface under `app/**` and `components/**`; exclude `mobile/**`.

## Current foundation

- Next.js App Router with React and TypeScript; protected pages are under `app/(protected)`.
- Prisma models/enums are in `prisma/schema.prisma`; API handlers are under `app/api`.
- Shared UI includes `PageHeader`, `Panel`, `StatusBadge`, and `WorkflowStatusBar`; use `cn` from `lib/utils.ts`.
- Module RBAC is in `lib/acl.ts`; authenticated API routes use `requireApiSession`.
- Existing UI copy is Spanish and may use Dominican locale formatting.

Do not add a design system, state/table/chart/date library, or mobile branch without explicit scope. Preserve existing typography, palette, focus treatment, spacing, and rounded-panel language unless redesign is explicitly requested.

## View preference contract

Authenticated operational view choice must be server-backed and scoped to `(current user, stable section key)`. A section key must remain stable across labels, filters, and view switches. Define each section's allowed view types and default; validate the write on the server and return the default only when no saved preference exists.

- The current user identity must come from the server session, not request input.
- Enforce module and record scope for reading/writing the preference.
- Persist a change until that user changes the same section; never apply it to another section or user.
- Existing `lib/use-persistent-state.ts` is browser `localStorage` and is unsuitable as the sole persistence mechanism for this contract.
- `WorkflowDraft` plus `/api/workflow-drafts` offers authenticated, user-scoped, versioned JSON persistence, but is currently a workflow-draft facility. Do not reuse it for view preferences until lifecycle, payload validation, and section authorization are explicitly confirmed.
- If the model/API does not exist, stop implementation and state the missing persistence prerequisite; do not invent a schema or endpoint.

## Layout and responsive behavior

Start with neighboring `PageHeader` and `Panel` patterns. Keep filters/actions wrap-safe; put wide semantic tables in labeled horizontal scroll containers. Preserve identifier, state, and primary action on narrow screens.

Cards are appropriate for item-by-item browsing, not an automatic narrow-screen replacement for a comparison table. Kanban, calendar, grid, and Gantt need intentional small-screen behavior. Kanban drag/drop needs an equivalent keyboard path using the same authorized transition API.

## Accessibility and data states

Use semantic HTML before ARIA; label every input; preserve focus visibility and keyboard access; never use color alone for state. Announce meaningful async outcomes and manage dialog/error focus.

| State | Minimum behavior |
| --- | --- |
| Loading | Show progress; prevent duplicate destructive submissions. |
| Empty | Separate no records from no filter matches. |
| Error | Keep useful context, show actionable Spanish copy, allow safe retry. |
| Success | Update visible records and selection consistently. |
| Partial failure | Identify failed records/cells; do not report whole-operation success. |

## RBAC, loading, and mutation readiness

UI visibility is not authorization. Check `lib/acl.ts`, then the route's server authorization and record scope. Use server pagination for non-trivial operational volume; keep filters/sorts stable; perform pivot/cohort aggregation on the server within authorized scope.

Before inline edit, stage movement, rescheduling, or cell adjustment, require persistent domain state, authenticated/authorized server mutation, validation, version/conflict or idempotency behavior, feedback/rollback, and focused tests. Preserve audit behavior when the domain records it.

## Validation expectations

Test authorized/unauthorized preference reads and writes, invalid section/view combinations, absent-preference fallback, user/section isolation, loading/error/empty states, and relevant interaction. Run lint, tests, build, and the root Docker workflow after application changes.