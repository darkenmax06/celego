/**
 * Runtime lookup of a list-query descriptor by its stable resource key.
 *
 * Routes should import their own descriptor directly so a route bundle does not
 * pull in every model. This registry exists for the surfaces that must resolve a
 * descriptor at runtime from a request parameter — distinct-values and groupBy.
 */
import type { ErasedListQueryDescriptor } from "./types";
import { tarjetasListQuery } from "./descriptors/tarjetas";
import { rutasListQuery } from "./descriptors/rutas";
import { mensajerosListQuery } from "./descriptors/mensajeros";
import { redaccionesListQuery } from "./descriptors/redacciones";
import { lotesListQuery } from "./descriptors/lotes";
import { configUsuariosListQuery } from "./descriptors/config-usuarios";
import { actividadListQuery } from "./descriptors/actividad";
import { operativoContactoListQuery } from "./descriptors/operativo-contacto";
import { bizcochitosListQuery } from "./descriptors/bizcochitos";
import { slaVencidasListQuery } from "./descriptors/sla-vencidas";

/**
 * Erased descriptor shape. The registry cannot carry each resource's concrete
 * `TWhere`, so runtime consumers work against the descriptor metadata and
 * re-attach the concrete type at their own call site.
 */
export type AnyListQueryDescriptor = ErasedListQueryDescriptor;

export const LIST_QUERY_REGISTRY: Readonly<Record<string, AnyListQueryDescriptor>> = {
  tarjetas: tarjetasListQuery as unknown as AnyListQueryDescriptor,
  rutas: rutasListQuery as unknown as AnyListQueryDescriptor,
  mensajeros: mensajerosListQuery as unknown as AnyListQueryDescriptor,
  redacciones: redaccionesListQuery as unknown as AnyListQueryDescriptor,
  lotes: lotesListQuery as unknown as AnyListQueryDescriptor,
  "config-usuarios": configUsuariosListQuery as unknown as AnyListQueryDescriptor,
  actividad: actividadListQuery as unknown as AnyListQueryDescriptor,
  "operativo-contacto": operativoContactoListQuery as unknown as AnyListQueryDescriptor,
  bizcochitos: bizcochitosListQuery as unknown as AnyListQueryDescriptor,
  "sla-vencidas": slaVencidasListQuery as unknown as AnyListQueryDescriptor,
};

export function getListQueryDescriptor(key: string): AnyListQueryDescriptor {
  const descriptor = LIST_QUERY_REGISTRY[key];
  if (!descriptor) throw new Error(`Unknown list query resource: ${key}`);
  return descriptor;
}

export {
  tarjetasListQuery,
  rutasListQuery,
  mensajerosListQuery,
  redaccionesListQuery,
  lotesListQuery,
  configUsuariosListQuery,
  actividadListQuery,
  operativoContactoListQuery,
  bizcochitosListQuery,
  slaVencidasListQuery,
};
