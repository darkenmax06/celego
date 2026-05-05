import { prisma } from "@/lib/prisma";
import { PROVINCIAS_INICIALES, RETURN_REASONS_DEFAULT, ZONAS } from "@/lib/constants";

export async function ensureBaseCatalogs() {
  await prisma.sLAConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", businessDays: 5 },
  });

  for (const p of PROVINCIAS_INICIALES) {
    await prisma.provinceConfig.upsert({
      where: { nombre: p.nombre },
      update: { zona: p.zona },
      create: { nombre: p.nombre, zona: p.zona },
    });
  }

  for (const reason of RETURN_REASONS_DEFAULT) {
    await prisma.returnReason.upsert({
      where: { nombre: reason },
      update: {},
      create: { nombre: reason },
    });
  }

  for (const zona of [...ZONAS, "REMOTA"]) {
    await prisma.zoneTariff.upsert({
      where: { zona },
      update: {},
      create: { zona, baseCents: 0 },
    });
  }

  await prisma.billingConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", remoteSurchargeCents: 0 },
  });
}
