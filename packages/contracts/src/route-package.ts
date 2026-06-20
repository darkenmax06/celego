import { z } from "zod";

const routePackageIdSchema = z
  .string()
  .min(6)
  .max(96)
  .regex(/^[a-zA-Z0-9._:-]+$/);

export const CedulaVerificationTokenSchema = z
  .object({
    algorithm: z.literal("SHA-256-SALTED"),
    salt: z.string().min(16).max(128),
    hash: z.string().regex(/^[a-f0-9]{64}$/i),
    last4: z.string().regex(/^\d{4}$/),
  })
  .strict();

export const MobileRoutePackageItemSchema = z
  .object({
    routeItemId: z.string().cuid(),
    deliveryId: routePackageIdSchema,
    sequence: z.number().int().positive(),
    status: z.string().min(1).max(80),
    recipientName: z.string().min(1).max(160),
    addressLine: z.string().min(1).max(260).optional(),
    province: z.string().min(1).max(120).optional(),
    zone: z.string().min(1).max(120).optional(),
    reference: z.string().min(1).max(120).optional(),
    cedulaVerification: CedulaVerificationTokenSchema,
  })
  .strict();

export const MobileRoutePackageManifestSchema = z
  .object({
    packageId: routePackageIdSchema,
    routeId: z.string().cuid(),
    messengerId: z.string().cuid(),
    deviceId: routePackageIdSchema,
    deliveryDate: z.string().datetime(),
    generatedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    items: z.array(MobileRoutePackageItemSchema).min(1),
  })
  .strict();

export const CreateMobileRoutePackageSchema = z
  .object({
    routeId: z.string().cuid(),
    deviceId: routePackageIdSchema,
    expiresAt: z.string().datetime().optional(),
  })
  .strict();

export const DownloadMobileRoutePackageSchema = z
  .object({
    packageId: routePackageIdSchema,
    deviceId: routePackageIdSchema,
  })
  .strict();

export type CedulaVerificationToken = z.infer<typeof CedulaVerificationTokenSchema>;
export type MobileRoutePackageManifest = z.infer<typeof MobileRoutePackageManifestSchema>;
export type MobileRoutePackageItem = z.infer<typeof MobileRoutePackageItemSchema>;
export type CreateMobileRoutePackageInput = z.infer<typeof CreateMobileRoutePackageSchema>;
export type DownloadMobileRoutePackageInput = z.infer<typeof DownloadMobileRoutePackageSchema>;
