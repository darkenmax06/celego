import { prisma } from "../lib/prisma";

const PILOT_CARD_PREFIX = "PILOT-MOB-CARD-";
const PILOT_MESSENGER_PREFIX = "PILOTO MOVIL -";
const PILOT_DEVICE_PREFIX = "DEV-PILOT-";
const PILOT_OBJECT_PREFIX = "PILOT-OBJ-";
const PILOT_DELIVERY_PREFIX = "PILOT-DLV-";
const PILOT_INCIDENT_PREFIX = "PILOT-INC-";

async function main() {
  const cards = await prisma.card.findMany({
    where: { externalReference: { startsWith: PILOT_CARD_PREFIX } },
    select: { id: true, customerId: true },
  });
  const cardIds = cards.map((card) => card.id);
  const customerIds = [...new Set(cards.map((card) => card.customerId))];

  const evidences = await prisma.secureEvidence.findMany({
    where: {
      OR: [
        { objectId: { startsWith: PILOT_OBJECT_PREFIX } },
        { deliveryId: { startsWith: PILOT_DELIVERY_PREFIX } },
        ...(cardIds.length ? [{ cardId: { in: cardIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const evidenceIds = evidences.map((evidence) => evidence.id);

  const incidents = await prisma.mobileIncident.findMany({
    where: {
      OR: [
        { incidentId: { startsWith: PILOT_INCIDENT_PREFIX } },
        { deviceId: { startsWith: PILOT_DEVICE_PREFIX } },
        ...(cardIds.length ? [{ cardId: { in: cardIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const incidentIds = incidents.map((incident) => incident.id);

  const jobs = await prisma.mobileSyncJob.findMany({
    where: {
      OR: [
        { objectId: { startsWith: PILOT_OBJECT_PREFIX } },
        { deviceId: { startsWith: PILOT_DEVICE_PREFIX } },
        ...(evidenceIds.length ? [{ secureEvidenceId: { in: evidenceIds } }] : []),
        ...(incidentIds.length ? [{ incidentId: { in: incidentIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const jobIds = jobs.map((job) => job.id);

  await prisma.$transaction([
    ...(jobIds.length
      ? [prisma.mobileSyncAttempt.deleteMany({ where: { jobId: { in: jobIds } } })]
      : []),
    ...(jobIds.length
      ? [prisma.mobileSyncJob.deleteMany({ where: { id: { in: jobIds } } })]
      : []),
    ...(incidentIds.length
      ? [prisma.mobileIncident.deleteMany({ where: { id: { in: incidentIds } } })]
      : []),
    ...(evidenceIds.length
      ? [prisma.secureEvidence.deleteMany({ where: { id: { in: evidenceIds } } })]
      : []),
    prisma.mobileDevice.deleteMany({
      where: { deviceId: { startsWith: PILOT_DEVICE_PREFIX } },
    }),
    ...(cardIds.length
      ? [prisma.cardStatusLog.deleteMany({ where: { cardId: { in: cardIds } } })]
      : []),
    ...(cardIds.length ? [prisma.card.deleteMany({ where: { id: { in: cardIds } } })] : []),
    ...(customerIds.length
      ? [prisma.customer.deleteMany({ where: { id: { in: customerIds } } })]
      : []),
    prisma.messenger.deleteMany({
      where: { nombre: { startsWith: PILOT_MESSENGER_PREFIX } },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        removed: {
          cards: cardIds.length,
          customers: customerIds.length,
          evidences: evidenceIds.length,
          incidents: incidentIds.length,
          syncJobs: jobIds.length,
        },
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
