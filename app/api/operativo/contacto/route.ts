import { NextRequest, NextResponse } from "next/server";
import { CardStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { addBusinessDaysStrict, remainingBusinessDays } from "@/lib/sla";
import { resolveZone } from "@/lib/zone-map";
import { normalizeText } from "@/lib/utils";
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
};

type OperativoCardInput = {
  id: string;
  tc: string;
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
});

const postSchema = z.object({
  cardId: z.string().cuid(),
  telefonos: z.array(phoneSchema).max(20).optional(),
  telefonosUsados: z.string().max(255).optional(),
  comentario: z.string().max(1500).optional(),
  contactado: z.boolean().default(true),
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

function normalizePhones(rawPhones: Array<{ num: string; principal?: boolean; funciona?: boolean }>): PhoneState[] {
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
    });
  }

  if (!deduped.length) return deduped;

  let principalFound = false;
  for (let index = 0; index < deduped.length; index += 1) {
    if (deduped[index].principal && !principalFound) {
      principalFound = true;
    } else {
      deduped[index].principal = false;
    }
  }

  if (!principalFound) {
    deduped[0].principal = true;
  }

  return deduped;
}

function phonesSignature(phones: PhoneState[]) {
  return phones
    .map((phone) => `${phone.num}|${phone.principal ? 1 : 0}|${phone.funciona ? 1 : 0}`)
    .join(";");
}

function parseMetadataPhones(metadata: Record<string, unknown>) {
  const raw = metadata.telefonos;
  if (!Array.isArray(raw)) return [] as PhoneState[];

  const parsed = raw
    .map((item) => {
      if (typeof item === "string") {
        return { num: item, principal: false, funciona: false };
      }
      const obj = asRecord(item);
      if (typeof obj.num !== "string") return null;
      return {
        num: obj.num,
        principal: Boolean(obj.principal),
        funciona: Boolean(obj.funciona),
      };
    })
    .filter((item): item is { num: string; principal: boolean; funciona: boolean } => Boolean(item));

  return normalizePhones(parsed);
}

function mapCardToOperativeRow(card: OperativoCardInput, activeUrgentCase?: ActiveUrgentCaseSnapshot | null) {
  const root = asRecord(card.metadata);
  const operativo = asRecord(root.operativo);
  const latestContact = card.contacts[0] ?? null;

  const metaPhones = parseMetadataPhones(operativo);
  const fallbackPhones = normalizePhones(
    splitPhonesFromRaw(card.customer.telefonosRaw).map((num, index) => ({
      num,
      principal: index === 0,
      funciona: false,
    })),
  );
  const contactPhones =
    metaPhones.length > 0
      ? metaPhones
      : latestContact?.telefonosUsados
        ? normalizePhones(
            latestContact.telefonosUsados
              .split(/[,\n;]+/g)
              .map((num, index) => ({
                num,
                principal: index === 0,
                funciona: false,
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
    telefonos: contactPhones,
    comentarioContacto,
    contactado,
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

  const tab = request.nextUrl.searchParams.get("tab") === "urgentes" ? "urgentes" : "activos";
  const provincia = request.nextUrl.searchParams.get("provincia");
  const statusFilter = request.nextUrl.searchParams.get("status");
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(request.nextUrl.searchParams.get("pageSize") ?? "25");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, Math.trunc(pageSizeRaw))) : 25;
  const daysRaw = Number(request.nextUrl.searchParams.get("days") ?? 3);
  const days = Number.isFinite(daysRaw)
    ? Math.min(10, Math.max(1, Math.trunc(daysRaw)))
    : 3;

  if (tab === "activos") {
    const parsedStatus = parseCardStatusFilter(statusFilter);
    if (parsedStatus === null) {
      return NextResponse.json({
        tab,
        cards: [],
        pagination: { page, pageSize, total: 0, totalPages: 1 },
      });
    }

    const maxDueDate = addBusinessDaysStrict(new Date(), days);
    const activeClosedStatuses = [
      CardStatus.ENTREGADA,
      CardStatus.RETORNADA,
      CardStatus.ENTREGA_DIGITAL,
      CardStatus.ACUSE_RECIBIDO,
      CardStatus.DEVUELTA_TIENDA,
    ];

    const where: Prisma.CardWhereInput = {
      AND: [
        { status: { notIn: activeClosedStatuses } },
        ...(parsedStatus !== "ALL" ? [{ status: parsedStatus }] : []),
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
        {
          OR: [
            { slaDueDate: null },
            { slaDueDate: { lte: maxDueDate } },
          ],
        },
      ],
    };

    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        include: {
          customer: true,
          contacts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { comentario: true, contactado: true, telefonosUsados: true },
          },
        },
        orderBy: [{ urgent: "desc" }, { slaDueDate: "asc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.card.count({ where }),
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

    const rows = cards.map((card) => mapCardToOperativeRow(card, activeCaseByCard.get(card.id) ?? null));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({
      tab,
      cards: rows,
      pagination: { page, pageSize, total, totalPages },
    });
  }

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
      linkedUrgentCards
        .map((item) => item.cardId)
        .filter((value): value is string => Boolean(value)),
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
    telefonos: normalizePhones(
      splitPhonesFromRaw(item.telefono).map((num, index) => ({
        num,
        principal: index === 0,
        funciona: false,
      })),
    ),
    comentarioContacto: "",
    contactado: false,
    readOnly: true,
  }));

  const rows = [...cardRows, ...unresolvedRows]
    .filter((row) => matchesStatusFilter(row.status, statusFilter))
    .sort((a, b) => {
      if (a.contactado !== b.contactado) return a.contactado ? 1 : -1;
      const levelA = a.urgentLevel ?? 0;
      const levelB = b.urgentLevel ?? 0;
      if (levelA !== levelB) return levelB - levelA;
      const nextA = a.urgentNextNotificationAt ? new Date(a.urgentNextNotificationAt).getTime() : Number.MAX_SAFE_INTEGER;
      const nextB = b.urgentNextNotificationAt ? new Date(b.urgentNextNotificationAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (nextA !== nextB) return nextA - nextB;
      return a.tc.localeCompare(b.tc);
    });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cardsPage = rows.slice((page - 1) * pageSize, page * pageSize);
  return NextResponse.json({
    tab,
    cards: cardsPage,
    pagination: { page, pageSize, total, totalPages },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
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
    })),
  );

  const metadataRoot = asRecord(card.metadata);
  const previousOperativo = asRecord(metadataRoot.operativo);
  const previousPhones = parseMetadataPhones(previousOperativo);
  const previousComentario =
    typeof previousOperativo.comentarioContacto === "string"
      ? previousOperativo.comentarioContacto.trim()
      : "";
  const previousContactado =
    typeof previousOperativo.contactado === "boolean"
      ? previousOperativo.contactado
      : false;

  const normalizedPhones = normalizePhones(
    parsed.data.telefonos && parsed.data.telefonos.length > 0
      ? parsed.data.telefonos
      : previousPhones.length > 0
        ? previousPhones
        : fallbackPhones,
  );
  const comentario = parsed.data.comentario?.trim() ?? "";
  const contactado = parsed.data.contactado;
  const previousReferencePhones = previousPhones.length > 0 ? previousPhones : fallbackPhones;

  const noChanges =
    phonesSignature(normalizedPhones) === phonesSignature(previousReferencePhones) &&
    comentario === previousComentario &&
    contactado === previousContactado;

  if (noChanges) {
    return NextResponse.json({
      saved: false,
      noChanges: true,
      state: {
        cardId: card.id,
        contactado,
        comentario,
        telefonos: normalizedPhones,
      },
    });
  }

  const usedPhones =
    parsed.data.telefonosUsados?.trim() ||
    normalizedPhones.filter((phone) => phone.funciona).map((phone) => phone.num).join(", ") ||
    normalizedPhones.find((phone) => phone.principal)?.num ||
    normalizedPhones[0]?.num ||
    null;

  const nextOperativo: Record<string, unknown> = {
    ...previousOperativo,
    telefonos: normalizedPhones,
    comentarioContacto: comentario,
    contactado,
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
      comentario: comentario || null,
      contactado,
    },
  });

  return NextResponse.json({
    contact,
    saved: {
      cardId: card.id,
      contactado,
      comentario,
      telefonos: normalizedPhones,
    },
  }, { status: 201 });
}
