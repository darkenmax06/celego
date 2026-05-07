import { createHmac, timingSafeEqual } from "node:crypto";
import { type UserRole } from "@prisma/client";

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 15;

export type MobileTokenPayload = {
  uid: string;
  role: UserRole;
  email: string;
  name: string;
  messengerId: string | null;
  iat: number;
  exp: number;
};

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for mobile tokens");
  }
  return secret;
}

function encode(data: string) {
  return Buffer.from(data, "utf-8").toString("base64url");
}

function decode(data: string) {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function sign(payloadPart: string, secret: string) {
  return createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

export function createMobileToken(
  input: Omit<MobileTokenPayload, "iat" | "exp">,
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
) {
  const now = Math.floor(Date.now() / 1000);
  const payload: MobileTokenPayload = {
    ...input,
    iat: now,
    exp: now + Math.max(60, ttlSeconds),
  };

  const payloadPart = encode(JSON.stringify(payload));
  const signature = sign(payloadPart, getSecret());
  return `${payloadPart}.${signature}`;
}

export function verifyMobileToken(token: string): MobileTokenPayload | null {
  if (!token || !token.includes(".")) return null;

  const [payloadPart, signature] = token.split(".");
  if (!payloadPart || !signature) return null;

  const expected = sign(payloadPart, getSecret());
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(decode(payloadPart)) as MobileTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.uid || !payload?.role || !payload?.email || !payload?.exp) return null;
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
