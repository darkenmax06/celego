import { CardStatus, Prisma } from "@prisma/client";
import { ZONAS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { addBusinessDaysStrict } from "@/lib/sla";
import { toCardStatus } from "@/lib/card-status";
import { type ParsedCardRow } from "@/lib/importers/cards";
import { resolveZone } from "@/lib/zone-map";
import { normalizeText } from "@/lib/utils";
import { recalculateAdditionalCardsForGroups } from "@/lib/card-additional";
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

    const existing = await prisma.card.findFirst({
      where: {
        tc: item.tc,
        productType: "CREDITO",
        customerId: customer.id,
        dispatchDate: item.fechaDespacho ?? undefined,
      },
    });

    if (existing) {
      await prisma.$transaction(async (tx) => {
        return applyCardTransition({
          tx,
          card: existing,
          nextStatus: status,
          byUserId,
          note: "Actualizacion por importacion",
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
    status === CardStatus.ENTREGA_DIGITAL
  ) {
    return "COMPLETADA" as const;
  }
  if (status === CardStatus.EN_RUTA) {
    return "EN_PROCESO" as const;
  }
  return "PENDIENTE" as const;
}
