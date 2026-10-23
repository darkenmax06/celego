"use client";

import { useEffect, useMemo, useState } from "react";
import { FilterBar, type FacetConfig, type FilterBarProps, type GroupByConfig } from "@/components/filters/filter-bar";
import {
  buildCardFacets,
  buildGroupByOptions,
  CARD_FACET_PRESETS,
  CARD_GROUP_BY_PRESETS,
  OPEN_CARD_STATUS_VALUES,
  requiredFacetSources,
  type CardFacetKey,
  type CardFacetPreset,
  type CardFacetSources,
} from "@/lib/filters/card-facets";
import { useCardGroups } from "@/lib/use-card-groups";

/**
 * Calls overhaul: the ONE search + filter bar for card lists. It renders the
 * shared `FilterBar` (saved filters, chips, group-by, views stay intact) with
 * facets taken from the catalog in `lib/filters/card-facets.ts`, and loads
 * only the option sources those facets need.
 */

type CardFilterBarProps = Omit<FilterBarProps, "facets" | "groupByOptions"> & {
  /** Named facet set; `llamadas` is shared by operativo and SLA vencidas. */
  preset: CardFacetPreset;
  /** Facets that are page-specific and not part of the shared catalog (e.g. operativo "Días SLA"). */
  extraFacets?: FacetConfig[];
  /** Overrides the preset's group-by options. */
  groupByOptions?: GroupByConfig[];
  /**
   * Option sources the page already owns (e.g. tarjetas reloads its card
   * groups after a group action); they win over the ones loaded here.
   */
  sources?: Partial<CardFacetSources>;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Loads the async option lists the given facet keys require (provinces, messengers, operators, groups). */
export function useCardFacetSources(keys: readonly CardFacetKey[]): CardFacetSources {
  const needs = requiredFacetSources(keys);
  const { provincias: needProvincias, messengers: needMessengers, operadores: needOperadores } = needs;
  const cardGroups = useCardGroups();
  const [provincias, setProvincias] = useState<string[]>([]);
  const [messengers, setMessengers] = useState<Array<{ id: string; nombre: string }>>([]);
  const [operadores, setOperadores] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let alive = true;
    if (needProvincias) {
      void fetchJson<{ provincias?: Array<{ nombre: string }> }>("/api/config/provincias").then((data) => {
        if (alive && Array.isArray(data?.provincias)) {
          setProvincias(data.provincias.map((item) => item.nombre).sort());
        }
      });
    }
    if (needMessengers) {
      void fetchJson<{ messengers?: Array<{ id: string; nombre: string; activo?: boolean }> }>("/api/mensajeros").then(
        (data) => {
          if (alive && Array.isArray(data?.messengers)) {
            setMessengers(
              data.messengers
                .filter((item) => item.activo !== false)
                .map((item) => ({ id: item.id, nombre: item.nombre })),
            );
          }
        },
      );
    }
    if (needOperadores) {
      void fetchJson<{ operadores?: Array<{ id: string; name: string }> }>("/api/llamadas/operadores").then((data) => {
        if (alive && Array.isArray(data?.operadores)) setOperadores(data.operadores);
      });
    }
    return () => {
      alive = false;
    };
  }, [needProvincias, needMessengers, needOperadores]);

  const groups = needs.groups ? cardGroups.groups : undefined;
  return useMemo(
    () => ({ provincias, messengers, operadores, groups }),
    [provincias, messengers, operadores, groups],
  );
}

export function CardFilterBar({ preset, extraFacets, groupByOptions, sources: sourceOverrides, ...rest }: CardFilterBarProps) {
  const keys = CARD_FACET_PRESETS[preset];
  const loadedSources = useCardFacetSources(keys);
  const sources = useMemo(() => ({ ...loadedSources, ...sourceOverrides }), [loadedSources, sourceOverrides]);

  // FilterBar re-runs its distinct-values effect whenever `facets` changes
  // identity, so the array must be memoized.
  const facets = useMemo(
    () => [
      ...buildCardFacets(keys, {
        ...sources,
        statusValues: preset === "llamadas" ? OPEN_CARD_STATUS_VALUES : undefined,
      }),
      ...(extraFacets ?? []),
    ],
    [keys, sources, preset, extraFacets],
  );
  const groupBy = useMemo(
    () => groupByOptions ?? buildGroupByOptions(CARD_GROUP_BY_PRESETS[preset]),
    [groupByOptions, preset],
  );

  return <FilterBar {...rest} facets={facets} groupByOptions={groupBy} />;
}
