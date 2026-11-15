import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { periodReportFileName, readStoredReport } from "@/lib/payroll/period-report";

/** Downloads the stored image of a messenger report (same roles as the report generator). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const report = await prisma.messengerReport.findUnique({
    where: { id },
    include: { messenger: { select: { nombre: true } }, payrollPeriod: { select: { label: true } } },
  });
  if (!report?.imagePath) {
    return NextResponse.json({ error: "Reporte sin imagen guardada" }, { status: 404 });
  }

  const image = await readStoredReport(report.imagePath);
  if (!image) {
    return NextResponse.json({ error: "La imagen del reporte ya no esta disponible. Regenerela desde Periodos y pagos." }, { status: 404 });
  }

  const label = report.payrollPeriod?.label ?? `${report.fromDate.toISOString().slice(0, 10)}_${report.toDate.toISOString().slice(0, 10)}`;
  const fileName = periodReportFileName(report.messenger.nombre, label);
  return new NextResponse(Uint8Array.from(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.length),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
