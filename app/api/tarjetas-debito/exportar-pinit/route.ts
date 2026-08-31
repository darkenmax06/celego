import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { generateDebitPinitExcel } from "@/lib/generators/debit-pinit-export";
import { prisma } from "@/lib/prisma";
import { CardProductType, DispatchOrigin, ImportBatchStatus } from "@prisma/client";
import { format } from "date-fns";

export async function GET(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const targetDate = dateParam ? new Date(dateParam) : new Date();

  const latestDispatchBatch = await prisma.cardImportBatch.findFirst({
    where: {
      origin: DispatchOrigin.BPD_DEBITO,
      status: ImportBatchStatus.COMPLETED,
    },
    orderBy: { createdAt: "desc" },
  });

  const cards = latestDispatchBatch
    ? await prisma.card.findMany({
        where: {
          productType: CardProductType.DEBITO,
          importBatchId: latestDispatchBatch.id,
        },
        include: {
          customer: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const exportCards = cards.map((c) => ({
    requestNumber: c.requestNumber || c.tc,
    nombre: c.customer.nombre,
    cedula: c.customer.cedula,
    provincia: c.provincia,
    zona: c.zona,
    direccionRaw: c.customer.direccionRaw || "",
    telefonosRaw: c.customer.telefonosRaw || "",
    dispatchDate: c.dispatchDate,
    metadata: c.metadata as Record<string, unknown> | null,
  }));

  const excelBuffer = generateDebitPinitExcel(exportCards, targetDate);
  const dateStr = format(targetDate, "yyyy-MM-dd");

  return new Response(excelBuffer as unknown as BodyInit, {
    headers: {
      "Content-Disposition": `attachment; filename="PINIT_${dateStr}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
