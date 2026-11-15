import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import {
  findProvinceConflicts,
  mergeAliases,
  provinceKeys,
  sanitizeAliases,
} from "@/lib/province-resolver";
import { findReferenceValues, PROVINCE_REFERENCES, rewriteReferenceValues } from "@/lib/province-references";
import { normalizeText } from "@/lib/utils";
import { resolveProvinceAlias } from "@/lib/zone-map";

const bodySchema = z.object({
  nombre: z.string().trim().min(2),
  zona: z.string().min(2),
  aliases: z.array(z.string()).optional(),
});

type ProvinceRow = { id: string; nombre: string; zona: string; active: boolean; aliases: string[] };

function describeConflict(name: string, conflict: ProvinceRow) {
  return normalizeText(conflict.nombre) === normalizeText(name)
    ? `«${name}» ya existe como provincia («${conflict.nombre}»).`
    : `«${name}» ya está registrada como variante de «${conflict.nombre}».`;
}

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const provincias = await prisma.provinceConfig.findMany({ orderBy: { nombre: "asc" } });
  return NextResponse.json({ provincias });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }
  const nombre = parsed.data.nombre;
  const aliases = sanitizeAliases(nombre, parsed.data.aliases);

  const all = (await prisma.provinceConfig.findMany()) as ProvinceRow[];
  for (const name of [nombre, ...aliases]) {
    const [conflict] = findProvinceConflicts([name], all);
    if (conflict) {
      return NextResponse.json(
        { error: describeConflict(name, conflict), code: "PROVINCE_EXISTS", conflicts: [{ id: conflict.id, nombre: conflict.nombre }] },
        { status: 409 },
      );
    }
  }

  const provincia = await prisma.provinceConfig.create({
    data: { nombre, zona: parsed.data.zona, active: true, aliases },
  });

  return NextResponse.json({ provincia }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().trim().min(2).optional(),
  zona: z.string().min(2).optional(),
  active: z.boolean().optional(),
  aliases: z.array(z.string()).optional(),
  merge: z.boolean().optional(),
});

/**
 * Rewrites every stored province reference whose normalized value is one of
 * `keys` (and is not already the canonical spelling) to the target province.
 */
async function rewriteReferences(tx: Prisma.TransactionClient, keys: Set<string>, target: { nombre: string; zona: string }) {
  const rewritten: Record<string, number> = {};
  for (const reference of PROVINCE_REFERENCES) {
    const values = await findReferenceValues(tx, reference);
    const from = values.filter((value) => value !== target.nombre && keys.has(normalizeText(value)));
    if (!from.length) continue;
    const { rows } = await rewriteReferenceValues(tx, reference, from, target);
    if (rows) rewritten[reference.label] = rows;
  }
  return rewritten;
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }
  const { id, zona, active, merge } = parsed.data;

  const existing = await prisma.provinceConfig.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Provincia no encontrada" }, { status: 404 });
  }

  const nombre = parsed.data.nombre ?? existing.nombre;
  const renamed = nombre !== existing.nombre;
  const touchesNames = renamed || parsed.data.aliases !== undefined;

  // Plain zona/active edits keep the original single update.
  if (!touchesNames) {
    const provincia = await prisma.provinceConfig.update({ where: { id }, data: { zona, active } });
    return NextResponse.json({ provincia });
  }

  const all = (await prisma.provinceConfig.findMany()) as ProvinceRow[];
  const current = all.find((row) => row.id === id) ?? (existing as ProvinceRow);
  const requestedAliases = parsed.data.aliases ?? current.aliases ?? [];
  // A rename keeps the old name as a variant so later imports with it still resolve.
  const aliases = sanitizeAliases(nombre, renamed ? [...requestedAliases, existing.nombre] : requestedAliases);

  if (renamed) {
    const [nameConflict] = findProvinceConflicts([nombre], all, id);
    if (nameConflict) {
      return NextResponse.json(
        { error: describeConflict(nombre, nameConflict), code: "PROVINCE_EXISTS", conflicts: [{ id: nameConflict.id, nombre: nameConflict.nombre }] },
        { status: 409 },
      );
    }
  }

  const conflicts = findProvinceConflicts(aliases, all, id);
  if (conflicts.length && !merge) {
    const names = conflicts.map((row) => `«${row.nombre}»`).join(", ");
    return NextResponse.json(
      {
        error: `Hay variantes que ya pertenecen a otra provincia (${names}). Confirme la fusión para continuar.`,
        code: "ALIAS_CONFLICT",
        conflicts: conflicts.map((row) => ({ id: row.id, nombre: row.nombre })),
      },
      { status: 409 },
    );
  }

  const finalAliases = conflicts.length ? mergeAliases({ nombre, aliases }, conflicts) : aliases;
  const finalZona = zona ?? existing.zona;

  const result = await prisma.$transaction(async (tx) => {
    if (conflicts.length) {
      // Frees the absorbed names before the target takes them as aliases.
      await tx.provinceConfig.deleteMany({ where: { id: { in: conflicts.map((row) => row.id) } } });
    }
    const provincia = await tx.provinceConfig.update({
      where: { id },
      data: { nombre, zona, active, aliases: finalAliases },
    });
    const keys = provinceKeys({ nombre, aliases: finalAliases });
    const rewritten = await rewriteReferences(tx, keys, { nombre, zona: finalZona });
    return { provincia, rewritten };
  });

  return NextResponse.json({
    provincia: result.provincia,
    merged: conflicts.map((row) => ({ id: row.id, nombre: row.nombre })),
    rewritten: result.rewritten,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const existing = await prisma.provinceConfig.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Provincia no encontrada" }, { status: 404 });
  }

  const keys = provinceKeys(existing);
  const results = await Promise.all(
    PROVINCE_REFERENCES.map(async (reference) => ({
      label: reference.label,
      values: await findReferenceValues(prisma, reference),
    })),
  );
  const references = results
    .filter(({ values }) =>
      // Imports may have stored a variant ("DN"), so variants count as references too.
      values.some((value) => keys.has(normalizeText(value)) || keys.has(normalizeText(resolveProvinceAlias(value)))),
    )
    .map(({ label }) => label);

  if (references.length > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar "${existing.nombre}" porque está en uso. Desactívala en su lugar.`,
        references,
      },
      { status: 409 },
    );
  }

  await prisma.provinceConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
