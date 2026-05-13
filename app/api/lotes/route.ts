import { NextRequest, NextResponse } from "next/server";
import { CardStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { resolveZone } from "@/lib/zone-map";
import { clearUrgencyOnCardClosure } from "@/lib/urgent-alerts";

const createSchema = z.object({
  messengerId: z.string().cuid(),
  sentTo: z.string().min(2),
  fechaEnvio: z.string(),
  fechaRetorno: z.string().optional().nullable(),
  estatus: z.string().min(1).default("EN TRANSITO"),
  notas: z.string().optional(),
  identifiers: z.array(z.string().min(1)).min(1),
});

const lotResultSchema = z.enum([
  "ACUSE_RECIBIDO",
  "DEVUELTA_TIENDA",
  "EN_RUTA",
  "RECIBIDA",
  "RETORNADA",
  "PENDIENTE",
]);

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE_ITEM_RESULT"),
    lotItemId: z.string().cuid(),
    result: lotResultSchema,
    comentario: z.string().optional(),
  }),
  z.object({
    action: z.literal("SCAN_ITEM"),
    lotId: z.string().cuid(),
    identifier: z.string().min(1),
    result: lotResultSchema.default("ACUSE_RECIBIDO"),
    comentario: z.string().optional(),
  }),
  z.object({
    action: z.literal("UPDATE_LOT_STATUS"),
    lotId: z.string().cuid(),
    estatus: z.string().min(1),
    fechaRetorno: z.string().optional().nullable(),
    notas: z.string().optional(),
  }),
]);

function toTruthyValue(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized === "SI" || normalized === "YES" || normalized === "TRUE" || normalized === "1";
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parsePagination(request: NextRequest) {
  const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(request.nextUrl.searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, Math.trunc(pageSizeRaw))) : 20;
  return { page, pageSize };
}

type LotLifecycleResult = "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA" | "EN_RUTA";

function normalizeLotResult(value: z.infer<typeof lotResultSchema>): LotLifecycleResult {
  if (value === "ACUSE_RECIBIDO" || value === "RECIBIDA") return "ACUSE_RECIBIDO";
  if (value === "DEVUELTA_TIENDA" || value === "RETORNADA") return "DEVUELTA_TIENDA";
  return "EN_RUTA";
}

async function generateLotNumber(fechaEnvio: Date) {
  const y = fechaEnvio.getFullYear();
  const m = String(fechaEnvio.getMonth() + 1).padStart(2, "0");
  const d = String(fechaEnvio.getDate()).padStart(2, "0");
  const prefix = `LOTE-${y}${m}${d}`;

  const last = await prisma.lot.findFirst({
    where: { lotNumber: { startsWith: `${prefix}-` } },
    orderBy: { lotNumber: "desc" },
    select: { lotNumber: true },
  });

  const nextSeq = last?.lotNumber
    ? (Number(last.lotNumber.split("-").pop() ?? "0") || 0) + 1
    : 1;
  return `${prefix}-${String(nextSeq).padStart(3, "0")}`;
}

async function applyLotItemResult(
  tx: Prisma.TransactionClient,
  input: {
    itemId: string;
    result: z.infer<typeof lotResultSchema>;
    comentario?: string;
  },
  byUserId?: string,
) {
  const item = await tx.lotItem.findUnique({
    where: { id: input.itemId },
    include: { card: true, lot: true },
  });
  if (!item) {
    throw new Error("LOT_ITEM_NOT_FOUND");
  }

  const lifecycleResult = normalizeLotResult(input.result);
  const nextRecibida = lifecycleResult === "ACUSE_RECIBIDO" ? "SI" : null;
  const nextRetornada = lifecycleResult === "DEVUELTA_TIENDA" ? "SI" : null;
  const trimmedComment = input.comentario?.trim();
  const fallbackReason = item.card?.returnReason?.trim();
  const returnReason = trimmedComment || fallbackReason || null;

  if (lifecycleResult === "DEVUELTA_TIENDA" && !returnReason) {
    throw new Error("RETURN_REASON_REQUIRED");
  }

  await tx.lotItem.update({
    where: { id: item.id },
    data: {
      recibida: nextRecibida,
      retornada: nextRetornada,
    },
  });

  if (item.cardId && item.card) {
    const nextStatus =
      lifecycleResult === "ACUSE_RECIBIDO"
        ? CardStatus.ACUSE_RECIBIDO
        : lifecycleResult === "DEVUELTA_TIENDA"
          ? CardStatus.DEVUELTA_TIENDA
          : CardStatus.EN_RUTA;

    if (lifecycleResult !== "EN_RUTA" || item.card.status !== nextStatus || input.comentario) {
      await tx.cardStatusLog.create({
        data: {
          cardId: item.cardId,
          fromStatus: item.card.status,
          toStatus: nextStatus,
          note:
            lifecycleResult === "ACUSE_RECIBIDO"
              ? input.comentario || `Acuse recibido por lote ${item.lot.lotNumber}`
              : lifecycleResult === "DEVUELTA_TIENDA"
                ? input.comentario || `Tarjeta devuelta a tienda por lote ${item.lot.lotNumber}`
                : input.comentario || `Actualizada por lote ${item.lot.lotNumber}`,
          byUserId,
        },
      });
    }

    const metadataRoot = asRecord(item.card.metadata);
    const routeMeta = asRecord(metadataRoot.route);

    await tx.card.update({
      where: { id: item.cardId },
      data: {
        status: nextStatus,
        returnReason: lifecycleResult === "DEVUELTA_TIENDA" ? returnReason : null,
        currentMessengerId: item.card.currentMessengerId,
        metadata: {
          ...metadataRoot,
          route: {
            ...routeMeta,
            result: lifecycleResult,
            comentario: returnReason ?? "",
            lotId: item.lotId,
            updatedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });

    await clearUrgencyOnCardClosure({
      tx,
      cardId: item.cardId,
      nextStatus,
      byUserId,
    });
  }

  return { itemId: item.id, lotId: item.lotId, tc: item.tc };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const date = request.nextUrl.searchParams.get("date");
  const status = request.nextUrl.searchParams.get("status");
  const { page, pageSize } = parsePagination(request);
  const where: Prisma.LotWhereInput = {
    ...(status && status !== "ALL" ? { estatus: status } : {}),
    ...(date
      ? (() => {
          const start = new Date(date);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);
          return { fechaEnvio: { gte: start, lt: end } };
        })()
      : {}),
  };

  const [lots, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      include: {
        items: {
          include: {
            card: { include: { customer: true } },
          },
        },
      },
      orderBy: [{ fechaEnvio: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lot.count({ where }),
  ]);

  const rows = lots.map((lot) => {
    const total = lot.items.length;
    const routeResult = (item: typeof lot.items[number]) => {
      const root = asRecord(item.card?.metadata);
      const route = asRecord(root.route);
      return typeof route.result === "string" ? route.result : "";
    };
    const recibidas = lot.items.filter(
      (item) => toTruthyValue(item.recibida) || routeResult(item) === "ACUSE_RECIBIDO",
    ).length;
    const retornadas = lot.items.filter(
      (item) => toTruthyValue(item.retornada) || routeResult(item) === "DEVUELTA_TIENDA",
    ).length;
    return {
      ...lot,
      stats: {
        total,
        recibidas,
        retornadas,
        pendientes: Math.max(0, total - recibidas - retornadas),
      },
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return NextResponse.json({
    lots: rows,
    pagination: { page, pageSize, total, totalPages },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const identifiers = (parsed.data.identifiers ?? [])
    .map((identifier) => identifier.trim())
    .filter(Boolean);
  const uniqueIdentifiers = [...new Set(identifiers)];
  const fechaEnvio = new Date(parsed.data.fechaEnvio);
  if (Number.isNaN(fechaEnvio.getTime())) {
    return NextResponse.json({ error: "fechaEnvio invalida" }, { status: 400 });
  }

  const [messenger, cards, provinceConfigs, lotNumber] = await Promise.all([
    prisma.messenger.findUnique({ where: { id: parsed.data.messengerId } }),
    prisma.card.findMany({
      where: {
        OR: uniqueIdentifiers.flatMap((identifier) => [
          { id: identifier },
          { tc: identifier },
          { externalReference: identifier },
          { customer: { cedula: identifier } },
        ]),
      },
      include: { customer: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.provinceConfig.findMany({ where: { active: true }, select: { nombre: true, zona: true } }),
    generateLotNumber(fechaEnvio),
  ]);

  if (!messenger) {
    return NextResponse.json({ error: "Mensajero no encontrado" }, { status: 404 });
  }

  const provinceToZone = new Map(provinceConfigs.map((row) => [normalizeKey(row.nombre), row.zona]));
  const sentTo = parsed.data.sentTo.trim();
  const zoneForDestination =
    provinceToZone.get(normalizeKey(sentTo)) ?? resolveZone(sentTo, "Metro");

  const lot = await prisma.$transaction(async (tx) => {
    const usedCardIds = new Set<string>();
    const created = await tx.lot.create({
      data: {
        lotNumber,
        enviadoA: messenger.nombre,
        sentTo,
        fechaEnvio,
        fechaRetorno: parsed.data.fechaRetorno ? new Date(parsed.data.fechaRetorno) : null,
        estatus: parsed.data.estatus,
        notas: parsed.data.notas,
        items: {
          create: uniqueIdentifiers.map((identifier) => {
            const card = cards.find((item) => {
              if (usedCardIds.has(item.id)) return false;
              return (
                item.id === identifier ||
                item.tc === identifier ||
                item.externalReference === identifier ||
                item.customer.cedula === identifier
              );
            });
            if (card) {
              usedCardIds.add(card.id);
            }

            return {
              cardId: card?.id,
              tc: card?.tc ?? identifier,
              cedula: card?.customer.cedula ?? null,
              telefono: card?.customer.telefonosRaw ?? null,
            };
          }),
        },
      },
      include: {
        items: {
          include: { card: { include: { customer: true } } },
        },
      },
    });

    const assignedCards = created.items
      .map((item) => item.card)
      .filter((card): card is NonNullable<(typeof created.items)[number]["card"]> => Boolean(card));

    for (const card of assignedCards) {
      await tx.card.update({
        where: { id: card.id },
        data: {
          status: CardStatus.ENVIADA_INTERIOR,
          provincia: sentTo,
          zona: zoneForDestination,
          currentMessengerId: messenger.id,
        },
      });
      await tx.cardStatusLog.create({
        data: {
          cardId: card.id,
          fromStatus: card.status,
          toStatus: CardStatus.ENVIADA_INTERIOR,
          note: `Enviada a interior en lote ${lotNumber} (${messenger.nombre})`,
          byUserId: auth.session.user.id,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        entity: "LOT",
        entityId: created.id,
        action: "CREATE",
        userId: auth.session.user.id,
        details: {
          lotNumber: created.lotNumber,
          items: created.items.length,
          messengerId: messenger.id,
          sentTo,
        } as Prisma.InputJsonValue,
      },
    });

    return created;
  });

  return NextResponse.json({ lot }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "MENSAJERO"]);
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const payload = parsed.data;

  switch (payload.action) {
    case "UPDATE_ITEM_RESULT": {
      try {
        const result = await prisma.$transaction((tx) =>
          applyLotItemResult(
            tx,
            { itemId: payload.lotItemId, result: payload.result, comentario: payload.comentario },
            auth.session.user.id,
          ),
        );
        return NextResponse.json({ updated: true, ...result });
      } catch (error) {
        if (error instanceof Error && error.message === "LOT_ITEM_NOT_FOUND") {
          return NextResponse.json({ error: "Item de lote no encontrado" }, { status: 404 });
        }
        if (error instanceof Error && error.message === "RETURN_REASON_REQUIRED") {
          return NextResponse.json(
            { error: "Motivo de devolucion requerido para marcar tarjeta devuelta a tienda" },
            { status: 400 },
          );
        }
        throw error;
      }
    }
    case "SCAN_ITEM": {
      const lot = await prisma.lot.findUnique({
        where: { id: payload.lotId },
        include: { items: true },
      });
      if (!lot) {
        return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
      }

      const identifier = payload.identifier.trim();
      const digits = identifier.replace(/\D/g, "");
      const item = lot.items.find((row) => {
        return (
          row.id === identifier ||
          row.tc === identifier ||
          row.cedula === identifier ||
          (row.cedula?.replace(/\D/g, "") === digits && digits.length > 0)
        );
      });
      if (!item) {
        return NextResponse.json({ error: "Tarjeta no encontrada en lote" }, { status: 404 });
      }

      try {
        const result = await prisma.$transaction((tx) =>
          applyLotItemResult(
            tx,
            { itemId: item.id, result: payload.result, comentario: payload.comentario },
            auth.session.user.id,
          ),
        );

        return NextResponse.json({
          scanned: { itemId: item.id, tc: item.tc, cedula: item.cedula },
          ...result,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "RETURN_REASON_REQUIRED") {
          return NextResponse.json(
            { error: "Motivo de devolucion requerido para marcar tarjeta devuelta a tienda" },
            { status: 400 },
          );
        }
        throw error;
      }
    }
    case "UPDATE_LOT_STATUS": {
      const lot = await prisma.lot.update({
        where: { id: payload.lotId },
        data: {
          estatus: payload.estatus,
          fechaRetorno: payload.fechaRetorno ? new Date(payload.fechaRetorno) : null,
          notas: payload.notas,
        },
      });
      return NextResponse.json({ lot });
    }
  }
}
