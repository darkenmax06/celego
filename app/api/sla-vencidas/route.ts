import { NextRequest, NextResponse } from "next/server";
import { CardProductType, CardStatus } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { isUpcomingWithinWarning, serializeSlaCard, slaWhere, type SlaTab } from "./shared";

function positiveInt(raw: string | null, fallback: number, max: number) {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(1, Math.trunc(value))) : fallback;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const params = request.nextUrl.searchParams;
  const rawTab = params.get("tab");
  const tab: SlaTab = rawTab === "UPCOMING" ? "UPCOMING" : "OVERDUE";
  const rawProductType = params.get("productType");
  const rawStatus = params.get("status");
  if (
    (rawProductType && rawProductType !== "ALL" && !(rawProductType in CardProductType)) ||
    (rawStatus && rawStatus !== "ALL" && !(rawStatus in CardStatus))
  ) {
    return NextResponse.json({ error: "Filtros invalidos" }, { status: 400 });
  }

  const page = positiveInt(params.get("page"), 1, 100000);
  const pageSize = positiveInt(params.get("pageSize"), 25, 100);
  const messengerId = params.get("messengerId");
  const filters = {
    tab,
    productType: rawProductType && rawProductType !== "ALL" ? (rawProductType as CardProductType) : undefined,
    messengerId: messengerId && messengerId !== "ALL" ? messengerId : undefined,
    provincia: params.get("provincia") || undefined,
    zona: params.get("zona") || undefined,
    status: rawStatus && rawStatus !== "ALL" ? (rawStatus as CardStatus) : undefined,
    q: params.get("q") || undefined,
  };
  const [config, messengers] = await Promise.all([
    prisma.sLAConfig.findUnique({ where: { id: "default" }, select: { warningBusinessDays: true } }),
    prisma.messenger.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  const warningBusinessDays = config?.warningBusinessDays ?? 3;
  const where = slaWhere(filters);

  // La ventana de proximidad se calcula con dias laborables, por lo que se filtra
  // despues de leer las fechas SLA. La respuesta devuelve una sola pagina al cliente.
  const cards = await prisma.card.findMany({
    where,
    select: {
      id: true, tc: true, requestNumber: true, productType: true, status: true,
      slaDueDate: true, dispatchDate: true, provincia: true, zona: true, urgent: true,
      isAdditional: true, additionalIndex: true,
      customer: { select: { nombre: true, cedula: true, direccionRaw: true, telefonosRaw: true } },
      currentMessenger: { select: { id: true, nombre: true } },
      lastAssignedMessenger: { select: { id: true, nombre: true } },
    },
    orderBy: [{ slaDueDate: "asc" }, { updatedAt: "desc" }],
  });
  const normalized = cards.map(serializeSlaCard).filter((card) =>
    tab !== "UPCOMING" || isUpcomingWithinWarning(card.slaDueDate ? new Date(card.slaDueDate) : null, warningBusinessDays),
  );
  const start = (page - 1) * pageSize;
  const rows = normalized.slice(start, start + pageSize);
  const byProduct = normalized.reduce<Record<string, number>>((totals, card) => {
    totals[card.productType] = (totals[card.productType] ?? 0) + 1;
    return totals;
  }, {});

  return NextResponse.json({
    filters: { ...filters, messengerId: filters.messengerId ?? "ALL", tab },
    messengers,
    warningBusinessDays,
    total: normalized.length,
    totalsByProduct: byProduct,
    pagination: { page, pageSize, total: normalized.length, totalPages: Math.max(1, Math.ceil(normalized.length / pageSize)) },
    rows,
  });
}
