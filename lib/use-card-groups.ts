"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SDD card-groups — Work Unit E, Task 14.
 *
 * Fetches `GET /api/card-groups` (id/name/member-count) once on mount for the
 * "Grupo" facet and the group-assign modal's existing-group picker. No SWR
 * layer exists in this codebase (design decision) — freshness after a
 * create/rename/delete is the caller's responsibility via `reload()`.
 */
export type CardGroupSummary = {
  id: string;
  name: string;
  _count: { members: number };
};

export type UseCardGroups = {
  readonly groups: CardGroupSummary[];
  reload(): Promise<void>;
};

export function useCardGroups(): UseCardGroups {
  const [groups, setGroups] = useState<CardGroupSummary[]>([]);

  const reload = useCallback(async () => {
    const response = await fetch("/api/card-groups");
    if (!response.ok) return;
    const body = (await response.json()) as { groups: CardGroupSummary[] };
    setGroups(body.groups);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { groups, reload };
}
