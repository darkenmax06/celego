import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { parseUrgentesImport } from "@/lib/importers/urgentes";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const parsed = parseUrgentesImport(Buffer.from(await file.arrayBuffer()));

  let linked = 0;
  for (const row of parsed.rows) {
    const card = await prisma.card.findFirst({
      where: {
        OR: [{ tc: row.tc }, { customer: { cedula: row.cedula } }],
      },
      orderBy: { createdAt: "desc" },
    });

    if (card) {
      linked += 1;
      await prisma.card.update({
        where: { id: card.id },
        data: { urgent: true },
      });
    }

    await prisma.urgentCase.create({
      data: {
        cardId: card?.id,
        tc: row.tc,
        cedula: row.cedula,
        provincia: row.provincia,
        telefono: row.telefono,
        status: row.status,
        direccion: row.direccion,
      },
    });
  }

  return NextResponse.json({
    imported: parsed.rows.length,
    linked,
    errors: parsed.errors,
  });
}
