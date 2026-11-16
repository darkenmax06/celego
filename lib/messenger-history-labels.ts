/**
 * Spanish labels for the history relations that block a messenger hard delete
 * (see `countHistory` in `lib/messenger-lifecycle.ts`). Client safe: no server imports.
 */
const HISTORY_LABELS: Record<string, { one: string; many: string }> = {
  routes: { one: "ruta", many: "rutas" },
  reassignmentsTo: { one: "reasignacion de entrega", many: "reasignaciones de entrega" },
  mobilePackages: { one: "paquete de la app movil", many: "paquetes de la app movil" },
  secureEvidences: { one: "evidencia de entrega", many: "evidencias de entrega" },
  dailyRecords: { one: "registro diario", many: "registros diarios" },
  reports: { one: "reporte", many: "reportes" },
  loans: { one: "prestamo", many: "prestamos" },
  payments: { one: "pago", many: "pagos" },
  deliveryCredits: { one: "credito de entrega", many: "creditos de entrega" },
  payrollPeriods: { one: "periodo de corte propio", many: "periodos de corte propios" },
  payrollLocks: { one: "bloqueo de periodo", many: "bloqueos de periodo" },
  payrollPendingChanges: { one: "cambio de entregas pendiente", many: "cambios de entregas pendientes" },
};

/** `{ routes: 27, dailyRecords: 33 }` -> "27 rutas y 33 registros diarios". Empty when nothing is counted. */
export function formatHistoryCounts(counts: Record<string, number> | null | undefined): string {
  const parts = Object.entries(counts ?? {})
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([relation, count]) => {
      const label = HISTORY_LABELS[relation];
      if (!label) return `${count} ${relation}`;
      return `${count} ${count === 1 ? label.one : label.many}`;
    });
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}
