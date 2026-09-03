import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  findPiiViolation,
  RelayEvidenceUploadSchema,
  type RelayEvidenceUpload,
} from "../../../packages/contracts/src";
import {
  InMemoryRelayMetadataStore,
  type RelayMetadataStore,
  type RelayStoredEvidence,
} from "./store";

const MAX_BODY_BYTES = 18 * 1024 * 1024;

function writeJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    let size = 0;

    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        request.destroy(new Error("request_body_too_large"));
        return;
      }
      body += chunk.toString("utf-8");
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function parseJsonBody(raw: string) {
  if (!raw.trim()) return null;
  return JSON.parse(raw) as unknown;
}

function sha256Base64Content(value: string) {
  return createHash("sha256").update(Buffer.from(value, "base64")).digest("hex");
}

function byteSizeBase64Content(value: string) {
  return Buffer.from(value, "base64").byteLength;
}

function validateEncryptedBlob(upload: RelayEvidenceUpload) {
  if (!upload.encryptedBlobBase64) return null;

  const sha256 = sha256Base64Content(upload.encryptedBlobBase64);
  if (sha256.toLowerCase() !== upload.manifest.blob.sha256.toLowerCase()) {
    return "encrypted_blob_sha256_mismatch";
  }

  const byteSize = byteSizeBase64Content(upload.encryptedBlobBase64);
  if (byteSize !== upload.manifest.blob.byteSize) {
    return "encrypted_blob_size_mismatch";
  }

  return null;
}

function toStoredEvidence(upload: RelayEvidenceUpload): RelayStoredEvidence {
  const now = new Date().toISOString();
  return {
    deliveryId: upload.manifest.deliveryId,
    deviceId: upload.manifest.deviceId,
    objectId: upload.manifest.objectId,
    evidenceKind: upload.manifest.evidenceKind,
    status: "uploaded",
    sha256: upload.manifest.blob.sha256,
    byteSize: upload.manifest.blob.byteSize,
    receivedAt: now,
    expiresAt: upload.manifest.expiresAt,
  };
}

export function createRelayRequestHandler(
  store: RelayMetadataStore = new InMemoryRelayMetadataStore(),
) {
  return async function relayRequestHandler(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://relay.local");

      if (method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, {
          ok: true,
          service: "celego-relay",
          status: "healthy",
        });
        return;
      }

      if (method === "GET" && url.pathname.startsWith("/evidence/")) {
        const objectId = decodeURIComponent(url.pathname.replace("/evidence/", ""));
        const record = await store.get(objectId);
        if (!record) {
          writeJson(response, 404, { error: "relay_object_not_found" });
          return;
        }
        writeJson(response, 200, { evidence: record });
        return;
      }

      if (method === "POST" && url.pathname === "/evidence") {
        const raw = parseJsonBody(await readBody(request));
        const piiViolation = findPiiViolation(raw);
        if (piiViolation) {
          writeJson(response, 400, {
            error: "relay_payload_contains_pii",
            path: piiViolation.path,
            reason: piiViolation.reason,
          });
          return;
        }

        const parsed = RelayEvidenceUploadSchema.safeParse(raw);
        if (!parsed.success) {
          writeJson(response, 400, {
            error: "invalid_relay_evidence_payload",
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          });
          return;
        }

        const blobError = validateEncryptedBlob(parsed.data);
        if (blobError) {
          writeJson(response, 400, { error: blobError });
          return;
        }

        const evidence = await store.put(toStoredEvidence(parsed.data));
        writeJson(response, 202, { accepted: true, evidence });
        return;
      }

      writeJson(response, 404, { error: "not_found" });
    } catch (error) {
      writeJson(response, 500, {
        error: "relay_internal_error",
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  };
}

export function createRelayServer(store?: RelayMetadataStore) {
  return createServer(createRelayRequestHandler(store));
}
