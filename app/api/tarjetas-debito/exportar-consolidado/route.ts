import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { generateUpdatedConsolidadoExcel } from "@/lib/generators/debit-consolidado-export";
import { prisma } from "@/lib/prisma";
import { CardProductType } from "@prisma/client";
import { format } from "date-fns";

export async function GET(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const formatParam = url.searchParams.get("format")?.toLowerCase();
  if (formatParam === "xls") {
    return NextResponse.json(
      { error: "El consolidado preservado se descarga únicamente en formato XLSX" },
      { status: 406 },
    );
  }

  const exportConfig = await prisma.debitConsolidadoExportConfig.findUnique({
    where: { id: "default" },
    select: { dispatchDateFrom: true },
  });

  const cards = await prisma.card.findMany({
    where: {
      productType: CardProductType.DEBITO,
      ...(exportConfig?.dispatchDateFrom
        ? { dispatchDate: { gte: exportConfig.dispatchDateFrom } }
        : {}),
    },
    include: {
      customer: true,
      logs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const exportItems = cards.map((c) => {
    const latestNote = c.logs[0]?.note;
    return {
      id: c.id,
      requestNumber: c.requestNumber,
      tc: c.tc,
      cedula: c.customer.cedula,
      nombre: c.customer.nombre,
      provincia: c.provincia,
      zona: c.zona,
      direccionRaw: c.customer.direccionRaw || "",
      telefonosRaw: c.customer.telefonosRaw || "",
      status: c.status,
      dispatchDate: c.dispatchDate,
      deliveryDate: c.status === "TD_ENTREGADO" ? c.dispatchDate || c.updatedAt : null,
      updatedAt: c.updatedAt,
      isRemote: c.isRemote,
      comment: c.returnReason || latestNote || ((c.metadata as Record<string, unknown>)?.COMENTARIO as string) || null,
      recipientName: ((c.metadata as Record<string, unknown>)?.["QUIEN RECIBE"] as string) || null,
      thirdPartyInfo: ((c.metadata as Record<string, unknown>)?.["INFO TERCERO"] as string) || null,
      bpdComment: ((c.metadata as Record<string, unknown>)?.["Comentario BPD"] as string) || null,
      metadata: c.metadata as Record<string, unknown> | null,
      createdAt: c.createdAt,
    };
  });

  const excelBuffer = await generateUpdatedConsolidadoExcel(exportItems);
  const dateStr = format(new Date(), "yyyy-MM-dd");

  const filename = `CONSOLIDADO_DEBITO_${dateStr}.xlsx`;
  const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new Response(excelBuffer as unknown as BodyInit, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": contentType,
    },
  });
}
