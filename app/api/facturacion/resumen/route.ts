import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { loadBillingReport } from "@/lib/billing-report";
import { MissingBillingTariffError } from "@/lib/billing";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "FACTURACION", "OPERADOR"]);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const from = params.get("from") ? new Date(params.get("from")!) : null;
  const to = params.get("to") ? new Date(params.get("to")!) : null;
  const fxRate = Number(params.get("fxRate") ?? 1);
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to) || !Number.isFinite(fxRate) || fxRate <= 0) {
    return NextResponse.json({ error: "Rango de fechas o tasa USD invalido" }, { status: 400 });
  }
  to?.setUTCHours(23, 59, 59, 999);
  try {
    const report = await loadBillingReport(from, to, fxRate, params.get("zona"));
    return NextResponse.json({
      rows: report.items.map((item) => ({
        ...item, tarjetasEntregadas: item.qty, tarifaAplicada: item.unitUsdCents,
        tarifaAplicadaUsdCents: item.unitUsdCents, totalCents: item.totalUsdCents,
      })),
      fxRate,
      remoteCount: report.items.filter((item) => item.isRemoteSurcharge).reduce((sum, item) => sum + item.qty, 0),
      additionalExcluded: report.additionalExcluded,
      totalCents: report.totalUsdCents,
      totalUsdCents: report.totalUsdCents,
      totalDopCents: report.totalDopCents,
      totalEntregas: report.totalEntregas,
    });
  } catch (error) {
    if (error instanceof MissingBillingTariffError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
