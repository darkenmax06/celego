import { NextRequest, NextResponse } from "next/server";
import { CardProductType, CardStatus, Prisma, RouteStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { remainingBusinessDays } from "@/lib/sla";

const TERMINAL_STATUSES: CardStatus[] = [
  CardStatus.ENTREGADA,
  CardStatus.ENTREGA_DIGITAL,
  CardStatus.RETORNADA,
  CardStatus.ACUSE_RECIBIDO,
  CardStatus.DEVUELTA_TIENDA,
];

const candidateSchema = z.object({
  identifiers: z.array(z.string().trim().min(1)).max(500).optional().default([]),
  productType: z.nativeEnum(CardProductType).optional(),
  provincia: z.string().trim().min(1).optional(),
  zona: z.string().trim().min(1).optional(),
  status: z.nativeEnum(CardStatus).optional(),
  messengerId: z.string().cuid().optional(),
  urgent: z.boolean().optional(),
  remote: z.boolean().optional(),
  minRemainingDays: z.number().int().min(-365).max(365).optional(),
  maxRemainingDays: z.number().int().min(-365).max(365).optional(),
  page: z.number().int().min(1).max(100000).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(25),
});

type CandidateCard = {
  id: string;
  tc: string | null;
  requestNumber: string | null;
  externalReference: string | null;
  productType: CardProductType;
  status: CardStatus;
  provincia: string;
  zona: string;
  urgent: boolean;
  isRemote: boolean;
  dispatchDate: Date | null;
  slaDueDate: Date | null;
  currentMessenger: { id: string; nombre: string } | null;
  customer: { nombre: string; cedula: string };
  routeItems: { route: { id: string; status: RouteStatus } }[];
};

function parseQuery(request: NextRequest) {
  const source = request.nextUrl.searchParams;
  return candidateSchema.safeParse({
    productType: source.get("productType") || undefined,
    provincia: source.get("provincia") || undefined,
    zona: source.get("zona") || undefined,
    status: source.get("status") || undefined,
    messengerId: source.get("messengerId") || undefined,
    urgent: source.get("urgent") === null ? undefined : source.get("urgent") === "1",
    remote: source.get("remote") === null ? undefined : source.get("remote") === "1",
    minRemainingDays: source.get("minRemainingDays") ? Number(source.get("minRemainingDays")) : undefined,
    maxRemainingDays: source.get("maxRemainingDays") ? Number(source.get("maxRemainingDays")) : undefined,
    page: source.get("page") ? Number(source.get("page")) : 1,
    pageSize: source.get("pageSize") ? Number(source.get("pageSize")) : 25,
  });
}

function identifierFor(card: Pick<CandidateCard, "productType" | "tc" | "requestNumber">) {
  return card.productType === CardProductType.DEBITO ? card.requestNumber ?? "" : card.tc ?? "";
}

function serializeCard(card: CandidateCard) {
  const activeRoute = card.routeItems.find((item) =>
    item.route.status === RouteStatus.PENDIENTE || item.route.status === RouteStatus.EN_PROCESO,
  );
  const daysRemaining = card.slaDueDate
    ? remainingBusinessDays(new Date(), card.slaDueDate)
    : null;
  return {
    id: card.id,
    productType: card.productType,
    identifier: identifierFor(card),
    tc: card.tc,
    requestNumber: card.requestNumber,
    externalReference: card.externalReference,
    status: card.status,
    provincia: card.provincia,
    zona: card.zona,
    urgent: card.urgent,
    remote: card.isRemote,
    dispatchDate: card.dispatchDate?.toISOString() ?? null,
    slaDueDate: card.slaDueDate?.toISOString() ?? null,
    remainingBusinessDays: daysRemaining,
    customer: card.customer,
    messenger: card.currentMessenger,
    activeRouteId: activeRoute?.route.id ?? null,
    eligible: !TERMINAL_STATUSES.includes(card.status) && !activeRoute,
    reason: TERMINAL_STATUSES.includes(card.status)
      ? "ESTADO_TERMINAL"
      : activeRoute
        ? "YA_ASIGNADA"
        : null,
  };
}

function matchesIdentifier(card: CandidateCard, identifier: string) {
  const digits = identifier.replace(/\D/g, "");
  return (
    card.id === identifier ||
    card.tc === identifier ||
    card.requestNumber === identifier ||
    card.externalReference === identifier ||
    card.customer.cedula === identifier ||
    (digits.length > 0 && card.customer.cedula.replace(/\D/g, "") === digits)
  );
}

const include = {
  customer: { select: { nombre: true, cedula: true } },
  currentMessenger: { select: { id: true, nombre: true } },
  routeItems: {
    where: { route: { status: { in: [RouteStatus.PENDIENTE, RouteStatus.EN_PROCESO] } } },
    select: { route: { select: { id: true, status: true } } },
  },
} satisfies Prisma.CardInclude;

async function findCandidates(filters: z.infer<typeof candidateSchema>) {
  const where: Prisma.CardWhereInput = {
    ...(filters.productType ? { productType: filters.productType } : {}),
    ...(filters.provincia ? { provincia: filters.provincia } : {}),
    ...(filters.zona ? { zona: filters.zona } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.messengerId ? { currentMessengerId: filters.messengerId } : {}),
    ...(filters.urgent === undefined ? {} : { urgent: filters.urgent }),
    ...(filters.remote === undefined ? {} : { isRemote: filters.remote }),
  };
  return prisma.card.findMany({ where, include, orderBy: [{ slaDueDate: "asc" }, { updatedAt: "desc" }] });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "MENSAJERO"]);
  if ("error" in auth) return auth.error;
  const parsed = parseQuery(request);
  if (!parsed.success) return NextResponse.json({ error: "Filtros invalidos" }, { status: 400 });

  const cards = await findCandidates(parsed.data);
  const filtered = cards
    .map(serializeCard)
    .filter((card) =>
      (parsed.data.minRemainingDays === undefined || (card.remainingBusinessDays ?? Number.POSITIVE_INFINITY) >= parsed.data.minRemainingDays) &&
      (parsed.data.maxRemainingDays === undefined || (card.remainingBusinessDays ?? Number.NEGATIVE_INFINITY) <= parsed.data.maxRemainingDays),
    );
  const start = (parsed.data.page - 1) * parsed.data.pageSize;
  return NextResponse.json({
    candidates: filtered.slice(start, start + parsed.data.pageSize),
    pagination: {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / parsed.data.pageSize)),
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;
  const parsed = candidateSchema.safeParse(await request.json());
  if (!parsed.success || !parsed.data.identifiers.length) {
    return NextResponse.json({ error: "Indica al menos un identificador valido" }, { status: 400 });
  }

  const cards = await findCandidates(parsed.data);
  const byIdentifier = parsed.data.identifiers.map((identifier) => {
    const candidates = cards.filter((card) => matchesIdentifier(card, identifier)).map(serializeCard);
    const eligible = candidates.filter((card) => card.eligible);
    const classification = candidates.length === 0
      ? "NO_ENCONTRADO"
      : eligible.length === 0
        ? candidates.some((card) => card.reason === "YA_ASIGNADA") ? "YA_ASIGNADA" : "NO_ELEGIBLE"
        : eligible.length === 1
          ? "ENCONTRADO"
          : "AMBIGUO";
    return { identifier, classification, candidates };
  });

  const seen = new Set<string>();
  const duplicateCardIds = new Set<string>();
  for (const item of byIdentifier) {
    for (const candidate of item.candidates.filter((candidate) => candidate.eligible)) {
      if (seen.has(candidate.id)) duplicateCardIds.add(candidate.id);
      seen.add(candidate.id);
    }
  }
  return NextResponse.json({
    items: byIdentifier,
    summary: {
      found: byIdentifier.filter((item) => item.classification === "ENCONTRADO").length,
      ambiguous: byIdentifier.filter((item) => item.classification === "AMBIGUO").length,
      notFound: byIdentifier.filter((item) => item.classification === "NO_ENCONTRADO").length,
      alreadyAssigned: byIdentifier.filter((item) => item.classification === "YA_ASIGNADA").length,
      notEligible: byIdentifier.filter((item) => item.classification === "NO_ELEGIBLE").length,
      duplicates: duplicateCardIds.size,
    },
  });
}
