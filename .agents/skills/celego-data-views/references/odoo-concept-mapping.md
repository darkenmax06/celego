# Mapping Odoo view concepts to Celego

The supplied Odoo Views Explorer is conceptual evidence, not a technical specification. Celego uses Next.js, React, TypeScript, Prisma, and HTTP APIs: translate the user job, never copy Odoo XML, QWeb, Python mixins, Enterprise labels, or licensing assumptions.

## Translation table

| Odoo concept | Reusable intent | Celego translation | Do not copy |
| --- | --- | --- | --- |
| `<list>` / `<tree>` | Tabular scan, comparison, inline/bulk operations | Semantic React table, server filters/pagination, explicit mutations | XML attributes and decorations |
| Product card layout | Browse independent catalog/inventory items | React card grid with server-backed loading and item actions | Calling it Kanban, stage columns, or drag behavior |
| `<kanban default_group_by>` | Work grouped by actionable stages | Ordered React columns/cards backed by authorized transitions | QWeb, `kanban-box`, or group-by as proof |
| `<pivot>` | Multidimensional aggregation | Server aggregation plus React analytical table/chart | Client-side full-dataset aggregation |
| `<calendar>` | Scheduling time-bound records | Explicit interval/timezone/conflict model and scheduling API | Calendar attributes or assuming any date qualifies |
| `<activity>` | Follow-up work across records | First-class activity domain; otherwise timeline | Python mixins and mail/thread behavior |
| `<grid>` | Row-by-period entry | Stored measure and transactional adjustment endpoint | Object methods/XML ranges/client-only cells |
| `<gantt>` / `<cohort>` | Planning or retention analysis | Domain-backed prerequisites and explicit rendering approach | Enterprise widgets or implicit date meanings |
| `default_group_by` | Initial grouping | Bounded server/UI grouping | Unbounded client grouping |

## Interpretation rules

1. Treat required fields as clues, not field-creation instructions.
2. Verify equivalent semantics in Prisma, APIs, and business logic before implementation.
3. A product/catalog card grid is **Cards**, not Kanban: it has no ordered stages or transition semantics.
4. Kanban needs authorized server transitions; an Odoo visual card or grouped field is insufficient.
5. Odoo may retain a user's selected view; Celego must separately prove a server-backed per-user, per-stable-section preference contract. Do not use Odoo behavior as evidence that Celego already supports it.
6. If Celego lacks domain behavior or persistence, reject the view and state the prerequisite.

## Safe examples

- Odoo product cards map to a Celego cards grid when users browse items independently; they do not justify drag/drop.
- Odoo Kanban implies an ordered workflow only when Celego verifies stage order, transitions, authorization, and conflict behavior.
- Odoo `multi_edit`, calendar, activity, grid, Gantt, and cohort hints require Celego's own server contracts before implementation.