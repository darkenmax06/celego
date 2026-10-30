import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { getWorkloadCounts, setMessengerActive } from "@/lib/messenger-lifecycle";
import { prisma } from "@/lib/prisma";

const ROLES = ["ADMIN", "OPERADOR"] as const;

const bodySchema = z.object({
  id: z.string().cuid(),
  action: z.enum(["archive", "restore"]),
});

const NOT_FOUND = { error: "Mensajero no encontrado" };

/** Preview for the confirm dialog: current state plus workload, no mutation. */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const messenger = await prisma.messenger.findUnique({
    where: { id },
    select: { id: true, activo: true },
  });
  if (!messenger) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  const counts = await getWorkloadCounts(prisma, id);
  return NextResponse.json({ id: messenger.id, activo: messenger.activo, ...counts });
}

export async function POST(request: Request) {
  const auth = await requireApiSession([...ROLES]);
  if ("error" in auth) return auth.error;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const result = await setMessengerActive(
    parsed.data.id,
    parsed.data.action === "restore",
    { id: auth.session.user.id, email: auth.session.user.email },
    request,
  );
  if (!result.found) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  const { messenger, changed, openRoutes, assignedCards } = result;
  return NextResponse.json({ messenger, changed, openRoutes, assignedCards });
}
