import {
  MobileRoutePackageStatus,
  MobileSyncJobKind,
  MobileSyncJobStatus,
  PrismaClient,
  SecureEvidenceStatus,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { evidenceNeedsProcessing, resolveFailedJobState } from "@/lib/mobile-sync";

export type ProcessSecureEvidenceOptions = {
  now?: Date;
  limit?: number;
  prisma?: PrismaClient;
  simulateDecryption?: boolean;
};

export type ProcessSecureEvidenceResult = {
  processed: number;
  succeeded: number;
  failed: number;
  expired: number;
  packagesExpired: number;
};

export async function expireMobileOperationalData(options: ProcessSecureEvidenceOptions = {}) {
  const client = options.prisma ?? defaultPrisma;
  const now = options.now ?? new Date();

  const [evidence, packages] = await Promise.all([
    client.secureEvidence.updateMany({
      where: {
        expiresAt: { lt: now },
        status: {
          in: [
            SecureEvidenceStatus.PENDING_RELAY,
            SecureEvidenceStatus.UPLOADED_RELAY,
            SecureEvidenceStatus.DOWNLOADED_CORE,
          ],
        },
      },
      data: { status: SecureEvidenceStatus.EXPIRED },
    }),
    client.mobileRoutePackage.updateMany({
      where: {
        expiresAt: { lt: now },
        status: {
          in: [
            MobileRoutePackageStatus.CREATED,
            MobileRoutePackageStatus.DOWNLOADED,
          ],
        },
      },
      data: { status: MobileRoutePackageStatus.EXPIRED },
    }),
  ]);

  return {
    evidenceExpired: evidence.count,
    packagesExpired: packages.count,
  };
}
export async function processSecureEvidenceJobs(
  options: ProcessSecureEvidenceOptions = {},
): Promise<ProcessSecureEvidenceResult> {
  const client = options.prisma ?? defaultPrisma;
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;
  const simulateDecryption = options.simulateDecryption ?? true;
  const retention = await expireMobileOperationalData({ prisma: client, now });

  const jobs = await client.mobileSyncJob.findMany({
    where: {
      kind: MobileSyncJobKind.EVIDENCE_PROCESSING,
      status: {
        in: [MobileSyncJobStatus.PENDING, MobileSyncJobStatus.RETRY_SCHEDULED],
      },
      nextRunAt: { lte: now },
    },
    include: { secureEvidence: true },
    orderBy: [{ nextRunAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  let succeeded = 0;
  let failed = 0;
  let expired = retention.evidenceExpired;

  for (const job of jobs) {
    const attemptNumber = job.attempts + 1;
    await client.mobileSyncJob.update({
      where: { id: job.id },
      data: {
        status: MobileSyncJobStatus.RUNNING,
        attempts: attemptNumber,
      },
    });

    try {
      if (!job.secureEvidence) {
        throw new Error("secure_evidence_not_found");
      }

      if (
        job.secureEvidence.expiresAt &&
        job.secureEvidence.expiresAt.getTime() < now.getTime()
      ) {
        await client.secureEvidence.update({
          where: { id: job.secureEvidence.id },
          data: { status: SecureEvidenceStatus.EXPIRED },
        });
        await client.mobileSyncAttempt.create({
          data: {
            jobId: job.id,
            attemptNumber,
            status: MobileSyncJobStatus.DEAD_LETTER,
            error: "secure_evidence_expired",
          },
        });
        await client.mobileSyncJob.update({
          where: { id: job.id },
          data: {
            status: MobileSyncJobStatus.DEAD_LETTER,
            lastError: "secure_evidence_expired",
            completedAt: now,
          },
        });
        expired += 1;
        continue;
      }

      if (!evidenceNeedsProcessing(job.secureEvidence.status)) {
        await client.mobileSyncJob.update({
          where: { id: job.id },
          data: {
            status: MobileSyncJobStatus.SUCCEEDED,
            completedAt: now,
          },
        });
        await client.mobileSyncAttempt.create({
          data: {
            jobId: job.id,
            attemptNumber,
            status: MobileSyncJobStatus.SUCCEEDED,
            details: { skippedStatus: job.secureEvidence.status },
          },
        });
        succeeded += 1;
        continue;
      }

      if (!simulateDecryption) {
        throw new Error("real_relay_download_not_configured");
      }

      await client.secureEvidence.update({
        where: { id: job.secureEvidence.id },
        data: {
          status: SecureEvidenceStatus.DECRYPTED,
          coreDownloadedAt: job.secureEvidence.coreDownloadedAt ?? now,
          decryptedAt: now,
        },
      });
      await client.mobileSyncAttempt.create({
        data: {
          jobId: job.id,
          attemptNumber,
          status: MobileSyncJobStatus.SUCCEEDED,
          details: {
            mode: "simulated-local-decryption",
            objectId: job.objectId,
          },
        },
      });
      await client.mobileSyncJob.update({
        where: { id: job.id },
        data: {
          status: MobileSyncJobStatus.SUCCEEDED,
          completedAt: now,
          lastError: null,
        },
      });
      succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_processing_error";
      const next = resolveFailedJobState({
        attempts: attemptNumber,
        maxAttempts: job.maxAttempts,
        now,
      });

      await client.mobileSyncAttempt.create({
        data: {
          jobId: job.id,
          attemptNumber,
          status: next.status,
          error: message,
        },
      });
      await client.mobileSyncJob.update({
        where: { id: job.id },
        data: {
          status: next.status,
          nextRunAt: next.nextRunAt ?? job.nextRunAt,
          lastError: message,
          completedAt: next.status === MobileSyncJobStatus.DEAD_LETTER ? now : null,
        },
      });
      failed += 1;
    }
  }

  return {
    processed: jobs.length,
    succeeded,
    failed,
    expired,
    packagesExpired: retention.packagesExpired,
  };
}
