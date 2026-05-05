import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { toCardStatus } from "@/lib/card-status";
import { batchUpdateCards } from "@/lib/card-service";

const schema = z.object({
  cardIds: z.array(z.string().cuid()).min(1),
  status: z.string().optional(),
  provincia: z.string().min(2).optional(),
  zona: z.string().min(2).optional(),
  isRemote: z.boolean().optional(),
  messengerId: z.string().cuid().nullable().optional(),
  returnReason: z.string().min(2).nullable().optional(),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const status = parsed.data.status ? toCardStatus(parsed.data.status) : undefined;
  if (
    status === undefined &&
    parsed.data.provincia === undefined &&
    parsed.data.zona === undefined &&
    parsed.data.isRemote === undefined &&
    parsed.data.messengerId === undefined &&
    parsed.data.returnReason === undefined
  ) {
    return NextResponse.json({ error: "Debe indicar al menos un campo a modificar" }, { status: 400 });
  }

  try {
    const result = await batchUpdateCards(
      parsed.data.cardIds,
      {
        status,
        provincia: parsed.data.provincia,
        zona: parsed.data.zona,
        isRemote: parsed.data.isRemote,
        messengerId: parsed.data.messengerId,
        returnReason: parsed.data.returnReason,
        note: parsed.data.note,
      },
      auth.session.user.id,
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "RETURN_REASON_REQUIRED") {
      return NextResponse.json(
        { error: "Motivo de devolucion requerido para marcar tarjeta retornada/devuelta" },
        { status: 400 },
      );
    }
    throw error;
  }
}
