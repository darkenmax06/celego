/**
 * Pure decision logic for `rutas-client.tsx`'s return-reason capture.
 *
 * SDD change `rutas-lotes-redesign` — Slice 4b (task 4.7).
 *
 * Extracted so `requestReturnReason`'s sync -> async conversion
 * (`window.prompt()` -> `Promise<string | null>`) can be TDD'd without a
 * jsdom render of the client component. Pinned verbatim from the CURRENT
 * `requestReturnReason` implementation in `rutas-client.tsx`:
 *
 *  - `promptValue === null` (user cancelled the prompt) -> no reason, no
 *    validation message.
 *  - an empty or whitespace-only value -> an empty-string reason (the
 *    caller treats `""` as falsy and does not proceed) PLUS a validation
 *    message the caller surfaces via `setMessage(...)`.
 *  - any other value -> the trimmed reason, no message.
 *
 * Deliberately pure: no `window`, no component state. The component still
 * owns the actual `window.prompt()` call and the `setMessage(...)` side
 * effect — this module only decides WHAT those should be, given the raw
 * prompt result.
 *
 * The visual replacement of `window.prompt()` itself (a styled input+datalist
 * dialog, spec requirement "No native prompt on reason capture") is Slice 7a's
 * job, not this batch's — this module and its caller are an interim
 * sync->async plumbing step only.
 */

export type ReturnReasonPromptResult = {
  reason: string | null;
  message?: string;
};

export const RETURN_REASON_REQUIRED_MESSAGE =
  "Debes indicar motivo de devolucion para marcar tarjeta retornada";

export function resolveReturnReasonPrompt(promptValue: string | null): ReturnReasonPromptResult {
  if (promptValue === null) return { reason: null, message: undefined };

  const trimmed = promptValue.trim();
  if (!trimmed) {
    return { reason: "", message: RETURN_REASON_REQUIRED_MESSAGE };
  }

  return { reason: trimmed, message: undefined };
}
