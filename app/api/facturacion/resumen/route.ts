import { NextRequest, NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { requireApiSession } from "@/lib/api-session";
import { dedupeBillingCardsByCustomerAndDispatchDate } from "@/lib/billing";
import { resolveBillableZone } from "@/lib/delivery-location";
import { prisma } from "@/lib/prisma";

function resolveCentsPerCard(
  count: number,
  baseCents: number,
  ranges: Array<{ minQty: number; maxQty: number | null; centsPerCard: number }>,
) {
  const match = ranges.find(
    (range) => count >= range.minQty && (range.maxQty == null || count <= range.maxQty),
  );
  return match?.centsPerCard ?? baseCents;
}

function parseFxRate(raw: string | null) {
  if (!raw) return 1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

type SummaryRow = {
  zona: string;
  tarjetasEntregadas: number;
  tarifaAplicada: number;
  tarifaAplicadaUsdCents: number;
  totalCents: number;
  totalUsdCents: number;
  totalDopCents: number;
  isRemoteSurcharge?: boolean;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "FACTURACION", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const fromStr = request.nextUrl.searchParams.get("from");
  const toStr = request.nextUrl.searchParams.get("to");
  const zona = request.nextUrl.searchParams.get("zona");
  const fxRate = parseFxRate(request.nextUrl.searchParams.get("fxRate"));

  const where: Record<string, unknown> = {
    status: CardStatus.ENTREGADA,
  };

  if (fromStr || toStr) {
    const fromDate = fromStr ? new Date(fromStr) : null;
    const toDate = toStr ? new Date(toStr) : null;
    if (toDate) {
      toDate.setHours(23, 59, 59, 999);
    }
    where.dispatchDate = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }
  if (zona && zona !== "ALL") {
    where.OR = [
      { reassignedZone: zona },
      {
        reassignedZone: null,
        zona,
      },
    ];
  }

  const [cards, tariffs] = await Promise.all([
    prisma.card.findMany({
      where,
      select: {
        id: true,
        zona: true,
        provincia: true,
        reassignedProvince: true,
        reassignedZone: true,
        isRemote: true,
        dispatchDate: true,
        customer: {
          select: {
            cedula: true,
          },
        },
      },
      orderBy: { dispatchDate: "desc" },
      take: 5000,
    }),
    prisma.zoneTariff.findMany({ where: { active: true }, include: { ranges: true } }),
  ]);

  const billableCards = dedupeBillingCardsByCustomerAndDispatchDate(
    cards.map((card) => ({
      id: card.id,
      zona: resolveBillableZone(card),
      isRemote: card.isRemote,
      dispatchDate: card.dispatchDate,
      customerCedula: card.customer.cedula,
    })),
  );

  const tariffMap = new Map(tariffs.map((tariff) => [tariff.zona, tariff]));

  const grouped = new Map<
    string,
    {
      zona: string;
      count: number;
      centsPerCard: number;
      totalCents: number;
    }
  >();

  for (const card of billableCards) {
    const key = card.zona;
    const current = grouped.get(key) ?? {
      zona: key,
      count: 0,
      centsPerCard: 0,
      totalCents: 0,
    };

    current.count += 1;
    grouped.set(key, current);
  }

  const zonesOrder = ["Metro", "Este", "Norte", "Sur"];
  const rows: SummaryRow[] = Array.from(grouped.values())
    .sort((a, b) => {
      const ai = zonesOrder.indexOf(a.zona);
      const bi = zonesOrder.indexOf(b.zona);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.zona.localeCompare(b.zona);
    })
    .map((item): SummaryRow => {
      const tariff = tariffMap.get(item.zona);
      const centsPerCard = resolveCentsPerCard(
        item.count,
        tariff?.baseCents ?? 0,
        tariff?.ranges ?? [],
      );

      const totalUsdCents = centsPerCard * item.count;
      const totalDopCents = Math.round(totalUsdCents * fxRate);
      return {
        zona: item.zona,
        tarjetasEntregadas: item.count,
        tarifaAplicada: centsPerCard,
        tarifaAplicadaUsdCents: centsPerCard,
        totalCents: totalUsdCents,
        totalUsdCents,
        totalDopCents,
      };
    });

  const remoteCount = billableCards.filter((card) => card.isRemote).length;
  const remoteTariff = tariffMap.get("REMOTA");
  const remoteSurchargeCents = resolveCentsPerCard(
    remoteCount,
    remoteTariff?.baseCents ?? 0,
    remoteTariff?.ranges ?? [],
  );
  const remoteTotalUsdCents = remoteCount * remoteSurchargeCents;
  const remoteTotalDopCents = Math.round(remoteTotalUsdCents * fxRate);
  if (remoteCount > 0) {
    rows.push({
      zona: "REMOTA",
      tarjetasEntregadas: remoteCount,
      tarifaAplicada: remoteSurchargeCents,
      tarifaAplicadaUsdCents: remoteSurchargeCents,
      totalCents: remoteTotalUsdCents,
      totalUsdCents: remoteTotalUsdCents,
      totalDopCents: remoteTotalDopCents,
      isRemoteSurcharge: true,
    });
  }

  const totalUsdCents = rows.reduce((acc, row) => acc + row.totalUsdCents, 0);
  const totalDopCents = rows.reduce((acc, row) => acc + row.totalDopCents, 0);

  return NextResponse.json({
    rows,
    fxRate,
    remoteSurchargeCents,
    remoteCount,
    totalCents: totalUsdCents,
    totalUsdCents,
    totalDopCents,
    totalEntregas: billableCards.length,
  });
}
