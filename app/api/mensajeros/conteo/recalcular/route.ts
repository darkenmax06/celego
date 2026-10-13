import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { recountRange } from "@/lib/payroll/counting";
import { toPayrollDay } from "@/lib/payroll/period";

const MAX_RANGE_DAYS = 93;

const bodySchema = z.object({
  from: z.string(),
  to: z.string(),
  messengerId: z.string().cuid().optional(),
});

/**
 * Settings action: rebuilds the automatic delivery count over a date range, so
 * deliveries made before the automatic count existed are credited too.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN"]);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Rango invalido" }, { status: 400 });

  let from: Date;
  let to: Date;
  try {
    from = toPayrollDay(parsed.data.from);
    to = toPayrollDay(parsed.data.to);
  } catch {
    return NextResponse.json({ error: "Fechas invalidas" }, { status: 400 });
  }
  if (from > to) return NextResponse.json({ error: "La fecha inicial no puede ser posterior a la final" }, { status: 422 });
  if ((to.getTime() - from.getTime()) / 86_400_000 + 1 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `El rango no puede pasar de ${MAX_RANGE_DAYS} dias` }, { status: 422 });
  }

  const result = await recountRange({ from, to, messengerId: parsed.data.messengerId });
  return NextResponse.json(result);
}
