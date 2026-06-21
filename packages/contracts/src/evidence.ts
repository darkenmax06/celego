import { z } from "zod";
import { findPiiViolation } from "./pii";

const relayIdSchema = z
  .string()
  .min(6)
  .max(96)
  .regex(/^[a-zA-Z0-9._:-]+$/);

const base64Schema = z.string().min(16).max(16_000_000);
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export const EvidenceKindSchema = z.enum(["ACUSE", "CEDULA"]);

export const EvidenceGpsSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().positive().max(5000).optional(),
  })
  .strict();

export const EvidenceEncryptionSchema = z
  .object({
    algorithm: z.literal("AES-256-GCM"),
    keyEncryptionAlgorithm: z.literal("RSA-OAEP-SHA256"),
    encryptedKey: base64Schema,
    nonce: base64Schema,
    authTag: base64Schema,
  })
  .strict();

export const EvidenceBlobDescriptorSchema = z
  .object({
    sha256: sha256HexSchema,
    byteSize: z.number().int().positive().max(15 * 1024 * 1024),
    mimeType: z.literal("application/octet-stream"),
  })
  .strict();

export const RelayEvidenceManifestSchema = z
  .object({
    deliveryId: relayIdSchema,
    deviceId: relayIdSchema,
    objectId: relayIdSchema,
    evidenceKind: EvidenceKindSchema,
    capturedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    gps: EvidenceGpsSchema.optional(),
    encryption: EvidenceEncryptionSchema,
    blob: EvidenceBlobDescriptorSchema,
    technicalMetadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const violation = findPiiViolation(value);
    if (violation) {
      context.addIssue({
        code: "custom",
        message: `Relay manifest contains PII at ${violation.path}: ${violation.reason}`,
      });
    }
  });

export const RelayEvidenceUploadSchema = z
  .object({
    manifest: RelayEvidenceManifestSchema,
    encryptedBlobBase64: base64Schema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const violation = findPiiViolation(value);
    if (violation) {
      context.addIssue({
        code: "custom",
        message: `Relay upload contains PII at ${violation.path}: ${violation.reason}`,
      });
    }
  });

export const SecureEvidenceRegistrationSchema = RelayEvidenceManifestSchema.extend({
  cardId: z.string().cuid().optional(),
  routeItemId: z.string().cuid().optional(),
  note: z.string().trim().max(300).optional(),
  markAs: z.enum(["ACUSE_RECIBIDO", "DEVUELTA_TIENDA", "EN_RUTA"]).optional(),
})
  .strict()
  .superRefine((value, context) => {
    if (!value.cardId && !value.routeItemId) {
      context.addIssue({
        code: "custom",
        message: "cardId o routeItemId es requerido",
      });
    }
  });

export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
export type RelayEvidenceManifest = z.infer<typeof RelayEvidenceManifestSchema>;
export type RelayEvidenceUpload = z.infer<typeof RelayEvidenceUploadSchema>;
export type SecureEvidenceRegistration = z.infer<typeof SecureEvidenceRegistrationSchema>;
