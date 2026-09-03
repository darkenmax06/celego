import {
  MobileSyncJobKind,
  MobileSyncJobStatus,
  Prisma,
  SecureEvidenceStatus,
} from "@prisma/client";

export type RetryDecisionInput = {
  attempts: number;
  maxAttempts: number;
  now?: Date;
  baseDelayMinutes?: number;
};

export function nextRetryAt(input: RetryDecisionInput) {
  const now = input.now ?? new Date();
  const baseDelayMinutes = input.baseDelayMinutes ?? 5;
  const exponent = Math.max(0, input.attempts - 1);
  const delayMinutes = Math.min(baseDelayMinutes * 2 ** exponent, 6 * 60);
  return new Date(now.getTime() + delayMinutes * 60_000);
}

export function resolveFailedJobState(input: RetryDecisionInput) {
  if (input.attempts >= input.maxAttempts) {
    return {
      status: MobileSyncJobStatus.DEAD_LETTER,
      nextRunAt: null,
    } as const;
  }

  return {
    status: MobileSyncJobStatus.RETRY_SCHEDULED,
    nextRunAt: nextRetryAt(input),
  } as const;
}

export function evidenceNeedsProcessing(status: SecureEvidenceStatus) {
  return (
    status === SecureEvidenceStatus.PENDING_RELAY ||
    status === SecureEvidenceStatus.UPLOADED_RELAY ||
    status === SecureEvidenceStatus.DOWNLOADED_CORE
  );
}

export function buildEvidenceProcessingJobData(input: {
  secureEvidenceId: string;
  objectId: string;
  deviceId: string;
  mobileDeviceId?: string | null;
  messengerId: string;
  routeId?: string | null;
  routeItemId?: string | null;
  payload?: Prisma.InputJsonValue;
}) {
  return {
    kind: MobileSyncJobKind.EVIDENCE_PROCESSING,
    status: MobileSyncJobStatus.PENDING,
    secureEvidenceId: input.secureEvidenceId,
    objectId: input.objectId,
    deviceId: input.deviceId,
    mobileDeviceId: input.mobileDeviceId ?? null,
    messengerId: input.messengerId,
    routeId: input.routeId ?? null,
    routeItemId: input.routeItemId ?? null,
    payload: input.payload,
  } satisfies Prisma.MobileSyncJobUncheckedCreateInput;
}
