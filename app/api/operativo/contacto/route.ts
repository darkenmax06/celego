import { NextRequest, NextResponse } from "next/server";
import { CardProductType, CardStatus, Prisma, SLAExtensionRequestStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { addBusinessDaysStrict } from "@/lib/sla";
import { resolveZone } from "@/lib/zone-map";
import { buildListEnvelope, compile, ListQueryValidationError } from "@/lib/list-query";
import { compileCardDateRangeWhere } from "@/lib/list-query/card-date-range";
import { operativoContactoListQuery } from "@/lib/list-query/descriptors/operativo-contacto";
import { compileCardGroupWhere } from "@/lib/list-query/card-group-where";
import { SLA_CLOSED_STATUSES } from "@/lib/list-query/descriptors/sla-vencidas";
import {
  clampUrgencyLevel,
  emitDueUrgentNotifications,
  urgencyIntervalMinutes,
  urgencyLevelLabel,
} from "@/lib/urgent-alerts";
import {
  asRecord,
  mapCardToOperativeRow,
  matchesStatusFilter,
  normalizePhones,
  parseMetadataPhones,
  splitPhonesFromRaw,
  splitTextChunks,
  type ActiveUrgentCaseSnapshot,
} from "@/lib/operativo-row";
import { applyCardTransition } from "@/lib/card-transition";
import { ASIGNADO_PARAM, buildAsignadoWhere, CALL_ASSIGNMENT_SELECT } from "@/lib/call-assignment";
import {
  PHONE_CALL_STATES,
  resolveContactResultado,
  resolveReturnStatus,
  CONTACTED_CALL_PHONE_REQUIRED_MESSAGE,
  validateContactedCall,
  validateNoContactPhones,
} from "@/lib/contact-call";

const phoneSchema = z.object({
  num: z.string().min(3).max(32),
  principal: z.boolean().optional(),
  funciona: z.boolean().optional(),
  comentario: z.string().max(255).optional(),
});

const postSchema = z.object({
  cardId: z.string().cuid(),
  telefonos: z.array(phoneSchema).max(20).optional(),
  telefonosUsados: z.string().max(255).optional(),
  comentario: z.string().max(1500).optional(),
  contactado: z.boolean().default(true),
  canalContacto: z.enum(["WHATSAPP", "LLAMADA_DIRECTA"]).optional().nullable(),
  nuevaDireccion: z.string().max(500).optional().nullable(),
  fechaPreferenciaEntrega: z.string().max(50).optional().nullable(),
  solicitudRetorno: z.boolean().optional(),
  motivoRetorno: z.string().max(500).optional().nullable(),
  trasladoProvincia: z.string().max(100).optional().nullable(),
  trasladoMotivo: z.string().max(500).optional().nullable(),
  telefonosDetalle: z
    .array(
      z.object({
        numero: z.string().trim().min(1).max(32),
        estado: z.enum(PHONE_CALL_STATES).optional().nullable(),
        nota: z.string().max(500).optional().nullable(),
      }),
    )
    .max(20)
    .optional(),
  motivoNoContacto: z.string().max(500).optional().nullable(),
});

/** `contactoEstado` facet value -> legacy `gestion` filter of the activos tab. */
const GESTION_BY_CONTACTO_ESTADO: Record<string, string> = {
  CONTACTADA: "contactadas",
  NO_CONTACTADA: "no-contactadas",
  TRASLADO_SOLICITADO: "traslados",
  RETORNO_SOLICITADO: "retorno",
};

/** Parses `YYYY-MM-DD` (or any ISO string) into a UTC date; invalid / empty -> null. */
function parseDateOnly(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  await emitDueUrgentNotifications({
    byUserId: auth.session.user.id,
    limit: 20,
  });

  const tabParam = request.nextUrl.searchParams.get("tab");
  const tab =
    tabParam === "urgentes" ||
    tabParam === "contactadas" ||
    tabParam === "no-contactadas" ||
    tabParam === "traslados" ||
    tabParam === "retorno"
      ? tabParam
      : "activos";

  const provincia = request.nextUrl.searchParams.get("provincia");
  const zona = request.nextUrl.searchParams.get("zona");
  const statusFilter = request.nextUrl.searchParams.get("status");
  const canalContacto = request.nextUrl.searchParams.get("canalContacto");
  // Calls overhaul: the shared "llamadas" facet set sends `contactoEstado`
  // (same values as SLA vencidas); it maps onto this route's `gestion`.
  const gestion =
    request.nextUrl.searchParams.get("gestion") ??
    GESTION_BY_CONTACTO_ESTADO[request.nextUrl.searchParams.get("contactoEstado") ?? ""] ??
    null;
  const urgentParam = request.nextUrl.searchParams.get("urgent");
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const daysRaw = Number(request.nextUrl.searchParams.get("days") ?? 3);
  const days = Number.isFinite(daysRaw) ? Math.min(10, Math.max(1, Math.trunc(daysRaw))) : 3;
  const { page, pageSize } = compile(operativoContactoListQuery, request.nextUrl.searchParams);
  // This route builds its `where` by hand in three tab branches, so the group
  // clause is compiled ONCE here and reused. Do not inline it per branch: the
  // whole point of the shared helper is that the tabs cannot disagree.
  const groupWhere = compileCardGroupWhere(request.nextUrl.searchParams);
  // Same idea for the `date.<field>.from|to` card date ranges: compiled once,
  // AND-combined into every tab branch.
  let dateClauses: Prisma.CardWhereInput[];
  try {
    dateClauses = compileCardDateRangeWhere(request.nextUrl.searchParams).clauses;
  } catch (error) {
    if (error instanceof ListQueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  // Calls overhaul: `asignado` (ME | SIN_ASIGNAR | userId), compiled once like the group clause.
  const asignadoWhere = buildAsignadoWhere(
    request.nextUrl.searchParams.get(ASIGNADO_PARAM),
    auth.session.user.id,
  );

  // Calls overhaul: `productType` / `messengerId` facets, shared by every tab.
  const productTypeParam = request.nextUrl.searchParams.get("productType");
  const messengerIdParam = request.nextUrl.searchParams.get("messengerId");
  const facetWhere: Prisma.CardWhereInput[] = [];
  if (productTypeParam === CardProductType.CREDITO || productTypeParam === CardProductType.DEBITO) {
    facetWhere.push({ productType: productTypeParam });
  }
  if (messengerIdParam && messengerIdParam !== "ALL") {
    facetWhere.push({ currentMessengerId: messengerIdParam });
  }

  const provinciaList = provincia && provincia !== "ALL"
    ? provincia.split(",").map((p) => p.trim()).filter(Boolean)
    : [];
  const zonaList = zona && zona !== "ALL"
    ? zona.split(",").map((z) => z.trim()).filter(Boolean)
    : [];
  const statusList = statusFilter && statusFilter !== "ALL"
    ? statusFilter.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (statusFilter && statusFilter !== "ALL") {
    const validStatuses = Object.values(CardStatus) as string[];
    const parsedStatuses = statusFilter.split(",").map((s) => s.trim()).filter(Boolean);
    const matched = parsedStatuses.filter((s) => validStatuses.includes(s));
    if (parsedStatuses.length > 0 && matched.length === 0) {
      return NextResponse.json({
        tab,
        cards: [],
        pagination: buildListEnvelope({ page, pageSize, total: 0 }),
      });
    }
  }

  const activeClosedStatuses = [...SLA_CLOSED_STATUSES];

  if (tab === "activos") {
    const maxDueDate = addBusinessDaysStrict(new Date(), days);

    const andClauses: Prisma.CardWhereInput[] = [
      statusList.length
        ? { status: { in: statusList as CardStatus[] } }
        : { status: { notIn: activeClosedStatuses } },
    ];
    if (provinciaList.length) {
      andClauses.push(
        provinciaList.length === 1 ? { provincia: provinciaList[0] } : { provincia: { in: provinciaList } },
      );
    }
    if (zonaList.length) {
      andClauses.push(
        zonaList.length === 1 ? { zona: zonaList[0] } : { zona: { in: zonaList } },
      );
    }
    if (q) {
      andClauses.push({
        OR: [
          { tc: { contains: q, mode: "insensitive" } },
          { externalReference: { contains: q, mode: "insensitive" } },
          { customer: { cedula: { contains: q, mode: "insensitive" } } },
          { customer: { nombre: { contains: q, mode: "insensitive" } } },
        ],
      });
    }
    if (urgentParam === "1") {
      andClauses.push({ urgent: true });
    }
    if (groupWhere) {
      andClauses.push(groupWhere);
    }
    andClauses.push(...dateClauses);
    if (asignadoWhere) {
      andClauses.push(asignadoWhere);
    }
    andClauses.push(...facetWhere);
    andClauses.push({ OR: [{ slaDueDate: null }, { slaDueDate: { lte: maxDueDate } }] });

    const where: Prisma.CardWhereInput = { AND: andClauses };

    const hasInMemoryFilter =
      (Boolean(canalContacto) && canalContacto !== "ALL") || (Boolean(gestion) && gestion !== "ALL");

    const [cards, totalCount] = await Promise.all([
      prisma.card.findMany({
        where,
        include: {
          customer: true,
          currentMessenger: { select: { nombre: true, telefono: true } },
          callAssignment: CALL_ASSIGNMENT_SELECT,
          _count: { select: { contacts: true } },
          contacts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { comentario: true, contactado: true, telefonosUsados: true },
          },
          // Bare group ids only, on ALL THREE tab branches. Clients resolve
          // id -> name through `lib/use-card-groups.ts`. Same shape as
          // `app/api/urgentes/route.ts`. Missing it on one branch silently
          // breaks grouping on that tab only.
          groupMemberships: { select: { groupId: true } },
        },
        orderBy: [{ urgent: "desc" }, { slaDueDate: "asc" }, { updatedAt: "desc" }],
        skip: hasInMemoryFilter ? 0 : (page - 1) * pageSize,
        take: hasInMemoryFilter ? 1000 : pageSize,
      }),
      hasInMemoryFilter ? Promise.resolve(0) : prisma.card.count({ where }),
    ]);

    const cardIds = cards.map((item) => item.id);
    const activeCases = cardIds.length
      ? await prisma.urgentCase.findMany({
          where: {
            cardId: { in: cardIds },
            resolvedAt: null,
          },
          orderBy: [{ level: "desc" }, { importedAt: "desc" }],
          select: {
            id: true,
            cardId: true,
            level: true,
            lastNotifiedAt: true,
            nextNotificationAt: true,
          },
        })
      : [];
    const activeCaseByCard = new Map<string, ActiveUrgentCaseSnapshot>();
    for (const item of activeCases) {
      if (!item.cardId || activeCaseByCard.has(item.cardId)) continue;
      activeCaseByCard.set(item.cardId, {
        id: item.id,
        level: item.level,
        lastNotifiedAt: item.lastNotifiedAt,
        nextNotificationAt: item.nextNotificationAt,
      });
    }

    let rows = cards.map((card) => mapCardToOperativeRow(card, activeCaseByCard.get(card.id) ?? null));

    if (canalContacto && canalContacto !== "ALL") {
      rows = rows.filter((r) => r.canalContacto === canalContacto);
    }

    if (gestion && gestion !== "ALL") {
      if (gestion === "contactadas") {
        rows = rows.filter((r) => r.contactado && !r.solicitudRetorno && (!r.traslado || Object.keys(r.traslado).length === 0));
      } else if (gestion === "no-contactadas") {
        rows = rows.filter((r) => !r.contactado && !r.solicitudRetorno && (!r.traslado || Object.keys(r.traslado).length === 0) && r.hasAttempt);
      } else if (gestion === "traslados") {
        rows = rows.filter((r) => r.traslado && Object.keys(r.traslado).length > 0);
      } else if (gestion === "retorno") {
        rows = rows.filter((r) => r.solicitudRetorno);
      }
    }

    const total = hasInMemoryFilter ? rows.length : totalCount;
    const cardsPage = hasInMemoryFilter ? rows.slice((page - 1) * pageSize, page * pageSize) : rows;
    return NextResponse.json({
      tab,
      cards: cardsPage,
      pagination: buildListEnvelope({ page, pageSize, total }),
    });
  }

  if (tab === "contactadas" || tab === "no-contactadas" || tab === "retorno" || tab === "traslados") {
    const where: Prisma.CardWhereInput = {
      AND: [
        statusList.length
          ? { status: { in: statusList as CardStatus[] } }
          : { status: { notIn: activeClosedStatuses } },
        provinciaList.length ? { provincia: { in: provinciaList } } : {},
        zonaList.length ? { zona: { in: zonaList } } : {},
        urgentParam === "1" ? { urgent: true } : {},
        q
          ? {
              OR: [
                { tc: { contains: q, mode: "insensitive" } },
                { externalReference: { contains: q, mode: "insensitive" } },
                { customer: { cedula: { contains: q, mode: "insensitive" } } },
                { customer: { nombre: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {},
        groupWhere ?? {},
        ...dateClauses,
        asignadoWhere ?? {},
        ...facetWhere,
      ],
    };

    const cards = await prisma.card.findMany({
      where,
      include: {
        customer: true,
        currentMessenger: { select: { nombre: true, telefono: true } },
        callAssignment: CALL_ASSIGNMENT_SELECT,
        _count: { select: { contacts: true } },
        contacts: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { comentario: true, contactado: true, telefonosUsados: true },
        },
        // Bare group ids only, on ALL THREE tab branches. Clients resolve
        // id -> name through `lib/use-card-groups.ts`. Same shape as
        // `app/api/urgentes/route.ts`. Missing it on one branch silently
        // breaks grouping on that tab only.
        groupMemberships: { select: { groupId: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 1000,
    });

    let rows = cards
      .map((card) => {
        const root = asRecord(card.metadata);
        const op = asRecord(root.operativo);
        const hasAttempt = card.contacts.length > 0 || Boolean(op.updatedAt) || Boolean(op.comentarioContacto);
        const mapped = mapCardToOperativeRow(card);
        return {
          ...mapped,
          hasAttempt,
        };
      })
      .filter((row) => {
        if (tab === "traslados") {
          return Boolean(row.traslado && Object.keys(row.traslado).length > 0);
        }
        if (tab === "retorno") {
          return Boolean(row.solicitudRetorno);
        }
        if (tab === "contactadas") {
          return (
            Boolean(row.contactado) &&
            !row.solicitudRetorno &&
            (!row.traslado || Object.keys(row.traslado).length === 0)
          );
        }
        // tab === "no-contactadas": Specifically cards that were attempted/called and marked as non-contacted
        return (
          !row.contactado &&
          !row.solicitudRetorno &&
          (!row.traslado || Object.keys(row.traslado).length === 0) &&
          row.hasAttempt
        );
      })
      .filter((row) => matchesStatusFilter(row.status, statusFilter));

    if (canalContacto && canalContacto !== "ALL") {
      rows = rows.filter((r) => r.canalContacto === canalContacto);
    }

    const total = rows.length;
    const cardsPage = rows.slice((page - 1) * pageSize, page * pageSize);
    return NextResponse.json({
      tab,
      cards: cardsPage,
      pagination: buildListEnvelope({ page, pageSize, total }),
    });
  }

  // tab === "urgentes"
  const linkedUrgentCards = await prisma.urgentCase.findMany({
    where: {
      cardId: { not: null },
      resolvedAt: null,
    },
    select: { cardId: true },
    take: 2000,
  });
  const linkedCardIds = [
    ...new Set(
      linkedUrgentCards.map((item) => item.cardId).filter((value): value is string => Boolean(value)),
    ),
  ];

  const urgentMatcher: Prisma.CardWhereInput = linkedCardIds.length
    ? { OR: [{ urgent: true }, { id: { in: linkedCardIds } }] }
    : { urgent: true };

  const where: Prisma.CardWhereInput = {
    AND: [
      urgentMatcher,
      ...(provincia && provincia !== "ALL" ? [{ provincia }] : []),
      ...(q
        ? [
            {
              OR: [
                { tc: { contains: q, mode: "insensitive" } },
                { externalReference: { contains: q, mode: "insensitive" } },
                { customer: { cedula: { contains: q, mode: "insensitive" } } },
                { customer: { nombre: { contains: q, mode: "insensitive" } } },
              ],
            } as Prisma.CardWhereInput,
          ]
        : []),
      ...(groupWhere ? [groupWhere] : []),
      ...dateClauses,
      ...(asignadoWhere ? [asignadoWhere] : []),
      ...facetWhere,
    ],
  };

  const [urgentCards, unresolvedCases] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        customer: true,
        currentMessenger: { select: { nombre: true, telefono: true } },
        callAssignment: CALL_ASSIGNMENT_SELECT,
        _count: { select: { contacts: true } },
        contacts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { comentario: true, contactado: true, telefonosUsados: true },
        },
        // Bare group ids only, on ALL THREE tab branches. Clients resolve
        // id -> name through `lib/use-card-groups.ts`. Same shape as
        // `app/api/urgentes/route.ts`. Missing it on one branch silently
        // breaks grouping on that tab only.
        groupMemberships: { select: { groupId: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
    }),
    // Unlinked urgent cases carry no card dates, so a date filter excludes them.
    dateClauses.length ? Promise.resolve([]) : prisma.urgentCase.findMany({
      where: {
        cardId: null,
        resolvedAt: null,
        ...(provincia && provincia !== "ALL" ? { provincia } : {}),
        ...(q
          ? {
              OR: [
                { tc: { contains: q, mode: "insensitive" } },
                { cedula: { contains: q, mode: "insensitive" } },
                { telefono: { contains: q, mode: "insensitive" } },
                { direccion: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { importedAt: "desc" },
      take: 250,
      select: {
        id: true,
        tc: true,
        cedula: true,
        provincia: true,
        telefono: true,
        status: true,
        direccion: true,
        level: true,
        lastNotifiedAt: true,
        nextNotificationAt: true,
      },
    }),
  ]);

  const urgentCardIds = urgentCards.map((item) => item.id);
  const activeCases = urgentCardIds.length
    ? await prisma.urgentCase.findMany({
        where: {
          cardId: { in: urgentCardIds },
          resolvedAt: null,
        },
        orderBy: [{ level: "desc" }, { importedAt: "desc" }],
        select: {
          id: true,
          cardId: true,
          level: true,
          lastNotifiedAt: true,
          nextNotificationAt: true,
        },
      })
    : [];
  const activeCaseByCard = new Map<string, ActiveUrgentCaseSnapshot>();
  for (const item of activeCases) {
    if (!item.cardId || activeCaseByCard.has(item.cardId)) continue;
    activeCaseByCard.set(item.cardId, {
      id: item.id,
      level: item.level,
      lastNotifiedAt: item.lastNotifiedAt,
      nextNotificationAt: item.nextNotificationAt,
    });
  }

  const cardRows = urgentCards.map((card) => mapCardToOperativeRow(card, activeCaseByCard.get(card.id) ?? null));
  const unresolvedRows = unresolvedCases.map((item) => ({
    id: `urgent-${item.id}`,
    cardId: null,
    urgentCaseId: item.id,
    tc: item.tc,
    requestNumber: null,
    nombre: "SIN NOMBRE",
    cedula: item.cedula,
    provincia: item.provincia || "SIN PROVINCIA",
    zona: resolveZone(item.provincia || "", "Metro"),
    status: item.status || "URGENTE",
    urgent: true,
    urgentLevel: clampUrgencyLevel(item.level ?? 3),
    urgentLabel: urgencyLevelLabel(item.level ?? 3),
    urgentIntervalMinutes: urgencyIntervalMinutes(item.level ?? 3),
    urgentNextNotificationAt: item.nextNotificationAt?.toISOString() ?? null,
    urgentLastNotificationAt: item.lastNotifiedAt?.toISOString() ?? null,
    remaining: null,
    presinto: null,
    fechaDespacho: null,
    slaDueDate: null,
    tipoEmision: null,
    tipoEntrega: null,
    direcciones: splitTextChunks(item.direccion),
    refs: [],
    mensajero: "Sin asignar",
    mensajeroTelefono: null,
    asignadoA: null,
    attempts: 0,
    telefonos: normalizePhones(
      splitPhonesFromRaw(item.telefono).map((num, index) => ({
        num,
        principal: index === 0,
        funciona: false,
        comentario: "",
      })),
    ),
    comentarioContacto: "",
    contactado: false,
    canalContacto: null,
    nuevaDireccion: null,
    fechaPreferenciaEntrega: null,
    solicitudRetorno: false,
    motivoRetorno: null,
    traslado: {},
    // An unresolved urgent case has no `Card`, so it can belong to no group.
    // Kept explicit so both halves of the merged `urgentes` list share one row
    // shape.
    groupIds: [] as string[],
    readOnly: true,
  }));

  const rows = [...cardRows, ...unresolvedRows]
    .filter((row) => matchesStatusFilter(row.status, statusFilter))
    .sort((a, b) => {
      if (a.contactado !== b.contactado) return a.contactado ? 1 : -1;
      const levelA = a.urgentLevel ?? 0;
      const levelB = b.urgentLevel ?? 0;
      if (levelA !== levelB) return levelB - levelA;
      const nextA = a.urgentNextNotificationAt
        ? new Date(a.urgentNextNotificationAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      const nextB = b.urgentNextNotificationAt
        ? new Date(b.urgentNextNotificationAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      if (nextA !== nextB) return nextA - nextB;
      return a.tc.localeCompare(b.tc);
    });

  const total = rows.length;
  const cardsPage = rows.slice((page - 1) * pageSize, page * pageSize);
  return NextResponse.json({
    tab,
    cards: cardsPage,
    pagination: buildListEnvelope({ page, pageSize, total }),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const resultado = resolveContactResultado({
    contactado: parsed.data.contactado,
    solicitudRetorno: parsed.data.solicitudRetorno,
    traslado: Boolean(parsed.data.trasladoProvincia),
  });
  if (resultado === "NO_CONTACTADA") {
    const phoneError = validateNoContactPhones(parsed.data.telefonosDetalle);
    if (phoneError) {
      return NextResponse.json({ error: phoneError }, { status: 400 });
    }
  }

  // An explicit empty list asserts "no phones": reject before touching the DB.
  if (parsed.data.contactado && parsed.data.telefonos?.length === 0) {
    return NextResponse.json({ error: CONTACTED_CALL_PHONE_REQUIRED_MESSAGE }, { status: 400 });
  }

  const card = await prisma.card.findUnique({
    where: { id: parsed.data.cardId },
    include: {
      customer: true,
      currentMessenger: { select: { nombre: true, telefono: true } },
    },
  });
  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }

  const fallbackPhones = normalizePhones(
    splitPhonesFromRaw(card.customer.telefonosRaw).map((num, index) => ({
      num,
      principal: index === 0,
      funciona: false,
      comentario: "",
    })),
  );

  const metadataRoot = asRecord(card.metadata);
  const previousOperativo = asRecord(metadataRoot.operativo);
  const previousPhones = parseMetadataPhones(previousOperativo);

  const normalizedPhones = normalizePhones(
    parsed.data.telefonos && parsed.data.telefonos.length > 0
      ? parsed.data.telefonos
      : previousPhones.length > 0
        ? previousPhones
        : fallbackPhones,
  );
  const comentario = parsed.data.comentario?.trim() ?? "";
  const contactado = parsed.data.contactado;

  // Contacted calls (CONTACTADA, RETORNO, TRASLADO) need a working phone and a
  // channel. Validated before any write so a rejected call leaves no records.
  if (contactado) {
    const contactedError = validateContactedCall({
      phones: normalizedPhones,
      canalContacto: parsed.data.canalContacto,
      telefonosExplicitEmpty: false,
    });
    if (contactedError) {
      return NextResponse.json({ error: contactedError }, { status: 400 });
    }
  }

  const usedPhones =
    parsed.data.telefonosUsados?.trim() ||
    normalizedPhones.filter((phone) => phone.funciona).map((phone) => phone.num).join(", ") ||
    normalizedPhones.find((phone) => phone.principal)?.num ||
    normalizedPhones[0]?.num ||
    null;

  let trasladoData = previousOperativo.traslado;
  if (parsed.data.trasladoProvincia) {
    trasladoData = {
      provinciaDestino: parsed.data.trasladoProvincia,
      motivo: parsed.data.trasladoMotivo || "Traslado interprovincial",
      solicitadoAt: new Date().toISOString(),
      solicitadoPor: auth.session.user.name,
    };

    // Automatically create SLAExtensionRequest for the transfer
    await prisma.sLAExtensionRequest.create({
      data: {
        cardId: card.id,
        tc: card.tc,
        cedula: card.customer.cedula,
        nombre: card.customer.nombre,
        provinciaOrigen: card.provincia,
        provinciaDestino: parsed.data.trasladoProvincia,
        motivo: parsed.data.trasladoMotivo || `Traslado de ${card.provincia} a ${parsed.data.trasladoProvincia}`,
        diasSolicitados: 5,
        status: SLAExtensionRequestStatus.PENDIENTE,
        solicitadoPorId: auth.session.user.id,
      },
    });
  }

  const nextOperativo: Record<string, unknown> = {
    ...previousOperativo,
    telefonos: normalizedPhones,
    comentarioContacto: comentario,
    contactado,
    canalContacto: parsed.data.canalContacto ?? previousOperativo.canalContacto ?? null,
    nuevaDireccion:
      parsed.data.nuevaDireccion !== undefined
        ? parsed.data.nuevaDireccion
        : previousOperativo.nuevaDireccion ?? null,
    fechaPreferenciaEntrega:
      parsed.data.fechaPreferenciaEntrega !== undefined
        ? parsed.data.fechaPreferenciaEntrega
        : previousOperativo.fechaPreferenciaEntrega ?? null,
    solicitudRetorno:
      parsed.data.solicitudRetorno !== undefined
        ? parsed.data.solicitudRetorno
        : previousOperativo.solicitudRetorno ?? false,
    motivoRetorno:
      parsed.data.motivoRetorno !== undefined
        ? parsed.data.motivoRetorno
        : previousOperativo.motivoRetorno ?? null,
    traslado: trasladoData ?? null,
    updatedAt: new Date().toISOString(),
  };

  const nextMetadata = {
    ...metadataRoot,
    operativo: nextOperativo,
  } as Prisma.InputJsonValue;

  // Calls overhaul: a return requested from a call parks the card in the
  // product-specific "return in progress" status (credit / debit).
  const returnStatus = parsed.data.solicitudRetorno
    ? resolveReturnStatus(card.productType, card.status)
    : null;
  const fechaPreferenciaEntrega = parseDateOnly(
    typeof nextOperativo.fechaPreferenciaEntrega === "string" ? nextOperativo.fechaPreferenciaEntrega : null,
  );
  const canalContacto =
    typeof nextOperativo.canalContacto === "string" ? nextOperativo.canalContacto : null;
  const nuevaDireccion = parsed.data.nuevaDireccion?.trim() || null;

  const contact = await prisma.$transaction(async (tx) => {
    if (returnStatus) {
      const motivo = parsed.data.motivoRetorno?.trim();
      await applyCardTransition({
        tx,
        card,
        nextStatus: returnStatus,
        byUserId: auth.session.user.id,
        note: `Retorno solicitado desde gestión de llamada${motivo ? `: ${motivo}` : ""}`,
        returnReason: motivo || card.returnReason,
        data: { metadata: nextMetadata },
      });
    } else {
      await tx.card.update({
        where: { id: card.id },
        data: { metadata: nextMetadata },
      });
    }

    return tx.contactLog.create({
      data: {
        cardId: parsed.data.cardId,
        userId: auth.session.user.id,
        telefonosUsados: usedPhones,
        comentario: comentario || (contactado ? "Contacto exitoso" : "Intento de contacto"),
        contactado,
        resultado,
        canalContacto,
        telefonosDetalle: parsed.data.telefonosDetalle
          ? (parsed.data.telefonosDetalle.map((phone) => ({
              numero: phone.numero,
              estado: phone.estado ?? null,
              nota: phone.nota?.trim() || null,
            })) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        motivoNoContacto: parsed.data.motivoNoContacto?.trim() || null,
        nuevaDireccion,
        fechaPreferenciaEntrega,
        snapshot: {
          nombre: card.customer.nombre,
          cedula: card.customer.cedula,
          tc: card.tc,
          productType: card.productType,
          provincia: card.provincia,
          zona: card.zona,
          direccion: card.customer.direccionRaw,
          status: card.status,
          statusDespues: returnStatus ?? card.status,
          mensajero: card.currentMessenger?.nombre ?? null,
          mensajeroTelefono: card.currentMessenger?.telefono ?? null,
          operador: auth.session.user.name ?? null,
        } as Prisma.InputJsonValue,
      },
    });
  });

  return NextResponse.json(
    {
      contact,
      saved: {
        cardId: card.id,
        contactado,
        comentario,
        telefonos: normalizedPhones,
        canalContacto: nextOperativo.canalContacto,
        nuevaDireccion: nextOperativo.nuevaDireccion,
        fechaPreferenciaEntrega: nextOperativo.fechaPreferenciaEntrega,
        solicitudRetorno: nextOperativo.solicitudRetorno,
        traslado: nextOperativo.traslado,
        resultado,
        status: returnStatus ?? card.status,
      },
    },
    { status: 201 },
  );
}
