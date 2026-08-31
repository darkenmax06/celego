/**
 * Sub-tabs under "Operativo de rutas" (Slice 2). `progreso` is the relocated
 * route-progress view that used to live mislabeled under the "Lotes" module
 * tab as `lotTab === "lotes"`.
 */
export type OperativoTab = "asignacion" | "progreso";

const VALID_OPERATIVO_TABS: readonly OperativoTab[] = ["asignacion", "progreso"];

/**
 * Coerces a persisted/restored value to a known `OperativoTab`.
 *
 * The relocated sub-tab reuses the `rutas:lot-tab` storage key, which may
 * still hold a stale pre-relocation value ("lotes"/"seguimiento") or any
 * other unrecognized value for returning users. Anything outside the current
 * domain falls back to the default tab instead of leaving the UI on an
 * unmatched selection (which would render no panel at all).
 */
export function resolveOperativoTab(value: unknown): OperativoTab {
  return VALID_OPERATIVO_TABS.includes(value as OperativoTab)
    ? (value as OperativoTab)
    : "asignacion";
}
