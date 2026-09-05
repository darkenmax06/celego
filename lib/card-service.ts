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
import { canCreateDispatch, DispatchConflictError, nextTcGuardState } from "@/lib/dispatch-origin";
import { resolveZone } from "@/lib/zone-map";
import { normalizeText } from "@/lib/utils";
import { recalculateAdditionalCardsForGroups } from "@/lib/card-additional";
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

    const customer = await prisma.customer.upsert({
      where: { cedula: item.cedula },
      update: {
        nombre: item.nombre,
        telefonosRaw: item.telefonosRaw,
        direccionRaw: item.direccionRaw,
        provincia,
        zona,
      },
      create: {
        cedula: item.cedula,
        nombre: item.nombre,
        telefonosRaw: item.telefonosRaw,
        direccionRaw: item.direccionRaw,
        provincia,
        zona,
      },
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

export class CardImportConflictError extends Error {
  constructor(public readonly code: "DELIVERED_TC_CONFLICT" | "ACTIVE_TC_CONFLICT") {
    super(code);
    this.name = "CardImportConflictError";
  }
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

/** Persists the normalized dual-source contract without lifecycle regression on replay. */
export async function persistNormalizedCardImport(input: {
  batchId: string;
  rows: NormalizedCardImportRow[];
  rejectedRows: Array<{ row: number; code: string; message: string }>;
  byUserId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    let created = 0;
    const updated = 0;
    let skipped = 0;

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

    for (const item of input.rows) {
      const existing = await tx.card.findUnique({ where: { sourceRecordKey: item.sourceRecordKey } });
      if (existing) {
        await tx.cardImportRow.create({
          data: { batchId: input.batchId, cardId: existing.id, sourceRow: item.sourceRowNumber, sourceKey: item.sourceRecordKey, outcome: "SKIPPED", reason: "SOURCE_RECORD_REPLAY" },
        });
        skipped += 1;
        continue;
      }

      const { province, zone } = resolveNormalizedImportLocation(item);
      if (!zone) throw new Error(`UNRESOLVED_ZONE_ROW_${item.sourceRowNumber}:${item.provincia ?? item.zona ?? ""}`);
      const customer = await tx.customer.upsert({
        where: { cedula: item.cedula },
        update: {
          ...(nonEmpty(item.nombre) ? { nombre: item.nombre } : {}),
          ...(nonEmpty(item.direccionRaw) ? { direccionRaw: item.direccionRaw } : {}),
          ...(nonEmpty(item.telefonosRaw) ? { telefonosRaw: item.telefonosRaw } : {}),
          ...(province ? { provincia: province } : {}),
          ...(zone ? { zona: zone } : {}),
        },
        create: { cedula: item.cedula, nombre: item.nombre, direccionRaw: item.direccionRaw || null, telefonosRaw: item.telefonosRaw, provincia: province, zona: zone },
      });

      // Upsert first to serialize all creations for this TC, including the first one.
      await tx.cardTcGuard.upsert({ where: { tc: item.tc }, update: {}, create: { tc: item.tc } });
      const guard = await tx.cardTcGuard.findUniqueOrThrow({ where: { tc: item.tc } });
      try {
        canCreateDispatch({ tc: item.tc, activeCardId: guard?.activeCardId ?? null, deliveredCardId: guard?.deliveredCardId ?? null });
      } catch (error) {
        if (error instanceof DispatchConflictError) throw new CardImportConflictError(error.code);
        throw error;
      }

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
      await tx.cardImportRow.create({ data: { batchId: input.batchId, cardId: card.id, sourceRow: item.sourceRowNumber, sourceKey: item.sourceRecordKey, outcome: "CREATED" } });
      created += 1;
    }

    await tx.cardImportBatch.update({
      where: { id: input.batchId },
      data: { status: "COMPLETED", rowCount: input.rows.length + input.rejectedRows.length, createdCount: created, updatedCount: updated, skippedCount: skipped, rejectedCount: input.rejectedRows.length, completedAt: new Date() },
    });
    return { created, updated, skipped, rejected: input.rejectedRows.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
    const customer = await prisma.customer.upsert({
      where: { cedula: item.cedula },
      update: {
        nombre: item.nombre,
        telefonosRaw: item.telefonosRaw || undefined,
        direccionRaw: item.direccionRaw || undefined,
        provincia: item.provincia,
        zona: item.zona,
      },
      create: {
        cedula: item.cedula,
        nombre: item.nombre,
        telefonosRaw: item.telefonosRaw,
        direccionRaw: item.direccionRaw,
        provincia: item.provincia,
        zona: item.zona,
      },
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
    const customer = await prisma.customer.upsert({
      where: { cedula: item.cedula },
      update: {
        nombre: item.nombre,
        telefonosRaw: item.telefonosRaw || undefined,
        direccionRaw: item.direccionRaw || undefined,
        provincia: item.provincia,
        zona: item.zona,
      },
      create: {
        cedula: item.cedula,
        nombre: item.nombre,
        telefonosRaw: item.telefonosRaw,
        direccionRaw: item.direccionRaw,
        provincia: item.provincia,
        zona: item.zona,
      },
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
