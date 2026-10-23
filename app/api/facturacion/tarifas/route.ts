import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const rangeSchema = z.object({
  minQty: z.number().int().min(1),
  maxQty: z.number().int().nullable().optional(),
  centsPerCard: z.number().int().min(0),
});

const bodySchema = z.object({
  productType: z.enum(["CREDITO", "DEBITO"]),
  zona: z.string(),
  baseCents: z.number().int().min(0),
  active: z.boolean().default(true),
  ranges: z.array(rangeSchema).default([]),
});

function hasInvalidRanges(
  ranges: Array<{ minQty: number; maxQty?: number | null; centsPerCard: number }>,
) {
  const sorted = [...ranges]
    .map((range) => ({ ...range, maxQty: range.maxQty ?? null }))
    .sort((a, b) => a.minQty - b.minQty);
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current.maxQty !== null && current.maxQty < current.minQty) return true;
    if (index < sorted.length - 1) {
      const next = sorted[index + 1];
      if (current.maxQty === null) return true;
      if (current.maxQty >= next.minQty) return true;
    }
  }
  return false;
}

export async function GET(request: Request) {
  const auth = await requireApiSession(["ADMIN", "FACTURACION", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const product = new URL(request.url).searchParams.get("productType");
  if (product && product !== "CREDITO" && product !== "DEBITO") {
    return NextResponse.json({ error: "Tipo de tarjeta invalido" }, { status: 400 });
  }

  const billingConfig = await prisma.billingConfig.findUnique({
    where: { id: "default" },
  });

  await prisma.zoneTariff.upsert({
    where: { productType_zona: { productType: "CREDITO", zona: "REMOTA" } },
    update: {},
    create: {
      zona: "REMOTA",
      productType: "CREDITO",
      baseCents: billingConfig?.remoteSurchargeCents ?? 0,
      active: true,
    },
  });

  const zones = await prisma.zoneTariff.findMany({
    ...(product ? { where: { productType: product as "CREDITO" | "DEBITO" } } : {}),
    include: { ranges: { orderBy: { minQty: "asc" } } },
    orderBy: { zona: "asc" },
  });

  return NextResponse.json({ zones });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }
  if (hasInvalidRanges(parsed.data.ranges)) {
    return NextResponse.json(
      { error: "Rangos invalidos: revisa superposiciones y que solo el ultimo rango quede abierto." },
      { status: 400 },
    );
  }

  const zona = parsed.data.zona.trim().toUpperCase() === "REMOTA"
    ? "REMOTA"
    : parsed.data.zona.trim();
  if (!zona) {
    return NextResponse.json({ error: "Zona invalida" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const zone = await tx.zoneTariff.upsert({
      where: { productType_zona: { productType: parsed.data.productType, zona } },
      update: {
        baseCents: parsed.data.baseCents,
        active: parsed.data.active,
      },
      create: {
        zona,
        productType: parsed.data.productType,
        baseCents: parsed.data.baseCents,
        active: parsed.data.active,
      },
    });

    await tx.zoneTariffRange.deleteMany({ where: { zoneTariffId: zone.id } });
    if (parsed.data.ranges.length) {
      await tx.zoneTariffRange.createMany({
        data: parsed.data.ranges.map((range) => ({
          zoneTariffId: zone.id,
          minQty: range.minQty,
          maxQty: range.maxQty ?? null,
          centsPerCard: range.centsPerCard,
        })),
      });
    }

    return tx.zoneTariff.findUnique({
      where: { id: zone.id },
      include: { ranges: { orderBy: { minQty: "asc" } } },
    });
  });

  return NextResponse.json({ zone: updated });
}
