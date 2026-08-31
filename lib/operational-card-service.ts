import { Prisma } from "@prisma/client";
import {
  resolveOperationalCardLookup,
  type OperationalCardResolution,
} from "@/lib/operational-card-lookup";
import { prisma } from "@/lib/prisma";

export const operationalCardSelect = Prisma.validator<Prisma.CardSelect>()({
  id: true,
  tc: true,
  externalReference: true,
  status: true,
  dispatchDate: true,
  createdAt: true,
  returnReason: true,
  isRemote: true,
  zona: true,
  provincia: true,
  customer: {
    select: {
      nombre: true,
      cedula: true,
      telefonosRaw: true,
    },
  },
});

export type OperationalCard = Prisma.CardGetPayload<{
  select: typeof operationalCardSelect;
}>;

function normalizedCedula(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits || value.trim();
}

function identifierVariants(value: string) {
  const trimmed = value.trim();
  const compact = trimmed.replace(/[\s\-_]+/g, "");
  return Array.from(new Set([trimmed, compact].filter(Boolean)));
}

function cedulaVariants(value: string) {
  const trimmed = value.trim();
  const digits = normalizedCedula(trimmed);
  const dominicanFormat = /^\d{11}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
    : "";

  return Array.from(new Set([trimmed, digits, dominicanFormat].filter(Boolean)));
}

export async function findOperationalCardCandidates(identifiers: readonly string[]) {
  const values = Array.from(new Set(identifiers.map((value) => value.trim()).filter(Boolean)));
  if (!values.length) return [] as OperationalCard[];

  const identifierValues = Array.from(new Set(values.flatMap(identifierVariants)));
  const cedulas = Array.from(new Set(values.flatMap(cedulaVariants)));
  return prisma.card.findMany({
    where: {
      OR: [
        { id: { in: values } },
        { tc: { in: identifierValues, mode: "insensitive" } },
        { externalReference: { in: identifierValues, mode: "insensitive" } },
        { customer: { cedula: { in: cedulas, mode: "insensitive" } } },
      ],
    },
    select: operationalCardSelect,
  });
}

/**
 * A Card id is considered an explicit operator choice. Raw identifiers are
 * always resolved through the operational lifecycle policy.
 */
export function resolveOperationalIdentifier(
  identifier: string,
  candidates: readonly OperationalCard[],
): OperationalCardResolution<OperationalCard> {
  const explicitCard = candidates.find((card) => card.id === identifier);
  if (explicitCard) return { kind: "RESUELTA", card: explicitCard };

  const cedula = normalizedCedula(identifier);
  const lookups = [
    { kind: "TC" as const, value: identifier },
    { kind: "REFERENCIA" as const, value: identifier },
    { kind: "CEDULA" as const, value: cedula },
  ];

  for (const lookup of lookups) {
    const result = resolveOperationalCardLookup(lookup, candidates);
    if (result.kind !== "NO_ENCONTRADA") return result;
  }

  return { kind: "NO_ENCONTRADA" };
}
