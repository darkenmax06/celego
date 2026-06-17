import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditClient = Prisma.TransactionClient | typeof prisma;

type AuditEventInput = {
  entity: string;
  entityId: string;
  action: string;
  result?: "SUCCESS" | "FAILURE" | "DENIED";
  userId?: string | null;
  actorEmail?: string | null;
  targetUserId?: string | null;
  details?: Prisma.InputJsonValue;
  request?: Request;
};

function requestMetadata(request?: Request) {
  if (!request) return {};
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ipAddress:
      forwardedFor?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null,
    userAgent: request.headers.get("user-agent"),
  };
}

export async function writeAuditEvent(
  input: AuditEventInput,
  client: AuditClient = prisma,
) {
  const metadata = requestMetadata(input.request);
  return client.auditLog.create({
    data: {
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      result: input.result ?? "SUCCESS",
      userId: input.userId ?? null,
      actorEmail: input.actorEmail?.trim().toLowerCase() || null,
      targetUserId: input.targetUserId ?? null,
      details: input.details,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    },
  });
}

export async function tryWriteAuditEvent(
  input: AuditEventInput,
  client: AuditClient = prisma,
) {
  try {
    return await writeAuditEvent(input, client);
  } catch (error) {
    console.error("No se pudo registrar evento de auditoria", error);
    return null;
  }
}
