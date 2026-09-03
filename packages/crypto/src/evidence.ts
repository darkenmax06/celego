import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from "node:crypto";

const DATA_KEY_BYTES = 32;
const NONCE_BYTES = 12;

export type EvidenceEncryptionEnvelope = {
  algorithm: "AES-256-GCM";
  keyEncryptionAlgorithm: "RSA-OAEP-SHA256";
  encryptedKey: string;
  nonce: string;
  authTag: string;
};

export type EncryptedEvidencePayload = {
  ciphertext: Buffer;
  envelope: EvidenceEncryptionEnvelope;
  sha256: string;
  byteSize: number;
};

function toBuffer(value: Buffer | string) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

export function computeSha256Hex(value: Buffer | string) {
  return createHash("sha256").update(toBuffer(value)).digest("hex");
}

export function verifySha256Hex(value: Buffer | string, expectedSha256: string) {
  return computeSha256Hex(value).toLowerCase() === expectedSha256.toLowerCase();
}

export function encryptEvidencePayload(
  plaintext: Buffer | string,
  serverPublicKeyPem: string,
): EncryptedEvidencePayload {
  const input = toBuffer(plaintext);
  const dataKey = randomBytes(DATA_KEY_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedKey = publicEncrypt(
    {
      key: serverPublicKeyPem,
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    dataKey,
  );

  return {
    ciphertext,
    sha256: computeSha256Hex(ciphertext),
    byteSize: ciphertext.byteLength,
    envelope: {
      algorithm: "AES-256-GCM",
      keyEncryptionAlgorithm: "RSA-OAEP-SHA256",
      encryptedKey: encryptedKey.toString("base64"),
      nonce: nonce.toString("base64"),
      authTag: authTag.toString("base64"),
    },
  };
}

export function decryptEvidencePayload(input: {
  ciphertext: Buffer | string;
  encryptedKey: string;
  nonce: string;
  authTag: string;
  serverPrivateKeyPem: string;
}) {
  const dataKey = privateDecrypt(
    {
      key: input.serverPrivateKeyPem,
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(input.encryptedKey, "base64"),
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    dataKey,
    Buffer.from(input.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  return Buffer.concat([decipher.update(toBuffer(input.ciphertext)), decipher.final()]);
}
