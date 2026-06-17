import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import {
  CardStatus,
  MessengerServiceType,
  Prisma,
  RedactionStatus,
  RedactionType,
  RouteStatus,
  UserRole,
} from "@prisma/client";
import {
  bizcochitoCardInclude,
  buildBizcochitoExcel,
  createBizcochitoSnapshot,
} from "../lib/bizcochito";
import { ensureBaseCatalogs } from "../lib/bootstrap";
import { prisma } from "../lib/prisma";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Demo12345!";
const DEMO_NOTE = "Datos de prueba DEMO";
const HISTORICAL_BATCH_CODE = "BIZ-20260612-9001";

type DemoCardInput = {
  reference: string;
  tc: string;
  cedula: string;
  nombre: string;
  provincia: string;
  zona: string;
  status: CardStatus;
  currentMessengerId?: string | null;
  digitalDeliveryCycle?: number;
  bizcochito?: boolean;
  bizcochitoAt?: Date | null;
  isRemote?: boolean;
  returnReason?: string | null;
  dispatchDate?: Date;
};

function dateAt(daysOffset: number, hour = 10) {
  const value = new Date();
  value.setHours(hour, 0, 0, 0);
  value.setDate(value.getDate() + daysOffset);
  return value;
}

async function upsertDemoUser(
  email: string,
  name: string,
  role: UserRole,
) {
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash: await hash(DEMO_PASSWORD, 10),
      role,
      active: true,
    },
    create: {
      email,
      name,
      passwordHash: await hash(DEMO_PASSWORD, 10),
      role,
      active: true,
    },
  });
}

async function upsertDemoMessenger(input: {
  nombre: string;
  telefono: string;
  zonaPrincipal: string;
  provinciaTrabajo: string;
}) {
  const existing = await prisma.messenger.findFirst({
    where: { nombre: input.nombre },
  });
  const messenger = existing
    ? await prisma.messenger.update({
        where: { id: existing.id },
        data: { ...input, activo: true },
      })
    : await prisma.messenger.create({
        data: { ...input, activo: true },
      });

  const rates: Record<MessengerServiceType, number> = {
    NORMAL: 12000,
    REMOTA: 16500,
    RECOGIDA: 9000,
    MANDADO: 14000,
  };
  for (const serviceType of Object.values(MessengerServiceType)) {
    await prisma.messengerServiceRate.upsert({
      where: {
        messengerId_serviceType: {
          messengerId: messenger.id,
          serviceType,
        },
      },
      update: { amountCents: rates[serviceType] },
      create: {
        messengerId: messenger.id,
        serviceType,
        amountCents: rates[serviceType],
      },
    });
  }

  return messenger;
}

async function upsertDemoCard(input: DemoCardInput, byUserId: string) {
  const customer = await prisma.customer.upsert({
    where: { cedula: input.cedula },
    update: {
      nombre: input.nombre,
      telefonosRaw: "809-555-0101 / 829-555-0102",
      direccionRaw: `Calle Demo ${input.reference}, ${input.provincia}`,
      provincia: input.provincia,
      zona: input.zona,
    },
    create: {
      cedula: input.cedula,
      nombre: input.nombre,
      telefonosRaw: "809-555-0101 / 829-555-0102",
      direccionRaw: `Calle Demo ${input.reference}, ${input.provincia}`,
      provincia: input.provincia,
      zona: input.zona,
    },
  });

  const existing = await prisma.card.findFirst({
    where: { externalReference: input.reference },
  });
  const data = {
    tc: input.tc,
    externalReference: input.reference,
    customerId: customer.id,
    provincia: input.provincia,
    zona: input.zona,
    status: input.status,
    currentMessengerId: input.currentMessengerId ?? null,
    digitalDeliveryCycle: input.digitalDeliveryCycle ?? 0,
    bizcochito: input.bizcochito ?? false,
    bizcochitoAt: input.bizcochitoAt ?? null,
    isRemote: input.isRemote ?? false,
    returnReason: input.returnReason ?? null,
    dispatchDate: input.dispatchDate ?? dateAt(-2),
    deliveryType: "DOMICILIO",
    emissionType: "NUEVA",
    supplier: "BANCO DEMO",
    contractType: "MASIVO",
    metadata: { demo: true, tipoEntrega: "TITULAR" } as Prisma.InputJsonValue,
  };

  const card = existing
    ? await prisma.card.update({ where: { id: existing.id }, data })
    : await prisma.card.create({ data });

  const existingLog = await prisma.cardStatusLog.findFirst({
    where: { cardId: card.id, note: { startsWith: DEMO_NOTE } },
  });
  if (!existingLog) {
    await prisma.cardStatusLog.create({
      data: {
        cardId: card.id,
        fromStatus: null,
        toStatus: input.status,
        note: `${DEMO_NOTE}: ${input.reference}`,
        byUserId,
        createdAt:
          input.status === CardStatus.ENTREGA_DIGITAL
            ? dateAt(-1, 14)
            : dateAt(-2, 10),
      },
    });
  }

  return card;
}

async function seedHistoricalBizcochito(
  cardIds: string[],
  generatedById: string,
) {
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    include: bizcochitoCardInclude,
    orderBy: { externalReference: "asc" },
  });
  const snapshots = cards.map((card) =>
    createBizcochitoSnapshot(card, HISTORICAL_BATCH_CODE),
  );
  const file = await buildBizcochitoExcel(snapshots);
  const sha256 = createHash("sha256").update(file).digest("hex");
  const generatedAt = new Date("2026-06-12T14:00:00-04:00");

  const batch = await prisma.bizcochitoBatch.upsert({
    where: { code: HISTORICAL_BATCH_CODE },
    update: {
      generatedById,
      generatedAt,
      itemCount: cards.length,
      originalFileName: `${HISTORICAL_BATCH_CODE}.xlsx`,
      originalFile: file,
      originalSha256: sha256,
    },
    create: {
      code: HISTORICAL_BATCH_CODE,
      generatedById,
      generatedAt,
      itemCount: cards.length,
      originalFileName: `${HISTORICAL_BATCH_CODE}.xlsx`,
      originalFile: file,
      originalSha256: sha256,
    },
  });

  await prisma.bizcochitoItem.deleteMany({ where: { batchId: batch.id } });
  await prisma.bizcochitoItem.createMany({
    data: cards.map((card, index) => ({
      batchId: batch.id,
      cardId: card.id,
      digitalDeliveryCycle: card.digitalDeliveryCycle,
      sequence: index + 1,
      snapshot: snapshots[index] as unknown as Prisma.InputJsonValue,
    })),
  });
}

async function main() {
  await ensureBaseCatalogs();

  const [admin, operator, billing, messengerUser] = await Promise.all([
    upsertDemoUser("demo.admin@celego.local", "Admin Demo", UserRole.ADMIN),
    upsertDemoUser(
      "demo.operador@celego.local",
      "Operador Demo",
      UserRole.OPERADOR,
    ),
    upsertDemoUser(
      "demo.facturacion@celego.local",
      "Facturación Demo",
      UserRole.FACTURACION,
    ),
    upsertDemoUser(
      "demo.mensajero@celego.local",
      "Mensajero Demo",
      UserRole.MENSAJERO,
    ),
  ]);

  const [metroMessenger, santiagoMessenger, puntaCanaMessenger] =
    await Promise.all([
      upsertDemoMessenger({
        nombre: "DEMO - Carlos Metro",
        telefono: "809-555-1001",
        zonaPrincipal: "Metro",
        provinciaTrabajo: "Santo Domingo",
      }),
      upsertDemoMessenger({
        nombre: "DEMO - Ana Santiago",
        telefono: "809-555-1002",
        zonaPrincipal: "Norte",
        provinciaTrabajo: "Santiago",
      }),
      upsertDemoMessenger({
        nombre: "DEMO - Luis Punta Cana",
        telefono: "809-555-1003",
        zonaPrincipal: "Este",
        provinciaTrabajo: "Punta Cana",
      }),
    ]);

  const routeCards = [];
  for (let index = 1; index <= 45; index += 1) {
    routeCards.push(
      await upsertDemoCard(
        {
          reference: `DEMO-RUTA-${String(index).padStart(3, "0")}`,
          tc: `990100000000${String(index).padStart(4, "0")}`,
          cedula: `900000${String(index).padStart(5, "0")}`,
          nombre: `Cliente Ruta Demo ${String(index).padStart(2, "0")}`,
          provincia: "Santo Domingo",
          zona: "Metro",
          status: CardStatus.EN_RUTA,
          currentMessengerId: metroMessenger.id,
          dispatchDate: dateAt(-1),
        },
        operator.id,
      ),
    );
  }

  const routeNote = "DEMO: ruta con 45 tarjetas para validar multipagina";
  const existingRoute = await prisma.route.findFirst({ where: { notas: routeNote } });
  const route = existingRoute
    ? await prisma.route.update({
        where: { id: existingRoute.id },
        data: {
          fecha: dateAt(0, 8),
          messengerId: metroMessenger.id,
          status: RouteStatus.EN_PROCESO,
          createdById: operator.id,
        },
      })
    : await prisma.route.create({
        data: {
          fecha: dateAt(0, 8),
          messengerId: metroMessenger.id,
          status: RouteStatus.EN_PROCESO,
          notas: routeNote,
          createdById: operator.id,
        },
      });
  await prisma.routeItem.deleteMany({ where: { routeId: route.id } });
  await prisma.routeItem.createMany({
    data: routeCards.map((card, index) => ({
      routeId: route.id,
      cardId: card.id,
      sequence: index + 1,
      checkedAt: index < 8 ? dateAt(0, 9) : null,
    })),
  });

  const massCards = [];
  const massStatuses = [
    CardStatus.DESPACHADA,
    CardStatus.ENVIADA_INTERIOR,
    CardStatus.EN_RUTA,
    CardStatus.DESPACHADA,
    CardStatus.ENVIADA_INTERIOR,
  ];
  for (let index = 1; index <= 5; index += 1) {
    massCards.push(
      await upsertDemoCard(
        {
          reference: `DEMO-MASA-${String(index).padStart(3, "0")}`,
          tc: `DEMO-MASA-${String(index).padStart(3, "0")}`,
          cedula: `910000${String(index).padStart(5, "0")}`,
          nombre: `Cliente Masivo Demo ${index}`,
          provincia: index % 2 === 0 ? "Santiago" : "Santo Domingo",
          zona: index % 2 === 0 ? "Norte" : "Metro",
          status: massStatuses[index - 1],
          currentMessengerId:
            index % 2 === 0 ? santiagoMessenger.id : metroMessenger.id,
        },
        operator.id,
      ),
    );
  }

  const pendingDigitalCards = [];
  for (let index = 1; index <= 3; index += 1) {
    pendingDigitalCards.push(
      await upsertDemoCard(
        {
          reference: `DEMO-BIZ-PEND-${String(index).padStart(3, "0")}`,
          tc: `DEMO-BIZ-PEND-${String(index).padStart(3, "0")}`,
          cedula: `920000${String(index).padStart(5, "0")}`,
          nombre: `Cliente Bizcochito Pendiente ${index}`,
          provincia: index === 3 ? "Punta Cana" : "Santo Domingo",
          zona: index === 3 ? "Este" : "Metro",
          status: CardStatus.ENTREGA_DIGITAL,
          currentMessengerId:
            index === 3 ? puntaCanaMessenger.id : metroMessenger.id,
          digitalDeliveryCycle: 1,
          bizcochito: false,
          isRemote: index === 3,
        },
        operator.id,
      ),
    );
  }

  const historicalCards = [];
  for (let index = 1; index <= 2; index += 1) {
    historicalCards.push(
      await upsertDemoCard(
        {
          reference: `DEMO-BIZ-HIST-${String(index).padStart(3, "0")}`,
          tc: `DEMO-BIZ-HIST-${String(index).padStart(3, "0")}`,
          cedula: `930000${String(index).padStart(5, "0")}`,
          nombre: `Cliente Bizcochito Histórico ${index}`,
          provincia: "Santiago",
          zona: "Norte",
          status: CardStatus.ENTREGA_DIGITAL,
          currentMessengerId: santiagoMessenger.id,
          digitalDeliveryCycle: 1,
          bizcochito: true,
          bizcochitoAt: new Date("2026-06-12T14:00:00-04:00"),
        },
        operator.id,
      ),
    );
  }
  await seedHistoricalBizcochito(
    historicalCards.map((card) => card.id),
    operator.id,
  );

  const reassignedCard = await upsertDemoCard(
    {
      reference: "DEMO-REASIG-001",
      tc: "DEMO-REASIG-001",
      cedula: "94000000001",
      nombre: "Cliente Reasignación Demo",
      provincia: "Santo Domingo",
      zona: "Metro",
      status: CardStatus.ENTREGADA,
      currentMessengerId: metroMessenger.id,
    },
    operator.id,
  );
  await prisma.card.update({
    where: { id: reassignedCard.id },
    data: {
      reassignedProvince: "Santiago",
      reassignedZone: "Norte",
      reassignedMessengerId: santiagoMessenger.id,
      reassignedAt: dateAt(-1, 16),
    },
  });
  const reassignmentNote = "DEMO: entrega realizada en provincia distinta";
  const existingReassignment = await prisma.cardDeliveryReassignment.findFirst({
    where: { cardId: reassignedCard.id, note: reassignmentNote },
  });
  if (!existingReassignment) {
    await prisma.cardDeliveryReassignment.create({
      data: {
        cardId: reassignedCard.id,
        fromProvince: "Santo Domingo",
        fromZone: "Metro",
        fromMessengerId: metroMessenger.id,
        fromMessengerName: metroMessenger.nombre,
        toProvince: "Santiago",
        toZone: "Norte",
        toMessengerId: santiagoMessenger.id,
        toMessengerName: santiagoMessenger.nombre,
        note: reassignmentNote,
        byUserId: operator.id,
      },
    });
  }

  const redactionNote = "DEMO: relación para validar orden de pistoleo";
  const existingRedaction = await prisma.redaction.findFirst({
    where: { notas: redactionNote },
  });
  const redaction = existingRedaction
    ? await prisma.redaction.update({
        where: { id: existingRedaction.id },
        data: {
          tipo: RedactionType.ENTREGA,
          status: RedactionStatus.BORRADOR,
          zona: "Metro",
          fecha: dateAt(0, 11),
          anulada: false,
        },
      })
    : await prisma.redaction.create({
        data: {
          tipo: RedactionType.ENTREGA,
          status: RedactionStatus.BORRADOR,
          zona: "Metro",
          fecha: dateAt(0, 11),
          notas: redactionNote,
        },
      });
  await prisma.redactionItem.deleteMany({ where: { redactionId: redaction.id } });
  await prisma.redactionItem.createMany({
    data: massCards.map((card, index) => ({
      redactionId: redaction.id,
      cardId: card.id,
      appliedStatus: CardStatus.ENTREGADA,
      sequence: index + 1,
      comentario: `Orden pistoleado ${index + 1}`,
    })),
  });

  const auditFixtures = [
    {
      entity: "AUTH",
      entityId: operator.id,
      action: "LOGIN",
      result: "SUCCESS",
      userId: operator.id,
      targetUserId: operator.id,
      actorEmail: operator.email,
      details: { demo: true, channel: "WEB" },
    },
    {
      entity: "AUTH",
      entityId: operator.id,
      action: "LOGIN",
      result: "FAILURE",
      userId: null,
      targetUserId: operator.id,
      actorEmail: operator.email,
      details: { demo: true, reason: "INVALID_PASSWORD" },
    },
    {
      entity: "DEMO_SEED",
      entityId: "current",
      action: "CREATE_FIXTURES",
      result: "SUCCESS",
      userId: admin.id,
      targetUserId: messengerUser.id,
      actorEmail: admin.email,
      details: { demo: true, routeCards: 45, pendingBizcochitos: 3 },
    },
  ];
  for (const fixture of auditFixtures) {
    const exists = await prisma.auditLog.findFirst({
      where: {
        entity: fixture.entity,
        entityId: fixture.entityId,
        action: fixture.action,
        result: fixture.result,
        actorEmail: fixture.actorEmail,
        details: { path: ["demo"], equals: true },
      },
    });
    if (!exists) {
      await prisma.auditLog.create({
        data: {
          ...fixture,
          details: fixture.details as Prisma.InputJsonValue,
        },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        credentials: {
          password: DEMO_PASSWORD,
          users: [admin.email, operator.email, billing.email, messengerUser.email],
        },
        messengers: 3,
        route: { id: route.id, cards: routeCards.length },
        massUpdateCards: massCards.map((card) => card.tc),
        pendingBizcochitos: pendingDigitalCards.length,
        historicalBizcochito: HISTORICAL_BATCH_CODE,
        reassignedCard: reassignedCard.tc,
        redactionId: redaction.id,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
