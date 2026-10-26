import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/utils";

const bodySchema = z.object({
  nombre: z.string().min(2),
  zona: z.string().min(2),
});

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const provincias = await prisma.provinceConfig.findMany({ orderBy: { nombre: "asc" } });
  return NextResponse.json({ provincias });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const provincia = await prisma.provinceConfig.upsert({
    where: { nombre: parsed.data.nombre },
    update: { zona: parsed.data.zona, active: true },
    create: { nombre: parsed.data.nombre, zona: parsed.data.zona, active: true },
  });

  return NextResponse.json({ provincia }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  zona: z.string().min(2).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }
  const { id, zona, active } = parsed.data;

  const existing = await prisma.provinceConfig.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Provincia no encontrada" }, { status: 404 });
  }

  const provincia = await prisma.provinceConfig.update({
    where: { id },
    data: { zona, active },
  });

  return NextResponse.json({ provincia });
}

/**
 * Scalar columns that store a province name. JSON columns (Card.metadata,
 * ContactLog.snapshot, AuditLog.details, ...) are historical and do not block.
 */
const PROVINCE_REFERENCES = [
  { label: "Card.provincia", find: () => prisma.card.findMany({ distinct: ["provincia"], select: { provincia: true } }).then((r) => r.map((x) => x.provincia)) },
  { label: "Card.reassignedProvince", find: () => prisma.card.findMany({ where: { reassignedProvince: { not: null } }, distinct: ["reassignedProvince"], select: { reassignedProvince: true } }).then((r) => r.map((x) => x.reassignedProvince)) },
  { label: "Customer.provincia", find: () => prisma.customer.findMany({ where: { provincia: { not: null } }, distinct: ["provincia"], select: { provincia: true } }).then((r) => r.map((x) => x.provincia)) },
  { label: "Messenger.provinciaTrabajo", find: () => prisma.messenger.findMany({ where: { provinciaTrabajo: { not: null } }, distinct: ["provinciaTrabajo"], select: { provinciaTrabajo: true } }).then((r) => r.map((x) => x.provinciaTrabajo)) },
  { label: "CardDeliveryReassignment.fromProvince", find: () => prisma.cardDeliveryReassignment.findMany({ distinct: ["fromProvince"], select: { fromProvince: true } }).then((r) => r.map((x) => x.fromProvince)) },
  { label: "CardDeliveryReassignment.toProvince", find: () => prisma.cardDeliveryReassignment.findMany({ distinct: ["toProvince"], select: { toProvince: true } }).then((r) => r.map((x) => x.toProvince)) },
  { label: "UrgentCase.provincia", find: () => prisma.urgentCase.findMany({ where: { provincia: { not: null } }, distinct: ["provincia"], select: { provincia: true } }).then((r) => r.map((x) => x.provincia)) },
  { label: "SLAExtensionRequest.provinciaOrigen", find: () => prisma.sLAExtensionRequest.findMany({ distinct: ["provinciaOrigen"], select: { provinciaOrigen: true } }).then((r) => r.map((x) => x.provinciaOrigen)) },
  { label: "SLAExtensionRequest.provinciaDestino", find: () => prisma.sLAExtensionRequest.findMany({ where: { provinciaDestino: { not: null } }, distinct: ["provinciaDestino"], select: { provinciaDestino: true } }).then((r) => r.map((x) => x.provinciaDestino)) },
  { label: "Lot.sentTo", find: () => prisma.lot.findMany({ where: { sentTo: { not: null } }, distinct: ["sentTo"], select: { sentTo: true } }).then((r) => r.map((x) => x.sentTo)) },
];

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

  const target = normalizeText(existing.nombre);
  const results = await Promise.all(
    PROVINCE_REFERENCES.map(async (reference) => ({
      label: reference.label,
      values: await reference.find(),
    })),
  );
  const references = results
    .filter(({ values }) =>
      values.some((value) => typeof value === "string" && normalizeText(value) === target),
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
