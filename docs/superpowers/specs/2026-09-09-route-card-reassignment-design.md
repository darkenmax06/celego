# Route Card Reassignment Design

## Goal

Allow operations to assign an open card to a new messenger even when it belongs to an active route. The new route becomes the only active assignment.

## Rules

- Reassignment is allowed only for cards that are not in a terminal state.
- The card is removed from each prior active route before it is added to the new route.
- If a prior route has no items after removal, it is cancelled automatically.
- The card's current and last assigned messenger are updated to the messenger of the new route.
- Every transfer records the previous route and messenger, the new route and messenger, and the initiating user.

## Transaction

Route creation resolves and validates all selected cards first. Inside one database transaction, it removes each selected card from prior `PENDIENTE` or `EN_PROCESO` routes, cancels any route that becomes empty, creates the new route item, updates the card assignment and writes the audit/status entries. A failure rolls back the full operation.

## Safety

Closed cards remain ineligible. The API returns a conflict if a card changes to a closed state during the transaction. Historical completed routes are never altered.

## Verification

Tests will cover transfer to another messenger, automatic cancellation of an emptied source route, preservation of a non-empty source route, terminal-card rejection, and atomic rollback on concurrent closure.
