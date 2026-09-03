# Debit Card Computed Contact Comments

**Status:** Approved design

## Context

Celego already records operative contact activity for cards through ContactLog and stores the latest operative state in card metadata. The debit-card status workflow currently has one generic note field, but it does not expose the complete contact history or let the operator choose between a system-generated comment and a manual criterion.

The requested behavior is limited to debit cards:

- Every contact operation contributes to a complete, auditable history.
- The system-generated comment summarizes all contact operations, including totals and per-phone details.
- The operator can include the computed comment, their own criterion, or both.
- The computed comment is regenerated at export time so new contact operations are never hidden by an old snapshot.
- Credit-card behavior remains unchanged.

## Goals

1. Show a read-only computed contact comment in the debit-card status workflow.
2. Preserve the operator's manual criterion independently from the computed history.
3. Persist the computed-comment preference per debit card, enabled by default.
4. Include the current comment composition in the debit consolidado export.
5. Keep contact history and manual-criterion history auditable.
6. Preserve compatibility with existing contact records that do not have a channel.

## Non-goals

- Redesigning the three-column operative contact wizard.
- Changing the meaning of contactado, status transitions, return requests, or transfers.
- Adding computed comments to credit-card exports.
- Replacing ContactLog with a second copy of the same contact history.
- Deleting or rewriting existing contact records.

## Decision summary

The system will derive the computed comment from ContactLog at read/export time. It will persist only:

| Value | Scope | Default | Purpose |
|---|---|---:|---|
| Computed comment enabled | One debit card | true | Controls whether the computed history participates in the final export comment |
| Manual criterion | One debit card | empty | Stores the latest operator criterion used by the export |
| Contact operation history | One card, append-only | n/a | Source of truth for computed content |

The alternatives of storing only a status-time snapshot or introducing a separate aggregate-history table were rejected. A snapshot becomes stale after a new call, while a second history table duplicates ContactLog without adding business value.

## User experience

### Status section for debit cards

The existing status section will keep its current controls and add a debit-only comment block:

1. Checkbox: Use system-computed comment.
   - Checked by default.
   - Persisted per card.
   - Turning it off never deletes contact history.
2. Read-only computed comment preview.
   - Shows the current full history.
   - Includes total attempts, effective contacts, non-contacts, per-phone counts, and chronological detail.
3. Textarea: Operator criterion.
   - Independent of the computed preview.
   - Initialized with the latest saved manual criterion.
   - Saving a new value creates an auditable entry in the card timeline.
4. Final preview.
   - Makes clear which sources will be included:
     - system-computed;
     - operator criterion;
     - both;
     - neither.

The block is not rendered for credit cards. Existing credit status notes retain their current label and behavior.

### Computed comment format

The generated text follows this structure:

    Contact summary
    Total attempts: N
    Effective contacts: N
    Not contacted: N

    By phone:
    - phone: N attempts, N effective contacts
      - comment

    History:
    [date/time] — [operator] — [channel] — [phone] — [result] — [comment]

Empty values are omitted rather than rendered as undefined. A historical record with no channel is rendered as Channel not recorded. If no contact operation exists, the computed value is empty and the preview explains that there are no recorded operations.

The history is chronological from oldest to newest so that the progression of attempts is easy to follow. The most recent manual criterion is shown after the computed section when both sources are enabled.

## Data model

### ContactLog

Add an optional contact channel field:

| Field | Type | Compatibility |
|---|---|---|
| channel | nullable contact-channel enum | Existing rows remain valid with null |

The supported values are WhatsApp and direct call. The existing createdAt, user, telefonosUsados, contactado, and comentario fields remain the source for the rest of the event.

The contact operation endpoint receives and persists channel for new events. The existing metadata.operativo.canalContacto remains available as the latest-state compatibility value, but it is not used as the historical source.

### Debit comment configuration

Use a one-to-one debit-card configuration model rather than adding debit-only fields to the generic Card record:

- cardId, unique and required;
- useComputed, boolean default true;
- manualCriterion, nullable text;
- updatedAt;
- updatedById, nullable relation to User.

The configuration is created lazily for existing debit cards with useComputed=true and an empty manual criterion. It is never created or read for credit cards.

The existing CardStatusLog remains the audit trail for manual criterion changes and status actions. The log stores the operator-entered criterion, not a duplicated full computed history. The current configuration supplies the latest criterion for export.

## Data flow

### Contact operation

1. The operative wizard submits contact result, phones, comment, and channel.
2. The server validates the channel and card identity.
3. The server stores the contact event in ContactLog and keeps the existing operative metadata projection.
4. The card detail response exposes all contact events required for the debit computed preview.

### Debit status save

1. The client sends status fields, useComputed, and manualCriterion.
2. The server rejects the debit-comment fields for credit cards or ignores them outside the debit path.
3. The server updates the debit comment configuration and the status transition in one transaction.
4. The server adds a CardStatusLog entry when the manual criterion or computed preference changes.
5. The response returns the saved configuration and the latest card state.

### Consolidado export

1. The export route queries debit cards with their complete ContactLog history and debit comment configuration.
2. A pure composer builds the computed text from ContactLog.
3. The composer combines sources according to the persisted preference:
   - enabled plus non-empty manual criterion: both;
   - enabled plus empty manual criterion: computed only;
   - disabled plus non-empty manual criterion: manual only;
   - disabled plus empty manual criterion: empty comment.
4. The resulting comment is passed to the existing debit consolidado generator as the COMENTARIO value.
5. The XLSX template and all non-comment export behavior remain unchanged.

Because composition happens during export, a contact operation recorded after a status save is included automatically in the next consolidado download when the card preference is enabled.

## API contracts

### Contact operation POST

The existing contact payload gains an optional channel field with the values WHATSAPP or LLAMADA_DIRECTA. Omitting it remains valid for compatibility.

### Card detail GET

For debit cards, return:

- complete contacts in chronological or explicitly sortable form;
- useComputed;
- manualCriterion;
- computedComment;
- computed summary counts.

For credit cards, preserve the existing response contract and omit debit-comment fields.

### Card status PATCH

For debit cards, accept:

- useComputed: boolean;
- manualCriterion: trimmed string or null.

The endpoint must preserve the existing status validation and return-reason rules. Invalid payloads return the normal 400 response without partially updating the card or comment configuration.

## Error handling and compatibility

- A missing debit comment configuration is treated as enabled with an empty manual criterion.
- A missing channel on an old ContactLog is displayed as Channel not recorded.
- A malformed contact channel is rejected with a validation error and does not create a ContactLog.
- A failed status/configuration transaction leaves both status and comment configuration unchanged.
- Computed composition is bounded by the card's existing ContactLog history and does not query contacts for credit exports.
- The UI uses the existing toast notification pattern for save and error feedback; no new bottom-of-page feedback block is introduced.

## Testing strategy

### Pure composer tests

- No history produces an empty computed value and zero counts.
- One effective contact produces the expected summary and detail.
- Several non-contact attempts on the same number preserve every comment and count.
- Multiple numbers produce independent per-phone aggregates.
- Mixed effective and non-contact events produce correct totals.
- Missing channels render Channel not recorded.
- Computed/manual combinations produce the four expected final outputs.
- A new ContactLog event changes the next composition without changing persisted historical events.

### API tests

- Contact POST persists channel on new ContactLog records.
- Existing contact payloads without channel remain accepted.
- Debit status PATCH persists useComputed and manualCriterion atomically.
- Credit status PATCH does not create debit comment configuration.
- Card detail GET exposes debit comment data only for debit cards.

### Export tests

- The export query includes all ContactLog rows for debit cards.
- The generated COMENTARIO cell contains the live computed history.
- Disabling the preference excludes computed history but retains the latest manual criterion.
- The canonical XLSX template and its structural parts remain preserved.
- Credit export behavior is unchanged.

## Acceptance checklist

- [ ] A debit card status view shows the computed comment, enabled by default.
- [ ] The operator can use computed, manual, both, or neither.
- [ ] The computed comment includes all historical attempts and per-number counts.
- [ ] Every new contact event records date, operator, phone, result, comment, and channel.
- [ ] Existing events without a channel remain readable.
- [ ] The manual criterion has timeline history and the latest value drives export.
- [ ] A new call appears in the next export without another status save.
- [ ] Credit cards do not show or receive debit-comment behavior.
- [ ] Focused tests and Docker verification pass.

## Implementation boundaries

Expected implementation areas:

- prisma/schema.prisma and the corresponding database synchronization;
- app/api/operativo/contacto/route.ts;
- app/api/tarjetas/[id]/route.ts or the existing card-detail endpoint;
- components/cards/card-detail-modal.tsx;
- a focused lib/debit-contact-comment.ts composer;
- app/api/tarjetas-debito/exportar-consolidado/route.ts;
- focused tests under tests/cards and tests/api.

No unrelated status, credit, or operative-list refactor is part of this change.
