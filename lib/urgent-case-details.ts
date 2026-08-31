import { z } from "zod";
import { UrgentCaseType } from "@prisma/client";

/**
 * SDD solicitudes-reclamaciones-urgentes (design D1): `UrgentCase.details`
 * type-specific validation. Everything not promoted to a dedicated column
 * (`ticket`, `etapa`, `analista`) lives here, re-emitted verbatim into the
 * response export for SOLICITUD cases.
 */
export const solicitudDetailsSchema = z.object({
  destino: z.string().min(1),
  provinciaSolicitud: z.string(),
  logActual: z.string(),
  cantidadDias: z.string(),
  fechaASuplidor: z.string().nullish(),
  sourceRow: z.record(z.string(), z.string()),
});

export type SolicitudDetails = z.infer<typeof solicitudDetailsSchema>;

/**
 * SDD solicitudes-reclamaciones-urgentes (design D8/Q5): `nuevaDireccion`
 * stays case-local — it must never be written back onto `Card`/`Customer`.
 */
export const reclamacionDetailsSchema = z.object({
  nuevaDireccion: z.string().min(1),
  numero: z.string().min(1),
});

export type ReclamacionDetails = z.infer<typeof reclamacionDetailsSchema>;

export function parseUrgentCaseDetails(
  type: UrgentCaseType,
  value: unknown,
): SolicitudDetails | ReclamacionDetails {
  if (type === "SOLICITUD") {
    return solicitudDetailsSchema.parse(value);
  }
  if (type === "RECLAMACION") {
    return reclamacionDetailsSchema.parse(value);
  }
  throw new Error(`No details schema for UrgentCaseType ${type}`);
}
