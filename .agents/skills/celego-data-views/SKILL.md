---
name: celego-data-views
description: "Trigger: Celego Next.js web data-view design or implementation; list/table, cards, kanban, pivot, calendar, timeline, grid, Gantt, cohort."
license: UNLICENSED
metadata:
  author: darkenmax06
  version: "1.1"
---

## Activation Contract

Use for Celego operational or analytical collection views under `app/**` and `components/**`. Exclude login, informational pages, simple forms, visual-only edits, generic React work, and `mobile/**`.

## Hard Rules

- Diagnose before coding; implement only when explicitly asked to build or change the view.
- Verify user job, volume, model, API, permissions, current screen, validation, concurrency, and preference contract. Mark missing capability as a prerequisite; never invent it.
- Persist an authenticated user's selected view per stable section key. Validate that the selected view is allowed for that section; read and write only the current user's preference server-side. Use the section default only when no preference exists. Do not use client-only or local-storage persistence for an operational preference.
- Treat cards as independent browse-oriented items; treat kanban as an ordered workflow with authorized transitions. Do not equate a card layout with a kanban board.
- Scope changes to `app/**` and `components/**`; inspect backend evidence but change it only with explicit scope. Keep artifacts English and existing UI copy Spanish.

## Decision Gates

| Evidence | Decision |
| --- | --- |
| Lookup, comparison, filters, selection, batch work | Default to list/table |
| Browse catalog, inventory, or content item-by-item | Cards; no stages or drag/drop |
| Ordered visible stages and authorized state transitions | Kanban; grouped cards alone fail |
| Numeric measures, dimensions, server aggregation | Pivot |
| Scheduling/rescheduling is primary | Calendar; a date alone fails |
| Historical events only | Timeline; activity matrix needs a real activity model |
| Row, period, editable stored measure, transaction | Grid |
| Intervals/dependencies/capacity or cohort semantics | Gantt/cohort only when every prerequisite exists |

## Execution Steps

1. Identify primary decision/action, audience, allowed views, stable section key, and section default.
2. Inspect the screen/UI, linked Prisma/API contracts, authorization, tests, volume, transitions, time semantics, and measures.
3. Confirm a server-backed, user-scoped preference read/write contract with allowed view validation and fallback-on-absence only. `WorkflowDraft` may be evidence, not a substitute, until its payload and lifecycle fit this preference.
4. Read [the applicability matrix](references/applicability-matrix.md) and [the Celego UI contract](references/celego-ui-contract.md). Read [the Odoo mapping](references/odoo-concept-mapping.md) only for Odoo evidence.
5. Select the simplest valid view. With insufficient evidence, retain the current/default list and name prerequisites. On explicit authorization, make the smallest web change and validate it.

## Output Contract

Return: **Recommendation**; **Evidence** (verified vs assumptions); **Rejected alternatives**; **Preference contract** (section key, allowed types, default, authorization, status); **Missing prerequisites**; **Next step**.

## References

- [Applicability matrix](references/applicability-matrix.md) — selection, fallback, and preference rules.
- [Celego UI contract](references/celego-ui-contract.md) — UI, RBAC, persistence, and mutation rules.
- [Odoo concept mapping](references/odoo-concept-mapping.md) — safe conceptual translation without Odoo implementation.