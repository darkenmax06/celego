import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { applyDebitConsolidation } from "@/lib/debit-consolidation/service";

const schema = z.object({
  runId: z.string().min(1),
  validationToken: z.string().min(32),
  acknowledgeRowErrors: z.boolean().default(false),
  allowRepeat: z.boolean().default(false),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR"]);
  if ("error" in auth) return auth.error;
  try {
    const body = schema.parse(await request.json());
    return NextResponse.json(
      await applyDebitConsolidation({
        ...body,
        userId: auth.session.user.id,
        role: auth.session.user.role,
        actorEmail: auth.session.user.email,
      }),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "APPLY_FAILED";
    const conflict = ["DEBIT_RUN_NOT_READY", "DEBIT_REPEAT_ADMIN_REQUIRED"].includes(code);
    return NextResponse.json({ error: code }, { status: conflict ? 409 : 422 });
  }
}
