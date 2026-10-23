"use client";

import { useEffect, useState } from "react";

export type CallOperator = { id: string; name: string };

/**
 * Calls overhaul: users that can receive call assignments
 * (`GET /api/llamadas/operadores`). `enabled=false` skips the request (e.g.
 * the operator selector is only shown to ADMIN).
 */
export function useCallOperators(enabled = true) {
  const [operadores, setOperadores] = useState<CallOperator[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    fetch("/api/llamadas/operadores", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { operadores?: CallOperator[] } | null;
        if (!alive) return;
        if (!res.ok || !Array.isArray(json?.operadores)) {
          setError("No se pudieron cargar los operadores");
          return;
        }
        setOperadores(json.operadores);
      })
      .catch(() => {
        if (alive) setError("No se pudieron cargar los operadores");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { operadores, loading, error };
}
