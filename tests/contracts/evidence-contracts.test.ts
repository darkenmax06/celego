import { describe, expect, it } from "vitest";
import {
  findPiiViolation,
  RelayEvidenceManifestSchema,
  RelayEvidenceUploadSchema,
} from "../../packages/contracts/src";

function validManifest() {
  return {
    deliveryId: "DLV-9A73F1",
    deviceId: "DEV-228",
    objectId: "OBJ-8841",
    evidenceKind: "ACUSE",
    capturedAt: new Date("2026-06-20T12:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-06-21T12:00:00.000Z").toISOString(),
    gps: {
      latitude: 18.4861,
      longitude: -69.9312,
      accuracyMeters: 12,
    },
    encryption: {
      algorithm: "AES-256-GCM",
      keyEncryptionAlgorithm: "RSA-OAEP-SHA256",
      encryptedKey: Buffer.alloc(256, 1).toString("base64"),
      nonce: Buffer.alloc(12, 2).toString("base64"),
      authTag: Buffer.alloc(16, 3).toString("base64"),
    },
    blob: {
      sha256: "a".repeat(64),
      byteSize: 128,
      mimeType: "application/octet-stream",
    },
    technicalMetadata: {
      routeHash: "ROUTE-TECH-001",
    },
  };
}

describe("relay evidence contracts", () => {
  it("accepts a technical manifest without PII", () => {
    const parsed = RelayEvidenceManifestSchema.safeParse(validManifest());
    expect(parsed.success).toBe(true);
  });

  it("rejects PII inside technical metadata", () => {
    const parsed = RelayEvidenceManifestSchema.safeParse({
      ...validManifest(),
      technicalMetadata: {
        nombre: "Juan Perez",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("detects cedula and card-like values recursively", () => {
    expect(findPiiViolation({ meta: { value: "001-0000000-0" } })).toMatchObject({
      reason: "possible_dominican_cedula",
    });
    expect(findPiiViolation({ meta: { value: "4111 1111 1111 1111" } })).toMatchObject({
      reason: "possible_payment_card_number",
    });
  });

  it("rejects uploads with unexpected PII fields", () => {
    const parsed = RelayEvidenceUploadSchema.safeParse({
      manifest: validManifest(),
      encryptedBlobBase64: Buffer.from("encrypted-payload").toString("base64"),
      cedula: "00100000000",
    });

    expect(parsed.success).toBe(false);
  });
});
