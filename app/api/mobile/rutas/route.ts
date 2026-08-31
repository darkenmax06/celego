import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

type ProofPhoto = {
  id: string;
  routeId: string;
  itemId: string;
  messengerId: string;
  byUserId: string;
  fileUrl: string;
  filePath: string;
  mimeType: string;
  size: number;
  note: string;
  createdAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseProofs(raw: unknown) {
  if (!Array.isArray(raw)) return [] as ProofPhoto[];
  return raw
    .map((item) => {
      const row = asRecord(item);
      if (
        typeof row.id !== "string" ||
        typeof row.routeId !== "string" ||
        typeof row.itemId !== "string" ||
        typeof row.fileUrl !== "string"
      ) {
        return null;
      }
      return {
        id: row.id,
        routeId: row.routeId,
        itemId: row.itemId,
        messengerId: typeof row.messengerId === "string" ? row.messengerId : "",
        byUserId: typeof row.byUserId === "string" ? row.byUserId : "",
        fileUrl: row.fileUrl,
        filePath: typeof row.filePath === "string" ? row.filePath : "",
        mimeType: typeof row.mimeType === "string" ? row.mimeType : "",
        size: typeof row.size === "number" ? row.size : 0,
        note: typeof row.note === "string" ? row.note : "",
        createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
      } as ProofPhoto;
    })
    .filter((item): item is ProofPhoto => Boolean(item));
}

export async function GET(request: NextRequest) {
  const auth = await requireMobileSession(request, [
    UserRole.MENSAJERO,
    UserRole.OPERADOR,
    UserRole.ADMIN,
  ]);
  if ("error" in auth) return auth.error;

  const date = request.nextUrl.searchParams.get("date");
  const messengerIdParam = request.nextUrl.searchParams.get("messengerId");
  const role = auth.session.user.role;

  const messengerId =
    role === UserRole.MENSAJERO
      ? auth.session.user.messengerId
      : (messengerIdParam ?? auth.session.user.messengerId);

  if (!messengerId) {
    return NextResponse.json(
      { error: "messengerId requerido para consultar rutas mobile" },
      { status: 400 },
    );
  }

  const where: Record<string, unknown> = { messengerId };
  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.fecha = { gte: start, lt: end };
  }

  const routes = await prisma.route.findMany({
    where,
    include: {
      messenger: true,
      items: {
        include: {
          card: {
            include: {
              customer: true,
            },
          },
        },
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  const payload = routes.map((route) => ({
    ...route,
    items: route.items.map((item) => {
      const root = asRecord(item.card.metadata);
      const routeMeta = asRecord(root.route);
      const proofs = parseProofs(routeMeta.proofs).filter(
        (proof) => proof.routeId === route.id && proof.itemId === item.id,
      );

      return {
        ...item,
        card: {
          ...item.card,
          origin: item.card.dispatchOrigin,
        },
        proofs,
      };
    }),
  }));

  return NextResponse.json({ routes: payload });
}
