import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeSha256Hex,
  decryptEvidencePayload,
  encryptEvidencePayload,
  verifySha256Hex,
} from "../../packages/crypto/src";

describe("evidence encryption helpers", () => {
  it("encrypts, hashes, verifies, and decrypts evidence payloads", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const plaintext = Buffer.from("acuse y cedula cifrados antes de salir");

    const encrypted = encryptEvidencePayload(plaintext, publicKey);

    expect(encrypted.envelope.algorithm).toBe("AES-256-GCM");
    expect(encrypted.envelope.keyEncryptionAlgorithm).toBe("RSA-OAEP-SHA256");
    expect(encrypted.sha256).toBe(computeSha256Hex(encrypted.ciphertext));
    expect(verifySha256Hex(encrypted.ciphertext, encrypted.sha256)).toBe(true);
    expect(encrypted.ciphertext.equals(plaintext)).toBe(false);

    const decrypted = decryptEvidencePayload({
      ciphertext: encrypted.ciphertext,
      encryptedKey: encrypted.envelope.encryptedKey,
      nonce: encrypted.envelope.nonce,
      authTag: encrypted.envelope.authTag,
      serverPrivateKeyPem: privateKey,
    });

    expect(decrypted.equals(plaintext)).toBe(true);
  });
});
