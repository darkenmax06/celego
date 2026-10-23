import { CardProductType, CardStatus, DispatchOrigin, Prisma } from "@prisma/client";
import { ZONAS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addBusinessDaysStrict } from "@/lib/sla";
import { toCardStatus } from "@/lib/card-status";
import { type ParsedCardRow } from "@/lib/importers/cards";
import { type NormalizedCardImportRow } from "@/lib/importers/card-normalize";
import { type ParsedDebitConsolidadoRow } from "@/lib/importers/debit-consolidado";
import { type ParsedDebitDespachoRow } from "@/lib/importers/debit-despacho";
import { type ParsedDebitPinitRow } from "@/lib/importers/debit-pinit-import";
import { isDebitTerminalStatus } from "@/lib/debit-status";
import { CUSTOMER_ID_RULE, normalizeCustomerId } from "@/lib/customer-id";
import { buildSourceRecordKey, canCreateDispatch, DispatchConflictError, nextTcGuardState } from "@/lib/dispatch-origin";
import { resolveZone } from "@/lib/zone-map";
import { mergePhoneLists, planCustomerMerge, type CustomerData } from "@/lib/customer-merge";
import { normalizeText } from "@/lib/utils";
import { recalculateAdditionalCardsForGroups } from "@/lib/card-additional";
import { applyMessengerReassignment } from "@/lib/route-reassignment";
import {
  buildDailyImportCardLookup,
  resolveOperationalCardLookup,
} from "@/lib/operational-card-lookup";
import {
  applyCardTransition,
  initialDigitalCycle,
} from "@/lib/card-transition";

async function getSlaDaysForRow(cedula: string, reference: string) {
  const config = await prisma.sLAConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", businessDays: 5 },
  });

  const [cedulaExtension, referenceExtension] = await Promise.all([
    prisma.sLAExtension.findFirst({
      where: { type: "CEDULA", matchValue: cedula, active: true },
    }),
    reference
      ? prisma.sLAExtension.findFirst({
          where: { type: "REFERENCIA", matchValue: reference, active: true },
        })
      : Promise.resolve(null),
  ]);

  const extra = (cedulaExtension?.extraDays ?? 0) + (referenceExtension?.extraDays ?? 0);
  const totalDays = Math.max(config.businessDays, config.businessDays + extra);
  return {
    businessDays: config.businessDays,
    totalDays,
  };
}

function normalizeZoneCandidate(input: string) {
  const value = input.trim();
  if (!value) return null;
  const matched = ZONAS.find((zone) => zone.toUpperCase() === value.toUpperCase());
  return matched ?? null;
}

export async function upsertCardsFromImport(rows: ParsedCardRow[], byUserId?: string) {
  const result = {
    created: 0,
    updated: 0,
  };

  const provinceConfigs = await prisma.provinceConfig.findMany({
    where: { active: true },
    select: { nombre: true, zona: true },
  });
  const provinceToZone = new Map<string, string>();
  for (const config of provinceConfigs) {
    provinceToZone.set(normalizeText(config.nombre), config.zona);
  }

  for (const item of rows) {
    const provincia = item.provincia || "Santo Domingo";
    const zoneFromFile = normalizeZoneCandidate(item.zona);
    const zoneFromProvince =
      provinceToZone.get(normalizeText(provincia)) ??
      resolveZone(provincia, zoneFromFile ?? "Metro");
    const zona = zoneFromProvince || zoneFromFile || "Metro";

    const { customer } = await upsertCustomerPreservingData(prisma, {
      cedula: item.cedula,
      nombre: item.nombre,
      telefonosRaw: item.telefonosRaw,
      direccionRaw: item.direccionRaw,
      provincia: provincia,
      zona: zona,
    });

    const status = toCardStatus(item.status);
    const sla = await getSlaDaysForRow(item.cedula, item.externalReference);
    const baseDate = item.fechaDespacho ?? new Date();
    const slaDueDate = addBusinessDaysStrict(baseDate, sla.totalDays);

    const existingCandidates = await prisma.card.findMany({
      where: buildDailyImportCardLookup({
        tc: item.tc,
        productType: "CREDITO",
        customerId: customer.id,
        dispatchDate: item.fechaDespacho,
      }),
    });
    const resolution = resolveOperationalCardLookup(
      { kind: "TC", value: item.tc },
      existingCandidates,
    );
    const existing = resolution.kind === "RESUELTA" ? resolution.card : null;

    if (existing) {
      await prisma.$transaction(async (tx) => {
        return applyCardTransition({
          tx,
          card: existing,
          nextStatus: status,
          byUserId,
          // Re-importing the same daily file re-touches every row regardless
          // of whether its status actually moved; only log a real transition,
          // matching persistDebitConsolidadoImport's guard below.
          note: existing.status !== status ? "Actualizacion por importacion" : undefined,
          data: {
            zona,
            provincia,
            isRemote: item.isRemote,
            deliveryType: item.deliveryType,
            emissionType: item.emissionType,
            supplier: item.supplier,
            contractType: item.contractType,
            externalReference: item.externalReference || null,
            urgent: existing.urgent,
            slaDueDate,
            slaExtensionDays: Math.max(0, sla.totalDays - sla.businessDays),
            metadata: {
              tipoEntrega: item.tipoEntrega,
            } as Prisma.InputJsonValue,
          },
        });
      });

      result.updated += 1;
      continue;
    }

    const created = await prisma.card.create({
      data: {
        tc: item.tc,
        customerId: customer.id,
        zona,
        provincia,
        dispatchDate: item.fechaDespacho,
        deliveryType: item.deliveryType,
        emissionType: item.emissionType,
        supplier: item.supplier,
        contractType: item.contractType,
        externalReference: item.externalReference || null,
        status,
        isRemote: item.isRemote,
        urgent: false,
        slaDueDate,
        slaExtensionDays: Math.max(0, sla.totalDays - sla.businessDays),
        metadata: {
          tipoEntrega: item.tipoEntrega,
        } as Prisma.InputJsonValue,
        ...initialDigitalCycle(status),
      },
    });

    await prisma.cardStatusLog.create({
      data: {
        cardId: created.id,
        fromStatus: null,
        toStatus: status,
        note: "Creada por importacion",
        byUserId,
      },
    });

    result.created += 1;
  }

  await recalculateAdditionalCardsForGroups(
    rows.map((row) => ({
      customerCedula: row.cedula,
      dispatchDate: row.fechaDespacho,
    })),
  );

  return result;
}

type BatchCardUpdateInput = {
  status?: CardStatus;
  provincia?: string;
  zona?: string;
  isRemote?: boolean;
  messengerId?: string | null;
  returnReason?: string | null;
  note?: string;
};

export async function batchUpdateCards(
  cardIds: string[],
  changes: BatchCardUpdateInput,
  byUserId?: string,
) {
  const cards = await prisma.card.findMany({ where: { id: { in: cardIds } } });

  if (!cards.length) {
    return { updated: 0 };
  }

  if (
    changes.status === undefined &&
    changes.provincia === undefined &&
    changes.zona === undefined &&
    changes.isRemote === undefined &&
    changes.messengerId === undefined &&
    changes.returnReason === undefined
  ) {
    return { updated: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (const card of cards) {
      const nextStatus = changes.status ?? card.status;
      const shouldUpdateStatus = nextStatus !== card.status;
      const requiresReturnReason =
        nextStatus === CardStatus.RETORNADA || nextStatus === CardStatus.DEVUELTA_TIENDA;
      const nextReturnReason =
        changes.returnReason !== undefined
          ? changes.returnReason
          : requiresReturnReason
            ? card.returnReason
            : null;

      if (requiresReturnReason && !nextReturnReason?.trim()) {
        throw new Error("RETURN_REASON_REQUIRED");
      }

      await applyCardTransition({
        tx,
        card,
        nextStatus,
        byUserId,
        note: changes.note,
        returnReason: nextReturnReason,
        data: {
          provincia: changes.provincia ?? undefined,
          zona: changes.zona ?? undefined,
          isRemote: changes.isRemote ?? undefined,
          currentMessengerId:
            changes.messengerId === undefined ? undefined : changes.messengerId,
          lastAssignedMessengerId:
            changes.messengerId === undefined || changes.messengerId === null
              ? undefined
              : changes.messengerId,
        },
        alwaysLog: shouldUpdateStatus,
      });
    }

    // A messenger change follows route-reassignment semantics: the cards leave
    // other messengers' active routes and the move is audited, atomically with
    // the field updates above.
    if (changes.messengerId !== undefined) {
      await applyMessengerReassignment(tx, {
        cards: cards.map((card) => ({
          id: card.id,
          status: changes.status ?? card.status,
          currentMessengerId: card.currentMessengerId,
        })),
        nextMessengerId: changes.messengerId,
        byUserId,
      });
    }
  });

  if (byUserId) {
    await prisma.auditLog.create({
      data: {
        entity: "CARD_BULK_UPDATE",
        entityId: "batch",
        action: "UPDATE",
        userId: byUserId,
        details: {
          cardIds,
          status: changes.status ?? null,
          provincia: changes.provincia ?? null,
          zona: changes.zona ?? null,
          isRemote: changes.isRemote === undefined ? null : changes.isRemote,
          messengerId:
            changes.messengerId === undefined ? null : changes.messengerId,
          returnReason: changes.returnReason === undefined ? null : changes.returnReason,
        } as Prisma.InputJsonValue,
      },
    });
  }

  return { updated: cards.length };
}

export function statusToRouteLifecycle(status: CardStatus) {
  if (
    status === CardStatus.ENTREGADA ||
    status === CardStatus.RETORNADA ||
    status === CardStatus.ACUSE_RECIBIDO ||
    status === CardStatus.DEVUELTA_TIENDA ||
    status === CardStatus.ENTREGA_DIGITAL ||
    status === CardStatus.TD_ENTREGADO ||
    status === CardStatus.TD_DEVUELTO_NO_LOCALIZADO ||
    status === CardStatus.TD_NO_LE_INTERESA ||
    status === CardStatus.TD_RETIRADA_EN_OFICINA ||
    status === CardStatus.TD_SOLICITADA_POR_ERROR ||
    status === CardStatus.TD_ZONA_FUERA_COBERTURA
  ) {
    return "COMPLETADA" as const;
  }
  if (status === CardStatus.EN_RUTA) {
    return "EN_PROCESO" as const;
  }
  return "PENDIENTE" as const;
}

function nonEmpty(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveNormalizedImportLocation(item: Pick<NormalizedCardImportRow, "origin" | "provincia" | "zona">) {
  if (item.origin === "CENTRO_ACOPIO") return { province: "Santo Domingo", zone: "Metro" };
  const zonaRaw = nonEmpty(item.zona);
  // Torre dispatch sheets frequently ship a single ZONA column holding the
  // province name and no PROVINCIA/ENVIADO A column at all, so fall back to it
  // before treating the row as unresolvable.
  const province = nonEmpty(item.provincia) ?? zonaRaw;
  const zone = normalizeZoneCandidate(zonaRaw ?? "") ?? (province ? resolveZone(province, "") : "");
  return { province, zone };
}

type CustomerClient = Prisma.TransactionClient | typeof prisma;

/**
 * Creates the customer or completes it without replacing what is already stored.
 * Returns the customer plus the labels of the fields whose stored value was kept.
 */
export async function upsertCustomerPreservingData(
  db: CustomerClient,
  input: { cedula: string; nombre: string } & Partial<Omit<CustomerData, "nombre">>,
) {
  const base = await db.customer.upsert({
    where: { cedula: input.cedula },
    update: {},
    create: {
      cedula: input.cedula,
      nombre: input.nombre,
      telefonosRaw: nonEmpty(input.telefonosRaw),
      direccionRaw: nonEmpty(input.direccionRaw),
      provincia: nonEmpty(input.provincia),
      zona: nonEmpty(input.zona),
    },
  });
  const plan = planCustomerMerge(base, input);
  const customer = Object.keys(plan.data).length
    ? await db.customer.update({ where: { id: base.id }, data: plan.data })
    : base;
  return { customer, preserved: plan.preserved };
}

export type ImportRowIssue = { row: number; code: string; message: string };

function isoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function shownValue(value: string | null | undefined) {
  return value ? `"${value}"` : "vacio";
}

type TcAvailability =
  | { ok: true }
  | { ok: false; code: "DELIVERED_TC_CONFLICT" | "ACTIVE_TC_CONFLICT"; message: string };

/**
 * Says whether a new dispatch may be created for this TC, and why not when it
 * may not. The guard row is upserted first to serialize every creation of the
 * same TC, including the first one.
 */
async function checkTcAvailability(tx: Prisma.TransactionClient, tc: string): Promise<TcAvailability> {
  await tx.cardTcGuard.upsert({ where: { tc }, update: {}, create: { tc } });
  const guard = await tx.cardTcGuard.findUniqueOrThrow({ where: { tc } });
  // Guard ids have no FK, so a hard-deleted card leaves a dangling reference that must not block a new dispatch.
  const liveGuardIds = new Set((await tx.card.findMany({
    where: { id: { in: [guard.activeCardId, guard.deliveredCardId].filter((id): id is string => Boolean(id)) } },
    select: { id: true },
  })).map((row) => row.id));
  const activeCardId = guard.activeCardId && liveGuardIds.has(guard.activeCardId) ? guard.activeCardId : null;
  const deliveredCardId = guard.deliveredCardId && liveGuardIds.has(guard.deliveredCardId) ? guard.deliveredCardId : null;
  if (activeCardId !== guard.activeCardId || deliveredCardId !== guard.deliveredCardId) {
    await tx.cardTcGuard.update({ where: { tc }, data: { activeCardId, deliveredCardId } });
  }
  try {
    canCreateDispatch({ tc, activeCardId, deliveredCardId });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof DispatchConflictError)) throw error;
    const blockingId = error.code === "DELIVERED_TC_CONFLICT" ? deliveredCardId : activeCardId;
    const blocking = blockingId
      ? await tx.card.findUnique({ where: { id: blockingId }, select: { status: true, dispatchDate: true } })
      : null;
    const detail = blocking ? ` (estado ${blocking.status}${blocking.dispatchDate ? `, despachada el ${isoDay(blocking.dispatchDate)}` : ""})` : "";
    return {
      ok: false,
      code: error.code,
      message: error.code === "DELIVERED_TC_CONFLICT"
        ? `La TC ${tc} ya fue entregada${detail}; no se crea otro despacho para una tarjeta entregada`
        : `La TC ${tc} ya tiene un despacho activo${detail}; no se duplica la tarjeta`,
    };
  }
}

/**
 * Persists the normalized dual-source contract without lifecycle regression on replay.
 *
 * A row that cannot become a card (unresolvable zone, TC already dispatched) is
 * rejected with its own reason instead of aborting the whole file, and an
 * existing customer is completed, never overwritten.
 */
export async function persistNormalizedCardImport(input: {
  batchId: string;
  rows: NormalizedCardImportRow[];
  rejectedRows: ImportRowIssue[];
  byUserId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    let created = 0;
    const updated = 0;
    const skippedRows: ImportRowIssue[] = [];
    const rejectedRows: ImportRowIssue[] = [...input.rejectedRows];

    // Re-processing a batch whose cards were removed replaces its previous row outcomes.
    await tx.cardImportRow.deleteMany({ where: { batchId: input.batchId } });

    if (input.rejectedRows.length) {
      await tx.cardImportRow.createMany({
        data: input.rejectedRows.map((row) => ({
          batchId: input.batchId,
          sourceRow: row.row,
          sourceKey: `REJECTED:${row.row}:${row.code}`,
          outcome: "REJECTED",
          reason: row.message,
        })),
      });
    }

    const reject = async (item: NormalizedCardImportRow, code: string, message: string) => {
      await tx.cardImportRow.create({
        data: { batchId: input.batchId, sourceRow: item.sourceRowNumber, sourceKey: `REJECTED:${item.sourceRowNumber}:${code}`, outcome: "REJECTED", reason: message },
      });
      rejectedRows.push({ row: item.sourceRowNumber, code, message });
    };

    for (const item of input.rows) {
      const existing = await tx.card.findUnique({ where: { sourceRecordKey: item.sourceRecordKey } });
      if (existing) {
        const message = `Tarjeta omitida: la TC ${item.tc} con cedula ${item.cedula} y fecha ${isoDay(item.dispatchDate)} ya existe en el sistema (estado ${existing.status}); no se modifico nada`;
        await tx.cardImportRow.create({
          data: { batchId: input.batchId, cardId: existing.id, sourceRow: item.sourceRowNumber, sourceKey: item.sourceRecordKey, outcome: "SKIPPED", reason: message },
        });
        skippedRows.push({ row: item.sourceRowNumber, code: "SOURCE_RECORD_REPLAY", message });
        continue;
      }

      const { province, zone } = resolveNormalizedImportLocation(item);
      if (!zone) {
        await reject(item, "UNRESOLVED_ZONE", `Zona no resuelta: provincia ${shownValue(item.provincia)} y zona ${shownValue(item.zona)} no coinciden con ninguna provincia configurada; corrija la columna ZONA/PROVINCIA o agreguela al mapa de zonas`);
        continue;
      }

      const availability = await checkTcAvailability(tx, item.tc);
      if (!availability.ok) {
        await reject(item, availability.code, `${availability.message}; se omite la fila`);
        continue;
      }

      const { customer, preserved } = await upsertCustomerPreservingData(tx, {
        cedula: item.cedula,
        nombre: item.nombre,
        telefonosRaw: item.telefonosRaw,
        direccionRaw: item.direccionRaw,
        provincia: province,
        zona: zone,
      });

      const sla = await getSlaDaysForRow(item.cedula, item.externalReference ?? "");
      const card = await tx.card.create({
        data: {
          tc: item.tc,
          customerId: customer.id,
          zona: zone,
          provincia: province ?? zone,
          dispatchDate: item.dispatchDate,
          status: CardStatus.DESPACHADA,
          isRemote: item.isRemote ?? false,
          deliveryType: item.deliveryType,
          emissionType: item.emissionType,
          supplier: item.supplier,
          contractType: item.contractType,
          externalReference: item.externalReference,
          dispatchOrigin: item.origin,
          sourceRecordKey: item.sourceRecordKey,
          sourceTerminal: item.sourceTerminal,
          importBatchId: input.batchId,
          slaDueDate: addBusinessDaysStrict(item.dispatchDate, sla.totalDays),
          slaExtensionDays: Math.max(0, sla.totalDays - sla.businessDays),
        },
      });
      await tx.cardTcGuard.upsert({ where: { tc: item.tc }, update: { activeCardId: card.id }, create: { tc: item.tc, activeCardId: card.id } });
      await tx.cardStatusLog.create({ data: { cardId: card.id, toStatus: CardStatus.DESPACHADA, note: "Creada por importacion", byUserId: input.byUserId } });
      await tx.cardImportRow.create({
        data: {
          batchId: input.batchId,
          cardId: card.id,
          sourceRow: item.sourceRowNumber,
          sourceKey: item.sourceRecordKey,
          outcome: "CREATED",
          reason: preserved.length ? `Datos del cliente conservados sin sobrescribir: ${preserved.join(", ")}` : null,
        },
      });
      created += 1;
    }

    await tx.cardImportBatch.update({
      where: { id: input.batchId },
      data: { status: "COMPLETED", rowCount: input.rows.length + input.rejectedRows.length, createdCount: created, updatedCount: updated, skippedCount: skippedRows.length, rejectedCount: rejectedRows.length, completedAt: new Date() },
    });
    return { created, updated, skipped: skippedRows.length, rejected: rejectedRows.length, rejectedRows, skippedRows };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export class ManualCardError extends Error {
  constructor(
    public readonly code: "INVALID_TC" | "INVALID_CEDULA" | "UNRESOLVED_ZONE" | "DUPLICATE_SOURCE_RECORD" | "DELIVERED_TC_CONFLICT" | "ACTIVE_TC_CONFLICT",
    message: string,
    public readonly status: 409 | 422,
  ) {
    super(message);
    this.name = "ManualCardError";
  }
}

/**
 * Creates one credit card by hand under the same rules as the file import:
 * TC/cedula validation, province-to-zone resolution, duplicate and active-TC
 * guards, SLA, and a customer that is completed but never overwritten.
 */
export async function createManualCreditCard(input: {
  tc: string;
  cedula: string;
  nombre: string;
  provincia: string;
  zona?: string | null;
  telefonosRaw?: string | null;
  direccionRaw?: string | null;
  dispatchDate?: Date;
  origin: "TORRE_POPULAR" | "CENTRO_ACOPIO";
  isRemote?: boolean;
  byUserId?: string;
}) {
  const tc = input.tc.replace(/\D/g, "");
  const cedula = normalizeCustomerId(input.cedula);
  if (!/^\d{15,19}$/.test(tc) || /^0+$/.test(tc)) {
    throw new ManualCardError("INVALID_TC", `TC invalida: ${shownValue(input.tc)} (debe tener entre 15 y 19 digitos y no ser solo ceros)`, 422);
  }
  if (!cedula) {
    throw new ManualCardError("INVALID_CEDULA", `Cedula invalida: ${shownValue(input.cedula)} (debe ser ${CUSTOMER_ID_RULE})`, 422);
  }
  const { province, zone } = resolveNormalizedImportLocation({ origin: "TORRE_POPULAR", provincia: input.provincia, zona: input.zona ?? null });
  if (!zone) {
    throw new ManualCardError("UNRESOLVED_ZONE", `Zona no resuelta: la provincia ${shownValue(input.provincia)} no coincide con ninguna provincia configurada`, 422);
  }
  const dispatchDate = input.dispatchDate ?? new Date();
  const sourceRecordKey = buildSourceRecordKey({ origin: input.origin, tc, cedula, dispatchDate });
  const telefonosRaw = mergePhoneLists(null, input.telefonosRaw);

  const result = await prisma.$transaction(async (tx) => {
    if (await tx.card.findUnique({ where: { sourceRecordKey }, select: { id: true } })) {
      throw new ManualCardError("DUPLICATE_SOURCE_RECORD", `Ya existe una tarjeta con la TC ${tc}, la cedula ${cedula} y la fecha ${isoDay(dispatchDate)}; no se creo otra`, 409);
    }
    const availability = await checkTcAvailability(tx, tc);
    if (!availability.ok) throw new ManualCardError(availability.code, availability.message, 409);

    const { customer, preserved } = await upsertCustomerPreservingData(tx, {
      cedula,
      nombre: input.nombre.trim(),
      telefonosRaw,
      direccionRaw: nonEmpty(input.direccionRaw),
      provincia: province,
      zona: zone,
    });
    const sla = await getSlaDaysForRow(cedula, "");
    const card = await tx.card.create({
      data: {
        tc,
        customerId: customer.id,
        zona: zone,
        provincia: province ?? zone,
        dispatchDate,
        status: CardStatus.DESPACHADA,
        isRemote: Boolean(input.isRemote),
        dispatchOrigin: input.origin,
        sourceRecordKey,
        slaDueDate: addBusinessDaysStrict(dispatchDate, sla.totalDays),
        slaExtensionDays: Math.max(0, sla.totalDays - sla.businessDays),
      },
      include: { customer: true },
    });
    await tx.cardTcGuard.upsert({ where: { tc }, update: { activeCardId: card.id }, create: { tc, activeCardId: card.id } });
    await tx.cardStatusLog.create({ data: { cardId: card.id, toStatus: CardStatus.DESPACHADA, note: "Creacion manual", byUserId: input.byUserId } });
    return { card, preserved };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await recalculateAdditionalCardsForGroups([{ customerCedula: cedula, dispatchDate: result.card.dispatchDate }]);
  return result;
}

export async function updateTcGuardAfterTransition(input: { cardId: string; tc: string; nextStatus: CardStatus }) {
  if (
    input.nextStatus !== CardStatus.ENTREGADA &&
    input.nextStatus !== CardStatus.RETORNADA &&
    input.nextStatus !== CardStatus.TD_ENTREGADO &&
    input.nextStatus !== CardStatus.TD_DEVUELTO_NO_LOCALIZADO
  )
    return;
  const guardState = nextTcGuardState(input.nextStatus, input.cardId);
  await prisma.cardTcGuard.upsert({
    where: { tc: input.tc },
    update: guardState,
    create: { tc: input.tc, ...guardState },
  });
}

/** Persists batch import from Débito Consolidado. */
export async function persistDebitConsolidadoImport(input: {
  batchId: string;
  rows: ParsedDebitConsolidadoRow[];
  byUserId?: string;
}) {
  let created = 0;
  let updated = 0;

  for (const item of input.rows) {
    const { customer } = await upsertCustomerPreservingData(prisma, {
      cedula: item.cedula,
      nombre: item.nombre,
      telefonosRaw: item.telefonosRaw,
      direccionRaw: item.direccionRaw,
      provincia: item.provincia,
      zona: item.zona,
    });

    const sla = await getSlaDaysForRow(item.cedula, item.requestNumber);
    const baseDate = item.dispatchDate ?? new Date();
    const slaDueDate = addBusinessDaysStrict(baseDate, sla.totalDays);

    const existing = await prisma.card.findFirst({
      where: {
        requestNumber: item.requestNumber,
        productType: CardProductType.DEBITO,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      await prisma.$transaction(async (tx) => {
        return applyCardTransition({
          tx,
          card: existing,
          nextStatus: item.status,
          byUserId: input.byUserId,
          // A re-imported consolidado re-touches every requestNumber row on
          // every run; most carry no real status movement. Logging then would
          // read as a status change that never happened (matches the guard
          // lib/debit-consolidation/service.ts already applies for its own
          // consolidado path). item.comment is still worth keeping when the
          // status genuinely moves.
          note:
            existing.status !== item.status
              ? item.comment || "Actualización por importación de consolidado débito"
              : undefined,
          data: {
            provincia: item.provincia,
            zona: item.zona,
            isRemote: item.isRemote,
            dispatchDate: item.dispatchDate ?? existing.dispatchDate,
            metadata: {
              ...((existing.metadata as Record<string, unknown>) || {}),
              ...item.rawRecord,
              comment: item.comment,
              recipientName: item.recipientName,
              thirdPartyInfo: item.thirdPartyInfo,
              bpdComment: item.bpdComment,
            } as Prisma.InputJsonValue,
          },
        });
      });
      updated += 1;
    } else {
      const card = await prisma.card.create({
        data: {
          tc: item.requestNumber,
          requestNumber: item.requestNumber,
          productType: CardProductType.DEBITO,
          dispatchOrigin: DispatchOrigin.BPD_DEBITO,
          customerId: customer.id,
          zona: item.zona,
          provincia: item.provincia,
          dispatchDate: item.dispatchDate,
          status: item.status,
          isRemote: item.isRemote,
          slaDueDate,
          slaExtensionDays: Math.max(0, sla.totalDays - sla.businessDays),
          importBatchId: input.batchId,
          metadata: {
            ...item.rawRecord,
            comment: item.comment,
            recipientName: item.recipientName,
            thirdPartyInfo: item.thirdPartyInfo,
            bpdComment: item.bpdComment,
          } as Prisma.InputJsonValue,
        },
      });

      await prisma.cardStatusLog.create({
        data: {
          cardId: card.id,
          toStatus: item.status,
          note: "Creada por importación de consolidado débito",
          byUserId: input.byUserId,
        },
      });
      created += 1;
    }
  }

  await prisma.cardImportBatch.update({
    where: { id: input.batchId },
    data: {
      status: "COMPLETED",
      rowCount: input.rows.length,
      createdCount: created,
      updatedCount: updated,
      completedAt: new Date(),
    },
  }).catch(() => undefined);

  return { created, updated, count: input.rows.length };
}

/** Persists batch import from Débito Despacho (new cards). */
export async function persistDebitDespachoImport(input: {
  batchId: string;
  rows: ParsedDebitDespachoRow[];
  byUserId?: string;
}) {
  let created = 0;
  const createdCards = [];

  for (const item of input.rows) {
    const { customer } = await upsertCustomerPreservingData(prisma, {
      cedula: item.cedula,
      nombre: item.nombre,
      telefonosRaw: item.telefonosRaw,
      direccionRaw: item.direccionRaw,
      provincia: item.provincia,
      zona: item.zona,
    });

    const sla = await getSlaDaysForRow(item.cedula, item.requestNumber);
    const baseDate = item.dispatchDate ?? new Date();
    const slaDueDate = addBusinessDaysStrict(baseDate, sla.totalDays);

    const card = await prisma.card.create({
      data: {
        tc: item.requestNumber,
        requestNumber: item.requestNumber,
        productType: CardProductType.DEBITO,
        dispatchOrigin: DispatchOrigin.BPD_DEBITO,
        customerId: customer.id,
        zona: item.zona,
        provincia: item.provincia,
        dispatchDate: item.dispatchDate,
        status: CardStatus.DESPACHADA,
        isRemote: item.isRemote,
        slaDueDate,
        slaExtensionDays: Math.max(0, sla.totalDays - sla.businessDays),
        importBatchId: input.batchId,
        metadata: item.rawRecord as Prisma.InputJsonValue,
      },
    });

    await prisma.cardStatusLog.create({
      data: {
        cardId: card.id,
        toStatus: CardStatus.DESPACHADA,
        note: "Creada por importación de despacho débito",
        byUserId: input.byUserId,
      },
    });

    createdCards.push(card);
    created += 1;
  }

  await prisma.cardImportBatch.update({
    where: { id: input.batchId },
    data: {
      status: "COMPLETED",
      rowCount: input.rows.length,
      createdCount: created,
      updatedCount: 0,
      completedAt: new Date(),
    },
  }).catch(() => undefined);

  return { created, updated: 0, count: input.rows.length, cards: createdCards };
}

/** Updates card status and metadata from Pinit deliveries export. */
export async function updateCardsFromPinitExport(input: {
  rows: ParsedDebitPinitRow[];
  byUserId?: string;
}) {
  let updated = 0;
  let notFound = 0;
  let skipped = 0;

  for (const item of input.rows) {
    if (!item.mappedStatus) {
      skipped += 1;
      continue;
    }

    const cards = await prisma.card.findMany({
      where: {
        requestNumber: item.requestNumber,
        productType: CardProductType.DEBITO,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!cards.length) {
      notFound += 1;
      continue;
    }

    const targetCard = cards.find((c) => !isDebitTerminalStatus(c.status)) || cards[0];

    const currentMeta = (targetCard.metadata as Record<string, unknown>) || {};
    const updatedMeta = {
      ...currentMeta,
      pinitTrackingNumber: item.trackingNumber,
      pinitRawStatus: item.rawStatus,
      pinitRecipientName: item.recipientName,
      pinitMessengerName: item.messengerName,
      pinitAttemptsCount: item.attemptsCount,
      pinitLastAttemptNotes: item.lastAttemptNotes,
      fechaEntrega: item.deliveryDate ? item.deliveryDate.toISOString() : currentMeta.fechaEntrega,
    };

    await prisma.$transaction(async (tx) => {
      return applyCardTransition({
        tx,
        card: targetCard,
        nextStatus: item.mappedStatus!,
        byUserId: input.byUserId,
        // Pinit exports repeat every requestNumber on every download; only
        // log when the mapped status actually moves the card, or a reprocessed
        // export reads as a fresh status change on cards that never moved.
        note:
          targetCard.status !== item.mappedStatus
            ? `Actualizado desde Pinit (${item.rawStatus})`
            : undefined,
        data: {
          metadata: updatedMeta as Prisma.InputJsonValue,
        },
      });
    });

    updated += 1;
  }

  return { updated, notFound, skipped, count: input.rows.length };
}
