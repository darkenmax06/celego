import { prisma } from "@/lib/prisma";
import { calculateBilling } from "@/lib/billing";
import { resolveBillableZone } from "@/lib/delivery-location";
import type { Prisma } from "@prisma/client";

export async function loadBillingReport(from: Date | null, to: Date | null, fxRate: number, zona?: string | null) {
  const where: Prisma.CardWhereInput = {
    OR: [
      { productType: "CREDITO", status: "ENTREGADA" },
      { productType: "DEBITO", status: "TD_ENTREGADO" },
    ],
    ...(from || to ? { dispatchDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(zona && zona !== "ALL" ? { AND: [{ OR: [{ reassignedZone: zona }, { reassignedZone: null, zona }] }] } : {}),
  };
  const [cards, tariffs] = await Promise.all([
    prisma.card.findMany({
      where,
      select: {
        id: true, productType: true, zona: true, provincia: true,
        reassignedProvince: true, reassignedZone: true, isRemote: true,
        isAdditional: true, dispatchDate: true, customer: { select: { cedula: true } },
      },
      orderBy: [{ dispatchDate: "desc" }, { id: "asc" }],
    }),
    prisma.zoneTariff.findMany({ where: { active: true }, include: { ranges: true } }),
  ]);
  return calculateBilling(cards.map((card) => ({
    ...card, zona: resolveBillableZone(card), customerCedula: card.customer.cedula,
  })), tariffs, fxRate);
}
