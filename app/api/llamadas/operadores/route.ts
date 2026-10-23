import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";

/** Calls overhaul: active users that can receive call assignments. */
export async function GET() {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const operadores = await prisma.user.findMany({
    where: { active: true, role: { in: ["ADMIN", "OPERADOR"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ operadores });
}
