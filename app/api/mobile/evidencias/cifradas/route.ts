import { NextRequest, NextResponse } from "next/server";
import {
  CardStatus,
  MobileDeviceStatus,
  Prisma,
  SecureEvidenceKind,
  SecureEvidenceStatus,
  UserRole,
} from "@prisma/client";
import {
  findPiiViolation,
  SecureEvidenceRegistrationSchema,
} from "@/packages/contracts/src";
import { canAccessMobileAssignedCard } from "@/lib/mobile-authorization";
import { buildEvidenceProcessingJobData } from "@/lib/mobile-sync";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";
import { clearUrgencyOnCardClosure } from "@/lib/urgent-alerts";

export async function POST(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const raw = await request.json();
  const piiViolation = findPiiViolation(raw);
  if (piiViolation) {
    return NextResponse.json(
      {
        error: "Payload contiene PII no permitida para evidencia cifrada",
        path: piiViolation.path,
        reason: piiViolation.reason,
      },
      { status: 400 },
    );
  }

  const parsed = SecureEvidenceRegistrationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const manifest = parsed.data;
  const [device, item, cardById] = await Promise.all([
    prisma.mobileDevice.findUnique({
      where: { deviceId: manifest.deviceId },
      select: {
        id: true,
        deviceId: true,
        messengerId: true,
        status: true,
      },
    }),
    manifest.routeItemId
      ? prisma.routeItem.findUnique({
          where: { id: manifest.routeItemId },
          include: {
            route: true,
            card: true,
          },
        })
      : Promise.resolve(null),
    manifest.cardId
      ? prisma.card.findUnique({
          where: { id: manifest.cardId },
        })
      : Promise.resolve(null),
  ]);

  if (!device) {
    return NextResponse.json({ error: "Dispositivo no registrado" }, { status: 403 });
  }
  if (device.status !== MobileDeviceStatus.ACTIVE) {
    return NextResponse.json({ error: "Dispositivo no activo" }, { status: 403 });
  }
  if (manifest.routeItemId && !item) {
    return NextResponse.json({ error: "Item de ruta no encontrado" }, { status: 404 });
  }

  const card = cardById ?? item?.card ?? null;
  if (!card) {
    return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  }
  if (manifest.cardId && item && item.cardId !== manifest.cardId) {
    return NextResponse.json(
      { error: "routeItemId no corresponde a cardId" },
      { status: 400 },
    );
  }
  if (item && item.route.messengerId !== card.currentMessengerId) {
    return NextResponse.json(
      { error: "Item de ruta no corresponde al mensajero actual de la tarjeta" },
      { status: 403 },
    );
  }

  const access = canAccessMobileAssignedCard({
    role: auth.session.user.role,
    sessionMessengerId: auth.session.user.messengerId,
    cardMessengerId: card.currentMessengerId,
    deviceMessengerId: device.messengerId,
    deviceStatus: device.status,
    cardStatus: card.status,
  });
  if (!access.allowed) {
    return NextResponse.json({ error: "No autorizado", reason: access.reason }, { status: 403 });
  }
  const cardMessengerId = card.currentMessengerId;
  if (!cardMessengerId) {
    return NextResponse.json({ error: "Tarjeta sin mensajero asignado" }, { status: 403 });
  }

  const now = new Date();
  const nextStatus = resolveNextCardStatus(manifest.markAs);

  const evidence = await prisma.$transaction(async (tx) => {
    const createdEvidence = await tx.secureEvidence.upsert({
      where: { objectId: manifest.objectId },
      update: {
        status: SecureEvidenceStatus.UPLOADED_RELAY,
        relayReceivedAt: now,
        manifest: manifest as unknown as Prisma.InputJsonValue,
      },
      create: {
        deliveryId: manifest.deliveryId,
        objectId: manifest.objectId,
        evidenceKind: manifest.evidenceKind as SecureEvidenceKind,
        routeId: item?.route.id ?? null,
        routeItemId: item?.id ?? null,
        cardId: card.id,
        messengerId: cardMessengerId,
        deviceId: manifest.deviceId,
        mobileDeviceId: device.id,
        status: SecureEvidenceStatus.UPLOADED_RELAY,
        sha256: manifest.blob.sha256,
        byteSize: manifest.blob.byteSize,
        encryptionAlgorithm: manifest.encryption.algorithm,
        keyEncryptionAlgorithm: manifest.encryption.keyEncryptionAlgorithm,
        encryptedKey: manifest.encryption.encryptedKey,
        nonce: manifest.encryption.nonce,
        authTag: manifest.encryption.authTag,
        capturedAt: new Date(manifest.capturedAt),
        relayReceivedAt: now,
        expiresAt: new Date(manifest.expiresAt),
        manifest: manifest as unknown as Prisma.InputJsonValue,
      },
    });

    if (nextStatus) {
      if (item) {
        await tx.routeItem.update({
          where: { id: item.id },
          data: { checkedAt: nextStatus === CardStatus.EN_RUTA ? null : now },
        });
      }

      await tx.card.update({
        where: { id: card.id },
        data: {
          status: nextStatus,
          currentMessengerId: cardMessengerId,
          returnReason: nextStatus === CardStatus.DEVUELTA_TIENDA ? manifest.note ?? null : null,
        },
      });

      await clearUrgencyOnCardClosure({
        tx,
        cardId: card.id,
        nextStatus,
        byUserId: auth.session.user.id,
      });
    }

    await tx.cardStatusLog.create({
      data: {
        cardId: card.id,
        fromStatus: card.status,
        toStatus: nextStatus ?? card.status,
        note: manifest.note
          ? `Evidencia cifrada registrada (${manifest.objectId}) - ${manifest.note}`
          : `Evidencia cifrada registrada (${manifest.objectId})`,
        byUserId: auth.session.user.id,
      },
    });

    await tx.mobileSyncJob.create({
      data: buildEvidenceProcessingJobData({
        secureEvidenceId: createdEvidence.id,
        objectId: createdEvidence.objectId,
        deviceId: createdEvidence.deviceId,
        mobileDeviceId: createdEvidence.mobileDeviceId,
        messengerId: createdEvidence.messengerId,
        routeId: createdEvidence.routeId,
        routeItemId: createdEvidence.routeItemId,
        payload: {
          deliveryId: createdEvidence.deliveryId,
          evidenceKind: createdEvidence.evidenceKind,
          sha256: createdEvidence.sha256,
        },
      }),
    });

    return createdEvidence;
  });

  return NextResponse.json(
    {
      registered: true,
      evidence: {
        id: evidence.id,
        deliveryId: evidence.deliveryId,
        objectId: evidence.objectId,
        status: evidence.status,
      },
    },
    { status: 201 },
  );
}

function resolveNextCardStatus(markAs: string | undefined) {
  if (markAs === "ACUSE_RECIBIDO") return CardStatus.ACUSE_RECIBIDO;
  if (markAs === "DEVUELTA_TIENDA") return CardStatus.DEVUELTA_TIENDA;
  if (markAs === "EN_RUTA") return CardStatus.EN_RUTA;
  return null;
}
