import { createHash } from "node:crypto";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRelayServer } from "../../apps/relay/src/app";
import { InMemoryRelayMetadataStore } from "../../apps/relay/src/store";

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function buildUpload(overrides: Record<string, unknown> = {}) {
  const blob = Buffer.from("encrypted-payload");
  return {
    manifest: {
      deliveryId: "DLV-9A73F1",
      deviceId: "DEV-228",
      objectId: "OBJ-8841",
      evidenceKind: "ACUSE",
      capturedAt: new Date("2026-06-20T12:00:00.000Z").toISOString(),
      expiresAt: new Date("2026-06-21T12:00:00.000Z").toISOString(),
      encryption: {
        algorithm: "AES-256-GCM",
        keyEncryptionAlgorithm: "RSA-OAEP-SHA256",
        encryptedKey: Buffer.alloc(256, 1).toString("base64"),
        nonce: Buffer.alloc(12, 2).toString("base64"),
        authTag: Buffer.alloc(16, 3).toString("base64"),
      },
      blob: {
        sha256: sha256(blob),
        byteSize: blob.byteLength,
        mimeType: "application/octet-stream",
      },
    },
    encryptedBlobBase64: blob.toString("base64"),
    ...overrides,
  };
}

describe("relay API", () => {
  let server: ReturnType<typeof createRelayServer>;
  let baseUrl: string;

  beforeEach(async () => {
    server = createRelayServer(new InMemoryRelayMetadataStore());
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("returns health status", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      service: "celego-relay",
      status: "healthy",
    });
  });

  it("accepts encrypted evidence metadata and stores only technical fields", async () => {
    const response = await fetch(`${baseUrl}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildUpload()),
    });
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json.evidence).toMatchObject({
      deliveryId: "DLV-9A73F1",
      deviceId: "DEV-228",
      objectId: "OBJ-8841",
      status: "uploaded",
    });
    expect(JSON.stringify(json)).not.toContain("Juan");
  });

  it("rejects payloads that contain PII", async () => {
    const response = await fetch(`${baseUrl}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildUpload({
          manifest: {
            ...buildUpload().manifest,
            technicalMetadata: { nombre: "Juan Perez" },
          },
        }),
      ),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "relay_payload_contains_pii",
    });
  });

  it("rejects encrypted blobs with mismatched hashes", async () => {
    const response = await fetch(`${baseUrl}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildUpload({
          manifest: {
            ...buildUpload().manifest,
            blob: {
              ...buildUpload().manifest.blob,
              sha256: "b".repeat(64),
            },
          },
        }),
      ),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "encrypted_blob_sha256_mismatch",
    });
  });
});
