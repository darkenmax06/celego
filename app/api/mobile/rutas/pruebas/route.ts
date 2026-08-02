import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CardStatus, Prisma, UserRole } from "@prisma/client";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";
import { clearUrgencyOnCardClosure } from "@/lib/urgent-alerts";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extensionFromMime(mime: string) {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("heic")) return ".heic";
  if (mime.includes("heif")) return ".heif";
  return ".jpg";
}

export async function POST(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const routeItemId = String(form.get("routeItemId") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const markAs = String(form.get("markAs") ?? "").trim();
  const file = form.get("file");

  if (!routeItemId) {
    return NextResponse.json({ error: "routeItemId requerido" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo de foto requerido" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Tamano de foto invalido (max 10MB)" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Formato no permitido (jpeg/png/webp/heic/heif)" }, { status: 400 });
  }

  const item = await prisma.routeItem.findUnique({
    where: { id: routeItemId },
    include: {
      route: true,
      card: true,
    },
  });
  if (!item) {
    return NextResponse.json({ error: "Item de ruta no encontrado" }, { status: 404 });
  }

  if (
    auth.session.user.role === UserRole.MENSAJERO &&
    auth.session.user.messengerId !== item.route.messengerId
  ) {
    return NextResponse.json({ error: "No puedes subir evidencia para otra ruta" }, { status: 403 });
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const ext = extensionFromMime(file.type);
  const filename = `${item.route.id}-${item.id}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;

  const relativeDir = path.join("uploads", "proofs", yyyy, mm);
  const diskDir = path.join(process.cwd(), "public", relativeDir);
  await mkdir(diskDir, { recursive: true });

  const diskPath = path.join(diskDir, filename);
  const relativePath = path.join(relativeDir, filename).replace(/\\/g, "/");
  const publicUrl = `/${relativePath}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(diskPath, buffer);

  const root = asRecord(item.card.metadata);
  const routeMeta = asRecord(root.route);
  const rawProofs = Array.isArray(routeMeta.proofs) ? routeMeta.proofs : [];

  const proofRecord = {
    id: randomUUID(),
    routeId: item.route.id,
    itemId: item.id,
    messengerId: item.route.messengerId,
    byUserId: auth.session.user.id,
    fileUrl: publicUrl,
    filePath: relativePath,
    mimeType: file.type,
    size: file.size,
    note,
    createdAt: now.toISOString(),
  };

  const proofs = [...rawProofs, proofRecord].slice(-40);
  const nextRouteMeta: Record<string, unknown> = {
    ...routeMeta,
    proofs,
    updatedAt: now.toISOString(),
  };

  const updateData: Prisma.CardUpdateInput = {
    metadata: {
      ...root,
      route: nextRouteMeta,
    } as Prisma.InputJsonValue,
  };

  let nextStatus: CardStatus | null = null;
  if (markAs === "ACUSE_RECIBIDO") {
    nextStatus = CardStatus.ACUSE_RECIBIDO;
  } else if (markAs === "DEVUELTA_TIENDA") {
    if (!note) {
      return NextResponse.json(
        { error: "Debes indicar nota/motivo para marcar DEVUELTA_TIENDA" },
        { status: 400 },
      );
    }
    nextStatus = CardStatus.DEVUELTA_TIENDA;
  } else if (markAs === "EN_RUTA") {
    nextStatus = CardStatus.EN_RUTA;
  }

  if (nextStatus) {
    updateData.status = nextStatus;
    updateData.currentMessenger = { connect: { id: item.route.messengerId } };
    updateData.lastAssignedMessenger = { connect: { id: item.route.messengerId } };
    updateData.returnReason =
      nextStatus === CardStatus.DEVUELTA_TIENDA ? note : null;
    await prisma.routeItem.update({
      where: { id: item.id },
      data: { checkedAt: nextStatus === CardStatus.EN_RUTA ? null : now },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.card.update({
      where: { id: item.cardId },
      data: updateData,
    });

    if (nextStatus) {
      await clearUrgencyOnCardClosure({
        tx,
        cardId: item.cardId,
        nextStatus,
        byUserId: auth.session.user.id,
      });
    }

    await tx.cardStatusLog.create({
      data: {
        cardId: item.cardId,
        fromStatus: item.card.status,
        toStatus: nextStatus ?? item.card.status,
        note: note
          ? `Evidencia fotografica subida (${publicUrl}) - ${note}`
          : `Evidencia fotografica subida (${publicUrl})`,
        byUserId: auth.session.user.id,
      },
    });
  });

  return NextResponse.json(
    {
      uploaded: true,
      proof: proofRecord,
      markAs: nextStatus ?? item.card.status,
    },
    { status: 201 },
  );
}
