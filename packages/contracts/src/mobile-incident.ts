import { z } from "zod";
import { EvidenceGpsSchema } from "./evidence";

const deviceIdSchema = z
  .string()
  .min(6)
  .max(96)
  .regex(/^[a-zA-Z0-9._:-]+$/);

export const MobileIncidentSeveritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const MobileIncidentTypeSchema = z.enum([
  "CUSTOMER_ABSENT",
  "ADDRESS_NOT_FOUND",
  "CUSTOMER_REFUSED",
  "DEVICE_PROBLEM",
  "NETWORK_PROBLEM",
  "SECURITY_CONCERN",
  "EVIDENCE_PROBLEM",
  "OTHER",
]);

export const ReportMobileIncidentSchema = z
  .object({
    incidentId: deviceIdSchema,
    deviceId: deviceIdSchema,
    routeId: z.string().cuid().optional(),
    routeItemId: z.string().cuid().optional(),
    evidenceObjectId: deviceIdSchema.optional(),
    type: MobileIncidentTypeSchema,
    severity: MobileIncidentSeveritySchema.default("MEDIUM"),
    title: z.string().trim().min(4).max(120),
    description: z.string().trim().max(600).optional(),
    gps: EvidenceGpsSchema.optional(),
    reportedAt: z.string().datetime(),
    technicalMetadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ReportMobileIncidentInput = z.infer<typeof ReportMobileIncidentSchema>;
export type MobileIncidentSeverity = z.infer<typeof MobileIncidentSeveritySchema>;
export type MobileIncidentType = z.infer<typeof MobileIncidentTypeSchema>;
