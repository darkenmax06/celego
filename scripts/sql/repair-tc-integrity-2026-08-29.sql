-- ============================================================================
-- Celego · TC integrity repair · 2026-08-29
--
-- Runs as one transaction against the production database. No schema change is
-- required: this file only repairs data, so it works on a database that has not
-- yet received the CardTcGuard migration.
--
-- Idempotent. Re-running it is a no-op once every block has been applied.
--
--   psql -U celego -d celego -v ON_ERROR_STOP=1 -f repair-tc-integrity-2026-08-29.sql
-- ============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- Block 0 · Audit trail table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tc_repair_20260829_dispatchdate_backup (
  card_id            text PRIMARY KEY,
  original_dispatch  timestamp(3),
  applied_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tc_repair_20260829_status_backup (
  card_id          text PRIMARY KEY,
  original_status  text,
  original_reason  text,
  original_courier text,
  applied_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Block 1 · Swapped dispatch dates
--
-- The dispatch importer parsed DD/MM as MM/DD, so 254 cards carry a
-- dispatchDate that falls after their own first status log, with day and month
-- transposed. The dispatch order decides which card of a TC is the current one,
-- so this has to be corrected before anything else.
-- ---------------------------------------------------------------------------

INSERT INTO tc_repair_20260829_dispatchdate_backup (card_id, original_dispatch)
SELECT c.id, c."dispatchDate"
FROM "Card" c
WHERE c."dispatchDate" IS NOT NULL
  AND c."dispatchDate"::date > (SELECT min(l."createdAt")::date FROM "CardStatusLog" l WHERE l."cardId" = c.id)
  AND extract(day   FROM c."dispatchDate") = extract(month FROM (SELECT min(l."createdAt") FROM "CardStatusLog" l WHERE l."cardId" = c.id))
  AND extract(month FROM c."dispatchDate") = extract(day   FROM (SELECT min(l."createdAt") FROM "CardStatusLog" l WHERE l."cardId" = c.id))
ON CONFLICT (card_id) DO NOTHING;

UPDATE "Card" c
SET "dispatchDate" = make_timestamp(
      extract(year  FROM b.original_dispatch)::int,
      extract(day   FROM b.original_dispatch)::int,
      extract(month FROM b.original_dispatch)::int,
      extract(hour  FROM b.original_dispatch)::int, 0, 0)
FROM tc_repair_20260829_dispatchdate_backup b
WHERE b.card_id = c.id
  AND c."dispatchDate" = b.original_dispatch;

-- ---------------------------------------------------------------------------
-- Block 2 · Overwritten returns on superseded dispatches
--
-- A card that was RETORNADA and later moved out of that state, while a NEWER
-- dispatch of the same TC exists, is unambiguous: the return closed the old
-- dispatch and the later activity belongs to the new one. Restore the return.
-- ---------------------------------------------------------------------------

CREATE TEMPORARY TABLE tmp_overwritten ON COMMIT DROP AS
WITH last_return AS (
  SELECT c.id AS card_id, c.tc, c.status::text AS status, c."returnReason", c."currentMessengerId",
         c."dispatchDate", c."createdAt",
         (SELECT max(l."createdAt") FROM "CardStatusLog" l WHERE l."cardId" = c.id AND l."toStatus" = 'RETORNADA') AS returned_at
  FROM "Card" c
  WHERE c.status <> 'RETORNADA'
)
SELECT r.card_id, r.tc, r.status, r."returnReason", r."currentMessengerId", r.returned_at,
       (SELECT l.note FROM "CardStatusLog" l
         WHERE l."cardId" = r.card_id AND l."toStatus" = 'RETORNADA' AND l."createdAt" = r.returned_at
         LIMIT 1) AS return_note
FROM last_return r
WHERE r.returned_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM "CardStatusLog" l
               WHERE l."cardId" = r.card_id AND l."createdAt" > r.returned_at AND l."toStatus" <> 'RETORNADA')
  -- a strictly newer dispatch of the same TC must exist
  AND EXISTS (SELECT 1 FROM "Card" n
               WHERE n.tc = r.tc AND n.id <> r.card_id
                 AND (coalesce(n."dispatchDate", '-infinity'::timestamp), n."createdAt", n.id)
                   > (coalesce(r."dispatchDate", '-infinity'::timestamp), r."createdAt", r.card_id))
  -- Held back by operations: RUTH SANTANA and NORQUELLYS YAN sit in
  -- ENTREGA_DIGITAL, and whether that status closes a dispatch is an open
  -- business rule. Until it is decided, these two rows stay untouched and the
  -- audit keeps reporting them.
  AND r.card_id NOT IN ('cmrcincqy00xnmk2z6gjk4ucf', 'cmrcingpk012imk2z7x23gybh');

INSERT INTO tc_repair_20260829_status_backup (card_id, original_status, original_reason, original_courier)
SELECT card_id, status, "returnReason", "currentMessengerId" FROM tmp_overwritten
ON CONFLICT (card_id) DO NOTHING;

INSERT INTO "CardStatusLog" (id, "cardId", "fromStatus", "toStatus", note, "createdAt")
SELECT 'tcfix0829' || substr(md5(o.card_id), 1, 16), o.card_id, o.status::"CardStatus", 'RETORNADA',
       'Correccion de integridad TC: el retorno del ' || to_char(o.returned_at, 'YYYY-MM-DD') ||
       ' fue sobrescrito por actividad de un despacho posterior',
       now()
FROM tmp_overwritten o
ON CONFLICT (id) DO NOTHING;

UPDATE "Card" c
SET status = 'RETORNADA',
    "returnReason" = coalesce(c."returnReason", o.return_note),
    "currentMessengerId" = NULL,
    "updatedAt" = now()
FROM tmp_overwritten o
WHERE o.card_id = c.id;

-- ---------------------------------------------------------------------------
-- Block 3 · ELVIN JIMENEZ · TC 4921018089618300
--
-- The 2026-05-29 dispatch stayed EN_RUTA with no further movement while the TC
-- was dispatched again on 2026-06-10. Operations confirmed the card came back;
-- the re-dispatch date is used as the implicit return date.
-- ---------------------------------------------------------------------------

INSERT INTO tc_repair_20260829_status_backup (card_id, original_status, original_reason, original_courier)
SELECT id, status::text, "returnReason", "currentMessengerId" FROM "Card"
WHERE id = 'cmpr45ang0dbgoi3es5b0hnh1' AND status <> 'RETORNADA'
ON CONFLICT (card_id) DO NOTHING;

INSERT INTO "CardStatusLog" (id, "cardId", "fromStatus", "toStatus", note, "createdAt")
SELECT 'tcfix0829elvin000000001', id, status, 'RETORNADA',
       'Correccion de integridad TC: despacho anterior cerrado al re-despacharse el TC el 2026-06-10', now()
FROM "Card" WHERE id = 'cmpr45ang0dbgoi3es5b0hnh1' AND status <> 'RETORNADA'
ON CONFLICT (id) DO NOTHING;

UPDATE "Card"
SET status = 'RETORNADA',
    "returnReason" = 'Regularizacion de integridad: cerrada al re-despacharse el TC el 2026-06-10',
    "currentMessengerId" = NULL,
    "updatedAt" = now()
WHERE id = 'cmpr45ang0dbgoi3es5b0hnh1' AND status <> 'RETORNADA';

-- ---------------------------------------------------------------------------
-- Block 4 · Split the two rows that were reused instead of re-dispatched
--
-- GERMANIA SANTANA and CYNTHIA REYES each have a single row carrying two real
-- dispatches: the row was returned and then reused for the next delivery.
-- Operations confirmed both cards went out again, so each row is split into the
-- original (closed as RETORNADA) and a new card holding the second dispatch.
-- Status logs, route items and redaction items move with the dispatch they
-- belong to.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  cols text;
  split record;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'Card'
    AND column_name NOT IN ('id', 'sourceRecordKey');

  FOR split IN
    SELECT * FROM (VALUES
      -- origin card,                  new card id,                 cut-off (exclusive), new dispatch, new status
      ('cmrb1tvh602ammk3d1pwtub8h', 'tcfix0829germania0000001', '2026-07-16 14:48:18.917'::timestamp, '2026-07-21 12:00:00'::timestamp, 'ENTREGADA'),
      ('cmqve19ao00v6mk2zdtqr8m31', 'tcfix0829cynthia00000001', '2026-07-06 14:28:16.660'::timestamp, '2026-07-17 12:00:00'::timestamp, 'ENTREGA_DIGITAL')
    ) AS t(origin_id, new_id, cutoff, new_dispatch, new_status)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM "Card" WHERE id = split.new_id);

    -- 4a. clone the row, dropping the unique source key
    EXECUTE format(
      'INSERT INTO "Card" (id, %s) SELECT %L, %s FROM "Card" WHERE id = %L',
      cols, split.new_id, cols, split.origin_id);

    UPDATE "Card"
    SET "dispatchDate" = split.new_dispatch,
        status = split.new_status::"CardStatus",
        "returnReason" = NULL,
        "createdAt" = split.new_dispatch,
        "updatedAt" = now()
    WHERE id = split.new_id;

    -- 4b. hand the post-return history to the new dispatch
    UPDATE "CardStatusLog" SET "cardId" = split.new_id
    WHERE "cardId" = split.origin_id AND "createdAt" > split.cutoff;

    UPDATE "RouteItem" ri SET "cardId" = split.new_id
    FROM "Route" r WHERE r.id = ri."routeId"
      AND ri."cardId" = split.origin_id AND r."createdAt" > split.cutoff;

    UPDATE "RedactionItem" di SET "cardId" = split.new_id
    FROM "Redaction" d WHERE d.id = di."redactionId"
      AND di."cardId" = split.origin_id AND d."createdAt" > split.cutoff;

    UPDATE "ContactLog" SET "cardId" = split.new_id
    WHERE "cardId" = split.origin_id AND "createdAt" > split.cutoff;

    -- 4c. close the original dispatch on its real return
    INSERT INTO tc_repair_20260829_status_backup (card_id, original_status, original_reason, original_courier)
    SELECT id, status::text, "returnReason", "currentMessengerId" FROM "Card" WHERE id = split.origin_id
    ON CONFLICT (card_id) DO NOTHING;

    UPDATE "Card"
    SET status = 'RETORNADA',
        "returnReason" = coalesce("returnReason", 'Cliente no localizado'),
        "currentMessengerId" = NULL,
        "updatedAt" = now()
    WHERE id = split.origin_id;

    INSERT INTO "AuditLog" (id, entity, "entityId", action, result, details, "createdAt")
    VALUES ('tcfix0829split' || substr(md5(split.origin_id), 1, 10), 'Card', split.origin_id,
            'CARD_TC_INTEGRITY_SPLIT', 'SUCCESS',
            jsonb_build_object('newCardId', split.new_id, 'newDispatchDate', split.new_dispatch,
                               'newStatus', split.new_status, 'cutoff', split.cutoff),
            now())
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Block 5 · The 2026-06-16 bulk return, reviewed and left as delivered
--
-- Four cards were returned at 12:59 with the reason "Cambio masivo por
-- pistoleo" and moved back to EN_RUTA between 32 seconds and 2 minutes later,
-- then completed a normal delivery. Operations confirmed the bulk return was
-- the mistake, so the delivered status stands. Recorded so the audit stops
-- reporting them as unexplained.
-- ---------------------------------------------------------------------------

INSERT INTO "AuditLog" (id, entity, "entityId", action, result, details, "createdAt")
SELECT 'tcfix0829keep' || substr(md5(c.id), 1, 12), 'Card', c.id,
       'CARD_TC_INTEGRITY_REVIEWED', 'SUCCESS',
       jsonb_build_object('tc', c.tc, 'status', c.status,
                          'decision', 'El retorno masivo del 2026-06-16 fue el error; la entrega es real',
                          'reviewedAt', '2026-08-29'),
       now()
FROM "Card" c
WHERE c.id IN ('cmqbdvp3x01cfoi2zvrjedps9','cmqbdvpd701dtoi2z26f2i51e',
               'cmqbdvpfz01e8oi2zhq4p77cb','cmqbdvpgw01edoi2ztdvyl5um')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------

\echo '--- fechas corregidas ---'
SELECT count(*) AS fechas FROM tc_repair_20260829_dispatchdate_backup;

\echo '--- estados restaurados ---'
SELECT count(*) AS estados FROM tc_repair_20260829_status_backup;

\echo '--- retornos pisados que quedan por decision operativa (esperado: los 4 del lote 16-06) ---'
SELECT c.tc, c.id, c.status::text
FROM "Card" c
WHERE c.status <> 'RETORNADA'
  AND EXISTS (SELECT 1 FROM "CardStatusLog" l
               WHERE l."cardId" = c.id AND l."toStatus" = 'RETORNADA'
                 AND EXISTS (SELECT 1 FROM "CardStatusLog" l2
                              WHERE l2."cardId" = c.id AND l2."createdAt" > l."createdAt" AND l2."toStatus" <> 'RETORNADA'))
ORDER BY c.tc;

\echo '--- TCs con mas de una tarjeta abierta (esperado: 0) ---'
SELECT tc, count(*) FROM "Card"
WHERE status NOT IN ('ENTREGADA','RETORNADA')
GROUP BY tc HAVING count(*) > 1;
