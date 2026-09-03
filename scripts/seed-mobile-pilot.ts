import {
  CardStatus,
  MobileDeviceStatus,
  MobileIncidentSeverity,
  MobileIncidentStatus,
  MobileSyncJobKind,
  MobileSyncJobStatus,
  Prisma,
  SecureEvidenceKind,
  SecureEvidenceStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ensureBaseCatalogs } from "../lib/bootstrap";

const PILOT_PREFIX = "PILOT-MOB";
const DEVICE_PREFIX = "DEV-PILOT";

const messengerFixtures = [
  ["PILOTO MOVIL - Santo Domingo 01", "Metro", "Santo Domingo"],
  ["PILOTO MOVIL - Santo Domingo 02", "Metro", "Santo Domingo"],
  ["PILOTO MOVIL - Santiago 01", "Norte", "Santiago"],
  ["PILOTO MOVIL - Punta Cana 01", "Este", "Punta Cana"],
  ["PILOTO MOVIL - San Cristobal 01", "Sur", "San Cristobal"],
  ["PILOTO MOVIL - San Pedro 01", "Este", "San Pedro"],
] as const;

function dateAt(hoursOffset: number) {
  const value = new Date();
  value.setMinutes(0, 0, 0);
  value.setHours(value.getHours() + hoursOffset);
  return value;
}

function evidenceCryptoPayload(seed: number) {
  return {
    encryptionAlgorithm: "AES-256-GCM",
    keyEncryptionAlgorithm: "RSA-OAEP-SHA256",
    encryptedKey: Buffer.alloc(256, seed).toString("base64"),
    nonce: Buffer.alloc(12, seed + 1).toString("base64"),
    authTag: Buffer.alloc(16, seed + 2).toString("base64"),
    sha256: String(seed).repeat(64).slice(0, 64),
    byteSize: 2048 + seed,
  };
}

async function upsertMessenger(index: number) {
  const [nombre, zonaPrincipal, provinciaTrabajo] = messengerFixtures[index];
  const existing = await prisma.messenger.findFirst({ where: { nombre } });
  const data = {
    nombre,
    zonaPrincipal,
    provinciaTrabajo,
    telefono: `809-777-10${String(index + 1).padStart(2, "0")}`,
    activo: true,
  };

  return existing
    ? prisma.messenger.update({ where: { id: existing.id }, data })
    : prisma.messenger.create({ data });
}

async function upsertCard(input: {
  index: number;
  messengerId: string | null;
  status: CardStatus;
  province: string;
  zone: string;
}) {
  const reference = `${PILOT_PREFIX}-CARD-${String(input.index).padStart(3, "0")}`;
  const cedula = `970000${String(input.index).padStart(5, "0")}`;
  const customer = await prisma.customer.upsert({
    where: { cedula },
    update: {
      nombre: `Cliente Piloto ${String(input.index).padStart(2, "0")}`,
      telefonosRaw: `809-777-${String(input.index).padStart(4, "0")}`,
      direccionRaw: `Direccion piloto ${input.index}, ${input.province}`,
      provincia: input.province,
      zona: input.zone,
    },
    create: {
      cedula,
      nombre: `Cliente Piloto ${String(input.index).padStart(2, "0")}`,
      telefonosRaw: `809-777-${String(input.index).padStart(4, "0")}`,
      direccionRaw: `Direccion piloto ${input.index}, ${input.province}`,
      provincia: input.province,
      zona: input.zone,
    },
  });

  const data = {
    tc: `PILOTTC${String(input.index).padStart(8, "0")}`,
    externalReference: reference,
    customerId: customer.id,
    provincia: input.province,
    zona: input.zone,
    status: input.status,
    currentMessengerId: input.messengerId,
    dispatchDate: dateAt(-24),
    deliveryType: "DOMICILIO",
    emissionType: "NUEVA",
    supplier: "BANCO PILOTO",
    contractType: "PILOTO",
    metadata: { pilotMobile: true, source: "seed-mobile-pilot" } as Prisma.InputJsonValue,
  };

  const existing = await prisma.card.findFirst({ where: { externalReference: reference } });
  return existing
    ? prisma.card.update({ where: { id: existing.id }, data })
    : prisma.card.create({ data });
}

async function upsertDevice(input: {
  index: number;
  messengerId: string | null;
  status: MobileDeviceStatus;
  lastSeenAt: Date | null;
}) {
  const deviceId = `${DEVICE_PREFIX}-${String(input.index).padStart(3, "0")}`;
  return prisma.mobileDevice.upsert({
    where: { deviceId },
    update: {
      label: `Piloto movil ${String(input.index).padStart(2, "0")}`,
      platform: "ANDROID",
      status: input.status,
      messengerId: input.messengerId,
      lastSeenAt: input.lastSeenAt,
      publicKey: `PILOT_PUBLIC_KEY_${input.index}`,
    },
    create: {
      deviceId,
      label: `Piloto movil ${String(input.index).padStart(2, "0")}`,
      platform: "ANDROID",
      status: input.status,
      messengerId: input.messengerId,
      lastSeenAt: input.lastSeenAt,
      publicKey: `PILOT_PUBLIC_KEY_${input.index}`,
    },
  });
}

async function upsertEvidence(input: {
  index: number;
  cardId: string;
  messengerId: string;
  deviceId: string;
  mobileDeviceId: string;
  status: SecureEvidenceStatus;
  kind: SecureEvidenceKind;
}) {
  const crypto = evidenceCryptoPayload(input.index);
  const deliveryId = `PILOT-DLV-${String(input.index).padStart(3, "0")}`;
  const objectId = `PILOT-OBJ-${String(input.index).padStart(3, "0")}`;

  return prisma.secureEvidence.upsert({
    where: { objectId },
    update: {
      status: input.status,
      messengerId: input.messengerId,
      deviceId: input.deviceId,
      mobileDeviceId: input.mobileDeviceId,
      cardId: input.cardId,
      sha256: crypto.sha256,
      byteSize: crypto.byteSize,
      capturedAt: dateAt(-input.index),
      relayReceivedAt: dateAt(-input.index),
      decryptedAt: input.status === SecureEvidenceStatus.DECRYPTED ? dateAt(-input.index + 1) : null,
      expiresAt: dateAt(72),
    },
    create: {
      deliveryId,
      objectId,
      evidenceKind: input.kind,
      cardId: input.cardId,
      messengerId: input.messengerId,
      deviceId: input.deviceId,
      mobileDeviceId: input.mobileDeviceId,
      status: input.status,
      sha256: crypto.sha256,
      byteSize: crypto.byteSize,
      encryptedKey: crypto.encryptedKey,
      nonce: crypto.nonce,
      authTag: crypto.authTag,
      capturedAt: dateAt(-input.index),
      relayReceivedAt: dateAt(-input.index),
      decryptedAt: input.status === SecureEvidenceStatus.DECRYPTED ? dateAt(-input.index + 1) : null,
      expiresAt: dateAt(72),
      manifest: {
        pilotMobile: true,
        source: "seed-mobile-pilot",
      } as Prisma.InputJsonValue,
    },
  });
}

async function upsertIncident(input: {
  index: number;
  messengerId: string;
  deviceId: string;
  mobileDeviceId: string;
  cardId: string;
  severity: MobileIncidentSeverity;
  title: string;
}) {
  const incidentId = `PILOT-INC-${String(input.index).padStart(3, "0")}`;
  return prisma.mobileIncident.upsert({
    where: { incidentId },
    update: {
      severity: input.severity,
      status: MobileIncidentStatus.OPEN,
      title: input.title,
      reportedAt: dateAt(-input.index),
      metadata: { pilotMobile: true } as Prisma.InputJsonValue,
    },
    create: {
      incidentId,
      severity: input.severity,
      status: MobileIncidentStatus.OPEN,
      type: input.severity === MobileIncidentSeverity.HIGH ? "SECURITY_CONCERN" : "NETWORK_PROBLEM",
      title: input.title,
      description: "Incidencia generada para simulacion controlada de piloto.",
      deviceId: input.deviceId,
      mobileDeviceId: input.mobileDeviceId,
      messengerId: input.messengerId,
      cardId: input.cardId,
      reportedAt: dateAt(-input.index),
      metadata: { pilotMobile: true } as Prisma.InputJsonValue,
    },
  });
}

async function ensureSyncJob(input: {
  kind: MobileSyncJobKind;
  status: MobileSyncJobStatus;
  deviceId: string;
  mobileDeviceId: string;
  messengerId: string;
  objectId: string;
}) {
  const existing = await prisma.mobileSyncJob.findFirst({
    where: {
      kind: input.kind,
      objectId: input.objectId,
    },
  });
  if (existing) {
    return prisma.mobileSyncJob.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        deviceId: input.deviceId,
        mobileDeviceId: input.mobileDeviceId,
        messengerId: input.messengerId,
        attempts: input.status === MobileSyncJobStatus.DEAD_LETTER ? 5 : 1,
        completedAt: input.status === MobileSyncJobStatus.SUCCEEDED ? new Date() : null,
        lastError:
          input.status === MobileSyncJobStatus.DEAD_LETTER
            ? "Simulacion: descarga core no confirmada"
            : null,
        payload: { pilotMobile: true } as Prisma.InputJsonValue,
      },
    });
  }

  return prisma.mobileSyncJob.create({
    data: {
      kind: input.kind,
      status: input.status,
      deviceId: input.deviceId,
      mobileDeviceId: input.mobileDeviceId,
      messengerId: input.messengerId,
      objectId: input.objectId,
      attempts: input.status === MobileSyncJobStatus.DEAD_LETTER ? 5 : 1,
      completedAt: input.status === MobileSyncJobStatus.SUCCEEDED ? new Date() : null,
      lastError:
        input.status === MobileSyncJobStatus.DEAD_LETTER
          ? "Simulacion: descarga core no confirmada"
          : null,
      payload: { pilotMobile: true } as Prisma.InputJsonValue,
    },
  });
}

async function main() {
  await ensureBaseCatalogs();

  const messengers = [];
  for (let index = 0; index < messengerFixtures.length; index += 1) {
    messengers.push(await upsertMessenger(index));
  }

  const devices = [];
  for (let index = 0; index < 8; index += 1) {
    const messenger = messengers[index % messengers.length];
    const status =
      index === 5
        ? MobileDeviceStatus.PENDING
        : index === 6
          ? MobileDeviceStatus.LOST
          : index === 7
            ? MobileDeviceStatus.REVOKED
            : MobileDeviceStatus.ACTIVE;
    devices.push(
      await upsertDevice({
        index: index + 1,
        messengerId: status === MobileDeviceStatus.PENDING ? null : messenger.id,
        status,
        lastSeenAt: status === MobileDeviceStatus.ACTIVE ? dateAt(index === 4 ? -30 : -1) : null,
      }),
    );
  }

  const cards = [];
  let cardIndex = 1;
  for (const messenger of messengers) {
    for (let offset = 0; offset < 3; offset += 1) {
      cards.push(
        await upsertCard({
          index: cardIndex,
          messengerId: messenger.id,
          status: offset === 0 ? CardStatus.EN_RUTA : CardStatus.DESPACHADA,
          province: messenger.provinciaTrabajo ?? "Santo Domingo",
          zone: messenger.zonaPrincipal ?? "Metro",
        }),
      );
      cardIndex += 1;
    }
  }
  for (let index = 0; index < 4; index += 1) {
    const messenger = messengers[index % messengers.length];
    cards.push(
      await upsertCard({
        index: cardIndex,
        messengerId: messenger.id,
        status: index % 2 === 0 ? CardStatus.ENTREGADA : CardStatus.RETORNADA,
        province: messenger.provinciaTrabajo ?? "Santo Domingo",
        zone: messenger.zonaPrincipal ?? "Metro",
      }),
    );
    cardIndex += 1;
  }

  const activeDevices = devices.filter((device) => device.status === MobileDeviceStatus.ACTIVE);
  for (let index = 0; index < 8; index += 1) {
    const device = activeDevices[index % activeDevices.length];
    const card = cards[index];
    await upsertEvidence({
      index: index + 1,
      cardId: card.id,
      messengerId: card.currentMessengerId ?? messengers[0].id,
      deviceId: device.deviceId,
      mobileDeviceId: device.id,
      status: index < 3 ? SecureEvidenceStatus.DECRYPTED : SecureEvidenceStatus.UPLOADED_RELAY,
      kind: index % 2 === 0 ? SecureEvidenceKind.ACUSE : SecureEvidenceKind.CEDULA,
    });
    await ensureSyncJob({
      kind: MobileSyncJobKind.EVIDENCE_UPLOAD,
      status: index === 7 ? MobileSyncJobStatus.DEAD_LETTER : MobileSyncJobStatus.SUCCEEDED,
      deviceId: device.deviceId,
      mobileDeviceId: device.id,
      messengerId: card.currentMessengerId ?? messengers[0].id,
      objectId: `PILOT-OBJ-${String(index + 1).padStart(3, "0")}`,
    });
  }

  await upsertIncident({
    index: 1,
    messengerId: messengers[0].id,
    deviceId: activeDevices[0].deviceId,
    mobileDeviceId: activeDevices[0].id,
    cardId: cards[0].id,
    severity: MobileIncidentSeverity.MEDIUM,
    title: "Intermitencia de datos en zona piloto",
  });
  await upsertIncident({
    index: 2,
    messengerId: messengers[2].id,
    deviceId: activeDevices[2].deviceId,
    mobileDeviceId: activeDevices[2].id,
    cardId: cards[6].id,
    severity: MobileIncidentSeverity.HIGH,
    title: "Revision de seguridad requerida",
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        messengers: messengers.length,
        devices: devices.length,
        cards: cards.length,
        activeDevices: activeDevices.length,
        note: "Datos de simulacion del piloto movil creados/actualizados.",
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
