import { z } from "zod";

const syncIdSchema = z
  .string()
  .min(6)
  .max(96)
  .regex(/^[a-zA-Z0-9._:-]+$/);

export const MobileSyncJobKindSchema = z.enum([
  "ROUTE_PACKAGE_DOWNLOAD",
  "EVIDENCE_UPLOAD",
  "EVIDENCE_PROCESSING",
  "INCIDENT_REPORT",
  "RETENTION_PURGE",
  "DEVICE_HEARTBEAT",
]);

export const MobileSyncJobStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "RETRY_SCHEDULED",
  "DEAD_LETTER",
]);

export const MobileSyncStatusRequestSchema = z
  .object({
    deviceId: syncIdSchema,
    evidenceObjectIds: z.array(syncIdSchema).max(100).default([]),
    packageIds: z.array(syncIdSchema).max(50).default([]),
    incidentIds: z.array(syncIdSchema).max(50).default([]),
    clientQueueDepth: z.number().int().min(0).max(500).optional(),
    lastClientSyncAt: z.string().datetime().optional(),
  })
  .strict();

export const MobileSyncStatusRowSchema = z
  .object({
    objectId: syncIdSchema,
    status: z.string().min(1),
    attempts: z.number().int().min(0).optional(),
    nextRunAt: z.string().datetime().nullable().optional(),
    lastError: z.string().nullable().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export type MobileSyncJobKind = z.infer<typeof MobileSyncJobKindSchema>;
export type MobileSyncJobStatus = z.infer<typeof MobileSyncJobStatusSchema>;
export type MobileSyncStatusRequest = z.infer<typeof MobileSyncStatusRequestSchema>;
export type MobileSyncStatusRow = z.infer<typeof MobileSyncStatusRowSchema>;
