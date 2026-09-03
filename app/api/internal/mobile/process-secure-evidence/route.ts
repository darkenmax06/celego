import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { processSecureEvidenceJobs } from "@/lib/secure-evidence-processing";
import { requireMobileSession } from "@/lib/mobile-session";

function hasInternalSecret(request: NextRequest) {
  const expected = process.env.INTERNAL_SYNC_SECRET;
  if (!expected) return false;
  return request.headers.get("x-celego-internal-secret") === expected;
}

export async function POST(request: NextRequest) {
  if (!hasInternalSecret(request)) {
    const auth = await requireMobileSession(request, [UserRole.ADMIN, UserRole.OPERADOR]);
    if ("error" in auth) return auth.error;
  }

  const result = await processSecureEvidenceJobs({
    simulateDecryption: process.env.RELAY_REAL_DOWNLOAD !== "true",
  });

  return NextResponse.json({ ok: true, result });
}
