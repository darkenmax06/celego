import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import forge from "node-forge";

export type EncryptedEvidenceAsset = {
  encryptedBlobBase64: string;
  sha256: string;
  byteSize: number;
  encryption: {
    algorithm: "AES-256-GCM";
    keyEncryptionAlgorithm: "RSA-OAEP-SHA256";
    encryptedKey: string;
    nonce: string;
    authTag: string;
  };
};

function bytesToBinary(bytes: Uint8Array) {
  const chunkSize = 8192;
  let output = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    output += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return output;
}

function sha256Hex(binary: string) {
  const digest = forge.md.sha256.create();
  digest.update(binary, "raw");
  return digest.digest().toHex();
}

function randomBinary(byteLength: number) {
  return bytesToBinary(Crypto.getRandomBytes(byteLength));
}

export async function encryptEvidenceFile(input: {
  uri: string;
  serverPublicKeyPem: string;
}): Promise<EncryptedEvidenceAsset> {
  const imageBase64 = await FileSystem.readAsStringAsync(input.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const plaintext = forge.util.decode64(imageBase64);
  const dataKey = randomBinary(32);
  const nonce = randomBinary(12);

  const cipher = forge.cipher.createCipher("AES-GCM", dataKey);
  cipher.start({ iv: nonce, tagLength: 128 });
  cipher.update(forge.util.createBuffer(plaintext, "raw"));
  const ok = cipher.finish();
  if (!ok) throw new Error("No se pudo cifrar la evidencia");

  const publicKey = forge.pki.publicKeyFromPem(input.serverPublicKeyPem);
  const encryptedKey = publicKey.encrypt(dataKey, "RSA-OAEP", {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });
  const ciphertext = cipher.output.getBytes();
  const authTag = cipher.mode.tag.getBytes();

  return {
    encryptedBlobBase64: forge.util.encode64(ciphertext),
    sha256: sha256Hex(ciphertext),
    byteSize: ciphertext.length,
    encryption: {
      algorithm: "AES-256-GCM",
      keyEncryptionAlgorithm: "RSA-OAEP-SHA256",
      encryptedKey: forge.util.encode64(encryptedKey),
      nonce: forge.util.encode64(nonce),
      authTag: forge.util.encode64(authTag),
    },
  };
}

export function verifyCedulaToken(cedula: string, token: {
  salt: string;
  hash: string;
}) {
  const normalized = cedula.replace(/\D/g, "");
  const digest = forge.md.sha256.create();
  digest.update(`${token.salt}:${normalized}`, "utf8");
  return digest.digest().toHex().toLowerCase() === token.hash.toLowerCase();
}
