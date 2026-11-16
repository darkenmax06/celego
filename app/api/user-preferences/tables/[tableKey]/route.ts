import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { getTableColumnCatalog } from "@/lib/table-columns/catalogs";
import { mergeColumnPreferences } from "@/lib/table-columns/column-preferences";

/**
 * Per-user table layout (column order + visibility), e.g. `/tarjetas` list.
 *
 * Saved layouts are always reconciled with the table's current column catalog
 * (`mergeColumnPreferences`): unknown keys are dropped, duplicates removed, and
 * columns added after the layout was saved are appended with their default
 * visibility — on the way in (PUT) and on the way out (GET).
 */
const ROLES = ["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"] as const;

const putSchema = z.object({
  columns: z
    .array(z.object({ key: z.string().min(1).max(100), visible: z.boolean() }))
    .max(200),
});

type RouteContext = { params: Promise<{ tableKey: string }> };

function unknownTable() {
  return NextResponse.json({ error: "Tabla desconocida" }, { status: 404 });
}

export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const { tableKey } = await params;
  const catalog = getTableColumnCatalog(tableKey);
  if (!catalog) return unknownTable();

  const pref = await prisma.userTablePreference.findUnique({
    where: { userId_tableKey: { userId: auth.session.user.id, tableKey } },
  });

  return NextResponse.json({
    tableKey,
    saved: Boolean(pref),
    columns: mergeColumnPreferences(catalog, pref?.columns ?? null),
    updatedAt: pref?.updatedAt.toISOString() ?? null,
  });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const { tableKey } = await params;
  const catalog = getTableColumnCatalog(tableKey);
  if (!catalog) return unknownTable();

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", details: parsed.error.format() }, { status: 400 });
  }

  const userId = auth.session.user.id;
  const columns = mergeColumnPreferences(catalog, parsed.data.columns);
  const json = columns as unknown as Prisma.InputJsonValue;

  const pref = await prisma.userTablePreference.upsert({
    where: { userId_tableKey: { userId, tableKey } },
    create: { userId, tableKey, columns: json },
    update: { columns: json },
  });

  return NextResponse.json({
    ok: true,
    tableKey,
    columns,
    updatedAt: pref.updatedAt.toISOString(),
  });
}
