import { prisma } from "@/lib/prisma";

export type MassTrackingCardResult = {
  id: string;
  tc: string;
  externalReference: string | null;
  status: string;
  provincia: string;
  zona: string;
  dispatchDate: Date | null;
  slaDueDate: Date | null;
  urgent: boolean;
  isRemote: boolean;
  returnReason: string | null;
  deliveryType: string | null;
  emissionType: string | null;
  customer: {
    nombre: string;
    cedula: string;
    telefonosRaw: string | null;
    direccionRaw: string | null;
  };
  currentMessenger: {
    nombre: string;
  } | null;
  updatedAt: Date;
};

export function parseTrackingQueryItems(raw: string) {
  const entries = raw
    .split(/[\n;,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(entries));
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export function normalizeTrackingCompare(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();
}

export function normalizeTrackingDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function matchesTrackingToken(card: MassTrackingCardResult, token: string) {
  const tokenNorm = normalizeTrackingCompare(token);
  const tokenDigits = normalizeTrackingDigits(token);

  const tcNorm = normalizeTrackingCompare(card.tc);
  const refNorm = normalizeTrackingCompare(card.externalReference ?? "");
  const nameNorm = normalizeTrackingCompare(card.customer.nombre);
  const cedulaNorm = normalizeTrackingCompare(card.customer.cedula);
  const cedulaDigits = normalizeTrackingDigits(card.customer.cedula);

  if (tokenNorm && (tcNorm === tokenNorm || refNorm === tokenNorm)) return true;
  if (tokenDigits && tokenDigits.length >= 6 && tcNorm.includes(tokenDigits)) return true;
  if (tokenDigits && cedulaDigits.includes(tokenDigits)) return true;
  if (tokenNorm && nameNorm.includes(tokenNorm)) return true;
  if (tokenNorm && cedulaNorm.includes(tokenNorm)) return true;
  return false;
}

export async function searchTrackingCards(tokens: string[]) {
  const allRows: MassTrackingCardResult[] = [];
  for (const batch of chunkArray(tokens, 60)) {
    const normalized = batch.map((item) => item.trim()).filter(Boolean);
    if (!normalized.length) continue;

    const digitTokens = normalized.map(normalizeTrackingDigits).filter((item) => item.length >= 4);
    const nameTokens = normalized.filter((item) => /[A-Za-zÀ-ÿ]/.test(item));

    const where = {
      OR: [
        { tc: { in: normalized } },
        { externalReference: { in: normalized } },
        ...digitTokens.map((token) => ({ tc: { contains: token } })),
        ...digitTokens.map((token) => ({ customer: { cedula: { contains: token, mode: "insensitive" as const } } })),
        ...nameTokens.map((token) => ({ customer: { nombre: { contains: token, mode: "insensitive" as const } } })),
      ],
    };

    const rows = await prisma.card.findMany({
      where,
      select: {
        id: true,
        tc: true,
        externalReference: true,
        status: true,
        provincia: true,
        zona: true,
        dispatchDate: true,
        slaDueDate: true,
        urgent: true,
        isRemote: true,
        returnReason: true,
        deliveryType: true,
        emissionType: true,
        customer: {
          select: {
            nombre: true,
            cedula: true,
            telefonosRaw: true,
            direccionRaw: true,
          },
        },
        currentMessenger: {
          select: { nombre: true },
        },
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 3000,
    });

    allRows.push(...rows);
  }

  const deduped = new Map<string, MassTrackingCardResult>();
  for (const row of allRows) {
    if (!deduped.has(row.id)) {
      deduped.set(row.id, row);
    }
  }
  return Array.from(deduped.values());
}
