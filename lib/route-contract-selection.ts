/**
 * SDD `contrato-tarjetas-pistoleo` — targeted fix batch (verify-report id 614).
 *
 * `POST /api/rutas` accepts `contractIdentifiers` as a genuine subset of the
 * submitted `identifiers` batch (see app/api/rutas/route.ts). This helper
 * intersects the analyst's per-card "requiere contrato" selection with the
 * identifiers actually being submitted, preserving the submitted batch's
 * order and dropping any marked id that is no longer part of the batch
 * (e.g. a card removed from the selection before hitting "Crear ruta").
 */
export function resolveContractIdentifiers(
  submittedIdentifiers: string[],
  markedCardIds: ReadonlySet<string>,
): string[] {
  return submittedIdentifiers.filter((identifier) => markedCardIds.has(identifier));
}
