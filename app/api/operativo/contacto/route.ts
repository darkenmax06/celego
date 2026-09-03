import { NextRequest, NextResponse } from "next/server";
import { CardStatus, Prisma, SLAExtensionRequestStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { addBusinessDaysStrict, remainingBusinessDays } from "@/lib/sla";
import { resolveZone } from "@/lib/zone-map";
import { normalizeText } from "@/lib/utils";
import { buildListEnvelope, compile } from "@/lib/list-query";
import { operativoContactoListQuery } from "@/lib/list-query/descriptors/operativo-contacto";
import { SLA_CLOSED_STATUSES } from "@/lib/list-query/descriptors/sla-vencidas";
import {
  clampUrgencyLevel,
  emitDueUrgentNotifications,
  urgencyIntervalMinutes,
  urgencyLevelLabel,
} from "@/lib/urgent-alerts";

type PhoneState = {
  num: string;
  principal: boolean;
  funciona: boolean;
  comentario?: string;
};

type OperativoCardInput = {
  id: string;
  tc: string;
  requestNumber: string | null;
  externalReference: string | null;
  zona: string;
  provincia: string;
  dispatchDate: Date | null;
  deliveryType: string | null;
  emissionType: string | null;
  status: CardStatus;
  urgent: boolean;
  slaDueDate: Date | null;
  metadata: Prisma.JsonValue | null;
  customer: {
    nombre: string;
    cedula: string;
    direccionRaw: string | null;
    telefonosRaw: string | null;
  };
  currentMessenger?: {
    nombre: string;
  } | null;
  contacts: Array<{
    comentario: string | null;
    contactado: boolean;
    telefonosUsados: string | null;
  }>;
};

type ActiveUrgentCaseSnapshot = {
  id: string;
  level: number;
  lastNotifiedAt: Date | null;
  nextNotificationAt: Date | null;
};

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
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function splitTextChunks(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split(/[\n;|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitPhonesFromRaw(raw: string | null | undefined) {
  if (!raw) return [];
  const numbers = raw.match(/\d{7,}/g) ?? [];
  return [...new Set(numbers)];
}

function normalizeStatusKey(value: string) {
  return normalizeText(value).replace(/[\s-]+/g, "_");
}

function matchesStatusFilter(status: string, filter: string | null) {
  if (!filter || filter === "ALL") return true;
  return normalizeStatusKey(status) === normalizeStatusKey(filter);
}

function parseCardStatusFilter(filter: string | null) {
  if (!filter || filter === "ALL") return "ALL" as const;
  if ((Object.values(CardStatus) as string[]).includes(filter)) {
    return filter as CardStatus;
  }
  return null;
}

function normalizePhoneValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const compact = trimmed.replace(/[^\d+]/g, "");
  return compact || trimmed;
}

function normalizePhones(
  rawPhones: Array<{ num: string; principal?: boolean; funciona?: boolean; comentario?: string }>,
): PhoneState[] {
  const deduped: PhoneState[] = [];
  const seen = new Set<string>();

  for (const item of rawPhones) {
    const num = normalizePhoneValue(item.num);
    if (!num) continue;

    const key = num.replace(/\D/g, "") || num.toUpperCase();
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push({
      num,
      principal: Boolean(item.principal),
      funciona: Boolean(item.funciona),
      comentario: item.comentario?.trim() || "",
    });
  }

  if (!deduped.length) return deduped;

  let principalFound = false;
  for (let index = 0; index < deduped.length; index += 1) {
    if (deduped[index].principal && !principalFound) {
      principalFound = true;
      continue;
    }
    deduped[index].principal = false;
  }

  if (!principalFound) {
    deduped[0].principal = true;
  }

  return deduped;
}

function phonesSignature(phones: PhoneState[]) {
  return phones
    .map(
      (phone) =>
        `${phone.num}|${phone.principal ? 1 : 0}|${phone.funciona ? 1 : 0}|${phone.comentario || ""}`,
    )
    .join(";");
}

function parseMetadataPhones(metadata: Record<string, unknown>): PhoneState[] {
  const raw = metadata.telefonos;
  if (!Array.isArray(raw)) return [];

  const parsed: PhoneState[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      parsed.push({ num: item, principal: false, funciona: false, comentario: "" });
    } else if (item && typeof item === "object") {
      const obj = asRecord(item);
      if (typeof obj.num === "string") {
        parsed.push({
          num: obj.num,
          principal: Boolean(obj.principal),
          funciona: Boolean(obj.funciona),
          comentario: typeof obj.comentario === "string" ? obj.comentario : "",
        });
      }
    }
  }

  return normalizePhones(parsed);
}

function mapCardToOperativeRow(
  card: OperativoCardInput,
  activeUrgentCase?: ActiveUrgentCaseSnapshot | null,
) {
  const root = asRecord(card.metadata);
  const operativo = asRecord(root.operativo);
  const latestContact = card.contacts[0] ?? null;

  const metaPhones = parseMetadataPhones(operativo);
  const fallbackPhones = normalizePhones(
    splitPhonesFromRaw(card.customer.telefonosRaw).map((num, index) => ({
      num,
      principal: index === 0,
      funciona: false,
      comentario: "",
    })),
  );
  const contactPhones =
    metaPhones.length > 0
      ? metaPhones
      : latestContact?.telefonosUsados
        ? normalizePhones(
            latestContact.telefonosUsados.split(/[,\n;]+/g).map((num, index) => ({
              num,
              principal: index === 0,
              funciona: false,
              comentario: "",
            })),
          )
        : fallbackPhones;

  const contactado =
    typeof operativo.contactado === "boolean"
      ? operativo.contactado
      : (latestContact?.contactado ?? false);

  const comentarioContacto =
    typeof operativo.comentarioContacto === "string"
      ? operativo.comentarioContacto
      : (latestContact?.comentario ?? "");

  const presinto = typeof root.presinto === "string" ? root.presinto : null;
  const level = activeUrgentCase ? clampUrgencyLevel(activeUrgentCase.level) : card.urgent ? 3 : null;
  const intervalMinutes = level ? urgencyIntervalMinutes(level) : null;

  return {
    id: card.id,
    cardId: card.id,
    urgentCaseId: activeUrgentCase?.id ?? null,
    tc: card.tc,
    requestNumber: card.requestNumber ?? (typeof root.solicitud === "string" ? root.solicitud : null),
    nombre: card.customer.nombre,
    cedula: card.customer.cedula,
    provincia: card.provincia,
    zona: card.zona,
    status: card.status,
    urgent: card.urgent,
    urgentLevel: level,
    urgentLabel: level ? urgencyLevelLabel(level) : null,
    urgentIntervalMinutes: intervalMinutes,
    urgentNextNotificationAt: activeUrgentCase?.nextNotificationAt?.toISOString() ?? null,
    urgentLastNotificationAt: activeUrgentCase?.lastNotifiedAt?.toISOString() ?? null,
    remaining: card.slaDueDate ? remainingBusinessDays(new Date(), card.slaDueDate) : null,
    presinto,
    fechaDespacho: card.dispatchDate?.toISOString() ?? null,
    tipoEmision: card.emissionType,
    tipoEntrega: card.deliveryType,
    direcciones: splitTextChunks(card.customer.direccionRaw),
    refs: splitTextChunks(card.externalReference),
    mensajero: card.currentMessenger?.nombre ?? "Sin asignar",
    telefonos: contactPhones,
    comentarioContacto,
    contactado,
    canalContacto: (typeof operativo.canalContacto === "string" ? operativo.canalContacto : null) as
      | "WHATSAPP"
      | "LLAMADA_DIRECTA"
      | null,
    nuevaDireccion: contactado && typeof operativo.nuevaDireccion === "string" ? operativo.nuevaDireccion : null,
    fechaPreferenciaEntrega:
      typeof operativo.fechaPreferenciaEntrega === "string" ? operativo.fechaPreferenciaEntrega : null,
    solicitudRetorno: Boolean(operativo.solicitudRetorno),
    motivoRetorno: typeof operativo.motivoRetorno === "string" ? operativo.motivoRetorno : null,
    traslado: asRecord(operativo.traslado),
    hasAttempt: card.contacts.length > 0 || Boolean(operativo.updatedAt) || Boolean(operativo.comentarioContacto),
    readOnly: false,
  };
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
  const gestion = request.nextUrl.searchParams.get("gestion");
  const urgentParam = request.nextUrl.searchParams.get("urgent");
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const daysRaw = Number(request.nextUrl.searchParams.get("days") ?? 3);
  const days = Number.isFinite(daysRaw) ? Math.min(10, Math.max(1, Math.trunc(daysRaw))) : 3;
  const { page, pageSize } = compile(operativoContactoListQuery, request.nextUrl.searchParams);

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
    andClauses.push({ OR: [{ slaDueDate: null }, { slaDueDate: { lte: maxDueDate } }] });

    const where: Prisma.CardWhereInput = { AND: andClauses };

    const hasInMemoryFilter =
      (Boolean(canalContacto) && canalContacto !== "ALL") || (Boolean(gestion) && gestion !== "ALL");

    const [cards, totalCount] = await Promise.all([
      prisma.card.findMany({
        where,
        include: {
          customer: true,
          currentMessenger: { select: { nombre: true } },
          contacts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { comentario: true, contactado: true, telefonosUsados: true },
          },
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
      ],
    };

    const cards = await prisma.card.findMany({
      where,
      include: {
        customer: true,
        currentMessenger: { select: { nombre: true } },
        contacts: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { comentario: true, contactado: true, telefonosUsados: true },
        },
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
    ],
  };

  const [urgentCards, unresolvedCases] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        customer: true,
        currentMessenger: { select: { nombre: true } },
        contacts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { comentario: true, contactado: true, telefonosUsados: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
    }),
    prisma.urgentCase.findMany({
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
    tipoEmision: null,
    tipoEntrega: null,
    direcciones: splitTextChunks(item.direccion),
    refs: [],
    mensajero: "Sin asignar",
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

  const card = await prisma.card.findUnique({
    where: { id: parsed.data.cardId },
    include: { customer: true },
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

  await prisma.card.update({
    where: { id: card.id },
    data: {
      metadata: {
        ...metadataRoot,
        operativo: nextOperativo,
      } as Prisma.InputJsonValue,
    },
  });

  const contact = await prisma.contactLog.create({
    data: {
      cardId: parsed.data.cardId,
      userId: auth.session.user.id,
      telefonosUsados: usedPhones,
      comentario: comentario || (contactado ? "Contacto exitoso" : "Intento de contacto"),
      contactado,
    },
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
      },
    },
    { status: 201 },
  );
}
