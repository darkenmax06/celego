import { CARD_DATE_FIELDS } from "@/lib/card-date-fields";
import type { TableColumnCatalogEntry } from "./column-preferences";

/**
 * Column catalogs of the tables whose layout is saved per user. The API only
 * accepts a `tableKey` listed here and only stores keys from its catalog.
 */
export const TARJETAS_TABLE_KEY = "tarjetas";

export const TARJETAS_COLUMNS = [
  { key: "tc", label: "TC", locked: true },
  { key: "contactoEstado", label: "Gestión Contacto" },
  { key: "producto", label: "Producto" },
  { key: "cliente", label: "Cliente" },
  { key: "cedula", label: "Cédula" },
  { key: "provincia", label: "Provincia" },
  { key: "zona", label: "Zona" },
  { key: "remota", label: "Remota" },
  { key: "tipo", label: "Tipo" },
  { key: "origen", label: "Origen" },
  { key: "estado", label: "Estado" },
  { key: "urgente", label: "Urgente" },
  { key: "nivel", label: "Nivel" },
  { key: "proximaAlerta", label: "Próxima alerta" },
  // Date columns are opt-in: hidden until picked in the column selector.
  ...CARD_DATE_FIELDS.map((field) => ({ key: field.key, label: field.label, defaultVisible: false })),
] as const satisfies readonly TableColumnCatalogEntry[];

const TABLE_COLUMN_CATALOGS = new Map<string, readonly TableColumnCatalogEntry[]>([
  [TARJETAS_TABLE_KEY, TARJETAS_COLUMNS],
]);

export function getTableColumnCatalog(tableKey: string): readonly TableColumnCatalogEntry[] | null {
  return TABLE_COLUMN_CATALOGS.get(tableKey) ?? null;
}
