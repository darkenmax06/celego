# Dispatch Origin Rollout

1. Back up PostgreSQL before schema deployment. Do not make origin or source keys required in the first release.
2. Deploy the nullable schema and application reads/writes, then run `npx tsx scripts/backfill-dispatch-origin.ts`.
3. Review the dry-run JSON. Legacy cards without defensible source provenance are quarantined; the script never guesses an origin.
4. Only after review, run `npx tsx scripts/backfill-dispatch-origin.ts --apply`. It records quarantine rows and exits non-zero while unresolved legacy data or duplicate source keys remain.
5. Make constraints non-null only after the report has `safeToTightenConstraints: true`; verify batch/row counts and guard uniqueness first.

Rollback application writes before tightening constraints. Preserve the backup, import batches, rows, guards, and quarantine audit records.
