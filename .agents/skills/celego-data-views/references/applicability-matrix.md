# Data-view applicability matrix

Use this reference after the primary user job and repository evidence are known. Select the simplest view whose prerequisites are already present or explicitly in scope.

## Quick decision table

| View | Use when | Required evidence | Reject when | Prefer instead |
| --- | --- | --- | --- | --- |
| List/table | Users scan, compare, filter, select, export, or batch-update records | Stable row identity, useful columns, filter/sort behavior, server pagination for non-trivial volume | The primary task is visual item browsing, scheduling, multi-dimensional analysis, or row-by-period editing | Cards, calendar, pivot, or grid after prerequisites pass |
| Cards | Users browse catalog, inventory, or content items independently | Stable item identity, useful item summary, bounded/server-backed loading, item action contract | Stages, state transitions, cross-item comparison, or batch work is primary | Kanban or list/table |
| Kanban | Users move work through a small ordered stage system | Ordered stage model, valid transition graph, authorized mutation, conflict/error behavior | Cards are only grouped; stages are unordered; movement has no domain effect | Cards or list/table with status grouping |
| Pivot | Users compare aggregated numeric results across dimensions | Numeric measures, meaningful dimensions, server aggregation, defined access scope | Data is row-level only, measures are textual, or aggregation downloads full data | List/table or focused summary/chart |
| Calendar | Users schedule or reschedule time-bound work | Start/end semantics, timezone, scheduling mutation, conflict rules | A date is descriptive, historical, or a filter | Date-filtered list or timeline |
| Timeline/history | Users need chronological context | Ordered events with timestamp, actor/source, type, record relation | Users must plan future activities from a matrix | Activity model or calendar |
| Activity matrix | Users manage typed, assigned, due activities | First-class activity entity, assignee, due state, lifecycle, authorization | Data is audit history, notes, or inferred timestamps | Timeline/history |
| Grid | Users enter/adjust one measure at row-by-period intersections | Row/period dimensions, editable stored measure, transactional API, validation, conflict behavior | Cells are calculated/read-only or cannot be atomic | Pivot or list/table |
| Gantt | Users plan intervals with dependencies/capacity | Start/end, dependencies, resource/capacity, authorized rescheduling, conflict rules | Bars are decorative or dates historical only | Calendar or list/table |
| Cohort | Users measure retention/churn from a stable entry event | Population, immutable start, outcome/exit, interval, server aggregation | Creation-month grouping or ambiguous outcomes | Pivot or time-series summary |

## Cards versus Kanban

Cards are an independent grid. Use them for item-by-item exploration such as products, catalog entries, inventory, or content. Cards may expose imagery, compact facts, and an item action, but have no stages, transition semantics, or drag-and-drop requirement.

Kanban is a workflow board. Every column represents an ordered domain stage, and every move must use an authorized server transition with validation, audit behavior where applicable, conflict handling, feedback, and a keyboard-equivalent interaction. A visual card component never proves Kanban applicability.

## Persistent view preference

For an authenticated operational data view, persist the chosen type by the tuple `(current user, stable section key)`. The section key is a stable product identifier—not a label, route query, or volatile filter—and the server validates the selected type against that section's allowed view set.

- Read only the current user's preference; never accept a client-provided user id.
- Write only after server authentication and module/record authorization.
- Use the defined section default only when no preference exists; retain the selection until the same user changes it.
- Do not let a preference for `operativos` affect cards, reports, other sections, or another user.
- Do not store this authenticated operational preference solely in React state, URL state, cookies, or `localStorage`.
- If no model/API contract exists, report it as a prerequisite. Current `WorkflowDraft` persistence is user-scoped and versioned, but it is a draft mechanism; prove it fits the preference lifecycle before reusing it.

## Evidence tests by view

### List/table

Choose this by default for Celego operational work. Verify row identity, server filters/sorting/pagination, cross-page selection scope, and row-level feedback for edits.

### Cards

Verify the user is browsing individual records rather than comparing many fields or moving workflow state. Keep card density responsive, server-backed for non-trivial volume, and actions available without relying on hover alone. Do not turn cards into Kanban merely because records have a status.

### Kanban

Verify canonical stage identifiers/display order, allowed role-restricted transitions and terminal states, server mutation/audit behavior, concurrent-move handling, and bounded loading. Reject grouping by province, messenger, customer, or status when it has no meaningful transition.

### Pivot, calendar, timeline, activity, grid, Gantt, cohort

Verify the exact evidence listed in the decision table. Keep heavy aggregations server-side; require explicit time semantics for calendar/Gantt; treat audit/contact/status history as timeline unless a future-work entity exists; require atomic persisted cells for grid; reject Gantt/cohort whenever their domain semantics are absent.

## Cross-cutting hard gate

Before complex interactive views, confirm persistence, server authorization, validation, and concurrency. If any is absent, return the prerequisite; do not fill the gap with client-only state.