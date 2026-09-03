import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

const dateOnly = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().slice(0, 10) : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha invalida")
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Fecha invalida"),
);

const schema = z.object({
  dispatchDateFrom: z
    .union([dateOnly, z.literal(""), z.null()])
    .transform((value) => (value === null || value === "" ? null : new Date(`${value}T00:00:00.000Z`))),
});

export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const config = await prisma.debitConsolidadoExportConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", dispatchDateFrom: null },
  });

  return NextResponse.json({ config });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Payload invalido",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const config = await prisma.debitConsolidadoExportConfig.upsert({
    where: { id: "default" },
    update: {
      dispatchDateFrom: parsed.data.dispatchDateFrom,
      updatedById: auth.session.user.id,
    },
    create: {
      id: "default",
      dispatchDateFrom: parsed.data.dispatchDateFrom,
      updatedById: auth.session.user.id,
    },
  });

  return NextResponse.json({ config });
}
