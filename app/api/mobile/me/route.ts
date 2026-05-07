import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";

export async function GET(request: NextRequest) {
  const auth = await requireMobileSession(request);
  if ("error" in auth) return auth.error;

  return NextResponse.json({ user: auth.session.user });
}
