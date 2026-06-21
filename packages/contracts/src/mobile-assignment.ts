import { z } from "zod";
import { CedulaVerificationTokenSchema } from "./route-package";

const deviceIdSchema = z
  .string()
  .min(6)
  .max(96)
  .regex(/^[a-zA-Z0-9._:-]+$/);

export const MobileOpenCardStatusSchema = z.enum([
  "DESPACHADA",
  "ENVIADA_INTERIOR",
  "EN_RUTA",
]);

export const MobileAssignmentCardSchema = z
  .object({
    cardId: z.string().cuid(),
    routeId: z.string().cuid().optional(),
    routeItemId: z.string().cuid().optional(),
    sequence: z.number().int().positive().optional(),
    recipientName: z.string().min(1).max(160),
    addressLine: z.string().min(1).max(260).optional(),
    province: z.string().min(1).max(120).optional(),
    zone: z.string().min(1).max(120).optional(),
    reference: z.string().min(1).max(120).optional(),
    status: MobileOpenCardStatusSchema,
    cedulaVerification: CedulaVerificationTokenSchema,
    updatedAt: z.string().datetime(),
  })
  .strict();

export const MobileAssignmentsResponseSchema = z
  .object({
    deviceId: deviceIdSchema,
    messengerId: z.string().cuid(),
    generatedAt: z.string().datetime(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(200),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(1),
    assignments: z.array(MobileAssignmentCardSchema),
  })
  .strict();

export type MobileOpenCardStatus = z.infer<typeof MobileOpenCardStatusSchema>;
export type MobileAssignmentCard = z.infer<typeof MobileAssignmentCardSchema>;
export type MobileAssignmentsResponse = z.infer<typeof MobileAssignmentsResponseSchema>;
