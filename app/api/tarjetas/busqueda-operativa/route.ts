import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import {
  resolveOperationalCardLookup,
  type OperationalCardResolution,
} from "@/lib/operational-card-lookup";
import {
  findOperationalCardCandidates,
  resolveOperationalIdentifier,
} from "@/lib/operational-card-service";

function normalizedCedula(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits || value.trim();
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "Debes indicar un TC, referencia o cédula" }, { status: 400 });
  }

  const cedula = normalizedCedula(query);
  const cards = await findOperationalCardCandidates([query]);

  const lookups = [
    { kind: "TC" as const, value: query },
    { kind: "REFERENCIA" as const, value: query },
    { kind: "CEDULA" as const, value: cedula },
  ];

  let result: OperationalCardResolution<(typeof cards)[number]> = { kind: "NO_ENCONTRADA" };
  for (const lookup of lookups) {
    result = resolveOperationalCardLookup(lookup, cards);
    if (result.kind !== "NO_ENCONTRADA") break;
  }

  return NextResponse.json({ result });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const identifiers = Array.isArray(body?.identifiers)
    ? (body.identifiers as unknown[]).map((v) => String(v).trim()).filter(Boolean)
    : [];
  if (!identifiers.length) {
    return NextResponse.json({ error: "Debes indicar al menos un TC o cédula" }, { status: 400 });
  }

  const cards = await findOperationalCardCandidates(identifiers);
  const results: Array<{
    identifier: string;
    resolution: OperationalCardResolution<(typeof cards)[number]>;
  }> = [];

  for (const identifier of identifiers) {
    const resolution = resolveOperationalIdentifier(identifier, cards);
    results.push({ identifier, resolution });
  }

  return NextResponse.json({ results });
}
