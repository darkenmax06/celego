# Digital Delivery Image Contract Wizard

**Status:** Approved design

## Context

The digital-delivery screen resolves image filenames to cards by TC, external reference, or customer name. The current `POST /api/status-digitales` both resolves and mutates cards before the client opens its ambiguity and missing-contract modals. That makes a true batch cancellation impossible and allows partial updates before the operator has identified every file.

The requested workflow is:

- A delivery image named like `Juan perez.jpeg` is paired with `Juan perez (C).jpeg` when the latter exists in the same selected batch. `(C)` is case-insensitive.
- A `(C)` image is evidence only; it must not create a second delivery update.
- A card requiring a contract without a matching `(C)` image is previewed as `ENTREGA_DIGITAL_SIN_CONTRATO`.
- Name ambiguity must be resolved before contract validation when both conditions apply.
- The operator processes one case at a time. The wizard cannot be dismissed until all cases are resolved or the entire batch is cancelled.
- Cancellation discards every pending update, including decisions already made in the wizard.
- Card mutations happen only after the final confirmation.

## Goals

1. Make image processing a two-phase operation: read-only preview followed by an explicit atomic commit.
2. Reuse the existing server-side operational-card resolver and `(C)` tag parser instead of duplicating matching rules in the browser.
3. Provide a focused, one-case-at-a-time wizard for ambiguous, unmatched, and missing-contract cases.
4. Preserve the existing closed-status exclusions and contract exception statuses.
5. Prevent partial writes on cancellation or stale selections.

## Non-goals

- Changing how route assignment marks `Card.hasContract`.
- Changing the pending-contract work queue or its later contract-upload resolution flow.
- Uploading image bytes from this screen; the existing flow operates on selected filename metadata. The `(C)` filename is recorded as contract evidence at commit time.
- Replacing the existing Bizcochito or physical-delivery workflows.

## Proposed architecture

### 1. Read-only preview

Split the current route behavior into an explicit preview operation and a commit operation:

```text
POST /api/status-digitales/preview
  input: selected image metadata
  output: resolved rows, candidate cards, contract pairing, expected card state
  side effects: none

POST /api/status-digitales/commit
  input: selected image metadata + manual card selections + expected preview state
  output: final rows and summary
  side effects: one database transaction, audit log after successful writes
```

Preview must:

- Parse every filename with the shared `peelFileTags` logic.
- Separate delivery images from contract images.
- Pair both image kinds by the same normalized identifier and additional-image ordinal.
- Resolve direct matches and name matches using the current `NAME_AMBIGUITY_EXCLUDED_STATUSES` policy.
- Return candidates with only the operator fields required by the wizard: TC, customer name, cédula, and dispatch date, plus status for context.
- Return the expected status and contract evidence state for each resolved card so commit can detect stale data.

The preview response is client-held workflow state only. No card, contract timestamp, or audit record is written during preview.

### 2. Atomic commit

The client sends the final manual selections and the expected preview state to the commit operation. The server re-runs the resolution and pairing rules, then validates that every selected card still has the expected status and contract evidence state.

If any card changed since preview, commit returns a conflict response identifying the affected cases and writes nothing. The wizard remains open so the operator can re-evaluate those cases. If all cards are valid, the server applies the complete update plan inside one transaction and writes one audit record for the batch.

The commit plan follows the existing contract rules:

| Batch content | Card contract requirement | Result |
|---|---|---|
| Delivery + `(C)` | `hasContract=true` | `ENTREGA_DIGITAL`; record contract filename/evidence |
| Delivery only | `hasContract=true`, no previous evidence | `ENTREGA_DIGITAL_SIN_CONTRATO` |
| Delivery only | `hasContract=true`, previous evidence exists | `ENTREGA_DIGITAL` |
| `(C)` only | Any | Record evidence when applicable; never create a delivery update |
| Any | `hasContract=false` | Preserve normal digital-delivery behavior; `(C)` never creates a second update |

### 3. Filename pairing

`peelFileTags` remains the single source of truth for trailing tags. It must recognize `(C)` in any casing and in combination with existing `(ZR)`, `(ADICIONAL N)`, and numeric copy suffixes. For example, `Juan perez (C).jpeg` and `Juan perez.jpeg` produce the same delivery identifier, while the former is classified as contract evidence.

Duplicate contract images for the same delivery image are reported in the preview as a non-blocking informational condition; the last deterministic filename is retained for evidence, matching the existing batch semantics. A contract-only filename with no resolvable card remains an unmatched informational row and cannot update a card.

## Wizard interaction

### Entry and ordering

Clicking **Procesar** calls preview. If every row is deterministically resolved, the screen skips directly to the final review. Otherwise, the wizard opens on the first unresolved case in original file order and shows `Caso N de M`.

The overlay is modal and blocking:

- no close icon;
- Escape and backdrop clicks do nothing;
- **Cancelar lote** is the only exit before completion;
- cancel clears all local preview, selections, and draft state and never calls commit.

### Case resolution

Each case has one focused decision:

1. **Ambiguous name:** show every eligible card with TC, customer name, cédula, and dispatch date. Selecting one card resolves the image and immediately runs the contract check for that card.
2. **No automatic match:** show the operational card search. A selected result resolves the image and immediately runs the contract check.
3. **Missing contract:** if the selected card has `hasContract=true` and no paired `(C)` image or previous evidence, show the card context, the missing-contract warning, and the resulting status `ENTREGA_DIGITAL_SIN_CONTRATO`. The operator must acknowledge **Continuar sin contrato** before advancing.
4. **Contract present:** show a compact confirmation that the paired `(C)` image was found, then advance to the next case.

When ambiguity and missing contract occur together, the card-selection decision is always shown first, followed by the contract decision in the same case. This prevents checking the contract against the wrong customer.

The footer shows progress and navigation state. It does not offer an omit action for an unresolved file: an unmatched image must be found manually or the whole batch must be cancelled.

### Final review

After the last case is resolved, the wizard changes to a final review state containing:

- total images and cards;
- cards that will become `ENTREGA_DIGITAL`;
- cards that will become `ENTREGA_DIGITAL_SIN_CONTRATO`, with a simple list of TC and customer name;
- ignored closed-status rows and informational unmatched contract-only files;
- a single **Actualizar lote** action.

The final action is disabled while any case is unresolved. On success, the wizard closes and the existing result table displays the committed response. On a stale-state response, the wizard stays open with only the affected cases returned for review.

## UI component boundaries

- `status-digitales-client.tsx`: owns selected files, preview state, wizard progression, cancellation, and final commit request. It must not infer card matches locally.
- `status-digital-selection-wizard-modal.tsx`: renders one current case, candidate list, manual search, progress, and final review. It receives data and emits decisions; it does not call the API.
- `missing-contract-wizard-modal.tsx`: no longer acts as a separate post-mutation modal. Missing-contract decisions are rendered as a step of the unified selection wizard so that card identification always precedes contract validation.
- `app/api/status-digitales/route.ts`: either delegates to shared preview/commit helpers or exposes the two explicit operations while preserving existing resolver and transition behavior.
- A pure preview/plan helper should own the transformation from parsed rows to update plans so it can be tested without React or HTTP.

## Error handling and safety

- Invalid or empty filename batches fail before preview state is created.
- Authorization remains `ADMIN`/`OPERADOR`, matching the current endpoint.
- Manual card IDs are accepted only if they are candidates returned by the current preview or are validated by the same server resolver during commit.
- Any commit validation failure is all-or-nothing; no compensating rollback is needed because the transaction has not partially committed.
- Network failure leaves the wizard state intact and offers retry of the final commit, not a new preview with lost decisions.
- Successful commit remains subject to the existing transition guards, cycle counting, remote-zone update, contract evidence persistence, and audit logging.

## Testing strategy

### Pure logic

- `(C)` parsing is case-insensitive and order-independent with additional and remote tags.
- Delivery/contract pairing does not create a second delivery row.
- Contract-required delivery without `(C)` plans `ENTREGA_DIGITAL_SIN_CONTRATO`.
- Existing contract evidence prevents regression to the exception status.
- Non-contract cards preserve existing behavior.

### API/integration

- Preview returns no database writes or audit log.
- Preview returns candidate cards for duplicate customer names and excludes closed/resolved statuses according to the current policy.
- Manual resolution is applied only to the selected image.
- Commit applies all resolved rows atomically.
- Cancellation performs no commit.
- A stale card causes a zero-write conflict response.
- Contract-only images never mutate delivery status.

### Component

- The wizard opens on the first unresolved case and advances one case at a time.
- Ambiguity is resolved before missing-contract confirmation.
- Escape, backdrop click, and close controls cannot dismiss an active wizard.
- Cancel clears the entire batch.
- Final confirmation is unavailable until all cases are resolved.

## Acceptance criteria

1. Selecting `Juan perez.jpeg` and `Juan perez (C).jpeg` for a contract card produces one delivery update with contract evidence.
2. Selecting only `Juan perez.jpeg` for that card produces a wizard case and, after acknowledgement, a planned `ENTREGA_DIGITAL_SIN_CONTRATO` update.
3. Two eligible cards with the same customer name produce a case showing TC, name, cédula, and dispatch date; the operator can choose exactly one.
4. A name with no automatic match opens manual search and cannot be silently omitted.
5. If a name is ambiguous and the chosen card requires a contract, the card is selected before the contract warning is shown.
6. Cancelling at any point results in zero card, contract, or audit writes for the batch.
7. No mutation occurs before **Actualizar lote**.
8. Existing closed-status and non-contract behavior remains unchanged.
