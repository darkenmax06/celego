import { exportRowsToXlsx } from "@/lib/reports/export";
import type { SolicitudDetails } from "@/lib/urgent-case-details";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 2, task 2.2 (design D7).
 *
 * Re-emits SOLICITUD `UrgentCase` rows in the fixed MBE column order for
 * supplier response. Separate from the user-configurable Tarjetas Urgentes
 * export (`app/api/urgentes/export/route.ts`).
 */
export type SolicitudResponseCase = {
  tc: string;
  cedula: string;
  ticket: string | null;
  etapa: string | null;
  analista: string | null;
  details: SolicitudDetails | Record<string, unknown> | null;
};

export function buildSolicitudesResponseWorkbook(cases: SolicitudResponseCase[]) {
  const rows = cases.map((item) => {
    const details = (item.details ?? {}) as Partial<SolicitudDetails>;
    return {
      "NUMERO TC": item.tc,
      CEDULA: item.cedula,
      TICKET: item.ticket ?? "",
      ETAPA: item.etapa ?? "",
      ANALISTA: item.analista ?? "",
      DESTINO: details.destino ?? "",
      PROVINCIA: details.provinciaSolicitud ?? "",
      "LOG ACTUAL": details.logActual ?? "",
      "CANTIDAD DIAS": details.cantidadDias ?? "",
      "FECHA A SUPLIDOR": details.fechaASuplidor ?? "",
    };
  });

  return exportRowsToXlsx(rows, "MBE");
}
