import {
  MobileSyncJobStatus,
  SecureEvidenceStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  MobileSyncStatusRequestSchema,
  ReportMobileIncidentSchema,
} from "../../packages/contracts/src";
import {
  evidenceNeedsProcessing,
  nextRetryAt,
  resolveFailedJobState,
} from "../../lib/mobile-sync";

describe("mobile sync contracts and retry policy", () => {
  it("validates mobile sync status requests", () => {
    const parsed = MobileSyncStatusRequestSchema.safeParse({
      deviceId: "DEV-228",
      evidenceObjectIds: ["OBJ-ACUSE-001"],
      packageIds: ["PKG-ROUTE-001"],
      incidentIds: ["INC-001"],
      clientQueueDepth: 2,
      lastClientSyncAt: "2026-06-20T10:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
  });

  it("validates mobile incidents without PII-specific fields", () => {
    const parsed = ReportMobileIncidentSchema.safeParse({
      incidentId: "INC-001",
      deviceId: "DEV-228",
      routeItemId: "crouteitem000000000000001",
      type: "CUSTOMER_ABSENT",
      severity: "MEDIUM",
      title: "Cliente ausente",
      description: "No hubo respuesta en la direccion indicada",
      reportedAt: "2026-06-20T10:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
  });

  it("uses exponential retry and dead-letters exhausted jobs", () => {
    const now = new Date("2026-06-20T10:00:00.000Z");

    expect(nextRetryAt({ attempts: 1, maxAttempts: 5, now }).toISOString()).toBe(
      "2026-06-20T10:05:00.000Z",
    );
    expect(nextRetryAt({ attempts: 3, maxAttempts: 5, now }).toISOString()).toBe(
      "2026-06-20T10:20:00.000Z",
    );
    expect(resolveFailedJobState({ attempts: 2, maxAttempts: 3, now }).status).toBe(
      MobileSyncJobStatus.RETRY_SCHEDULED,
    );
    expect(resolveFailedJobState({ attempts: 3, maxAttempts: 3, now })).toEqual({
      status: MobileSyncJobStatus.DEAD_LETTER,
      nextRunAt: null,
    });
  });

  it("processes only evidence states that still need local work", () => {
    expect(evidenceNeedsProcessing(SecureEvidenceStatus.UPLOADED_RELAY)).toBe(true);
    expect(evidenceNeedsProcessing(SecureEvidenceStatus.DOWNLOADED_CORE)).toBe(true);
    expect(evidenceNeedsProcessing(SecureEvidenceStatus.DECRYPTED)).toBe(false);
    expect(evidenceNeedsProcessing(SecureEvidenceStatus.EXPIRED)).toBe(false);
  });
});
