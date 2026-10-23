import type { Prisma } from "@prisma/client";

/** Query param shared by `/api/operativo/contacto`, `/api/sla-vencidas` and its exports. */
export const ASIGNADO_PARAM = "asignado";
export const ASIGNADO_ME_TOKEN = "ME";
export const ASIGNADO_NONE_TOKEN = "SIN_ASIGNAR";

/**
 * Translates the `asignado` filter into a `Card` constraint:
 * - `ME`          -> cards assigned to the session user
 * - `SIN_ASIGNAR` -> cards without a call assignment
 * - any other id  -> cards assigned to that user
 * Returns `undefined` for empty / `ALL` (no constraint).
 */
export function buildAsignadoWhere(
  raw: string | null | undefined,
  sessionUserId: string,
): Prisma.CardWhereInput | undefined {
  const value = raw?.trim();
  if (!value || value === "ALL") return undefined;
  if (value === ASIGNADO_NONE_TOKEN) return { callAssignment: { is: null } };
  const assignedToId = value === ASIGNADO_ME_TOKEN ? sessionUserId : value;
  return { callAssignment: { is: { assignedToId } } };
}

export type AsignadoA = { id: string; name: string } | null;

export function toAsignadoA(
  assignment: { assignedTo: { id: string; name: string } | null } | null | undefined,
): AsignadoA {
  const user = assignment?.assignedTo;
  return user ? { id: user.id, name: user.name } : null;
}

/** Prisma `select` fragment used by every list that returns `asignadoA`. */
export const CALL_ASSIGNMENT_SELECT = {
  select: { assignedTo: { select: { id: true, name: true } } },
} as const;
