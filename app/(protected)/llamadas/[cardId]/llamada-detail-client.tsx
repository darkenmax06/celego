"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, PhoneCall } from "lucide-react";
import { CallHistoryTimeline } from "@/components/llamadas/call-history-timeline";
import { CallSummaryHeader } from "@/components/llamadas/call-summary-header";
import {
  OperativeContactWizard,
  type WizardSavePayload,
  type WizardSaveResult,
} from "@/components/operativo/operative-contact-wizard";
import { Panel } from "@/components/ui/panel";
import {
  buildWizardCard,
  cardContactoEstado,
  type CallHistorialResponse,
} from "@/lib/llamadas/call-detail";
import { callDetailHref } from "@/lib/llamadas/nav-context";
import { useLlamadasNav } from "@/lib/use-llamadas-nav";
import { useCardGroups } from "@/lib/use-card-groups";

type Props = {
  cardId: string;
  operatorName: string | null;
  /** Registering calls is ADMIN/OPERADOR only (the POST route enforces it too). */
  canCall: boolean;
};

const FALLBACK_ORIGIN = "/operativo";

/**
 * Calls overhaul: call detail container. Loads the card + call history,
 * opens the contact wizard prefilled from the saved state (`?llamar=1` keeps
 * it open while moving between cards) and moves across the list the user
 * came from (see `lib/llamadas/nav-context.ts`).
 */
export default function LlamadaDetailClient({ cardId, operatorName, canCall }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wizardOpen = canCall && searchParams?.get("llamar") === "1";
  const nav = useLlamadasNav(cardId);
  // The wizard footer offers "Asignar a grupo" to the same roles that can call.
  const cardGroups = useCardGroups();

  const [data, setData] = useState<CallHistorialResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [provincias, setProvincias] = useState<string[]>([]);

  const loadHistorial = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/operativo/contacto/${encodeURIComponent(cardId)}/historial`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as (CallHistorialResponse & { error?: string }) | null;
      if (!res.ok || !json?.card) {
        setLoadError(json?.error ?? "No se pudo cargar la tarjeta");
        setData(null);
      } else {
        setLoadError("");
        setData(json);
      }
    } catch {
      setLoadError("No se pudo cargar la tarjeta");
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    void loadHistorial();
  }, [loadHistorial]);

  useEffect(() => {
    if (!canCall) return;
    fetch("/api/config/provincias", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { provincias?: Array<{ nombre: string }> }) => {
        if (Array.isArray(json.provincias)) setProvincias(json.provincias.map((p) => p.nombre).sort());
      })
      .catch(() => {});
  }, [canCall]);

  const currentData = data?.card.id === cardId ? data : null;
  const wizardCard = useMemo(() => (currentData ? buildWizardCard(currentData) : null), [currentData]);

  const setWizardOpen = useCallback(
    (open: boolean) => {
      router.replace(open ? `${pathname}?llamar=1` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const goTo = useCallback(
    async (direction: "prev" | "next") => {
      setNavigating(true);
      const target = await nav.resolveNeighbor(direction);
      setNavigating(false);
      if (target) router.push(callDetailHref(target, { llamar: wizardOpen }));
    },
    [nav, router, wizardOpen],
  );

  const saveContact = useCallback(
    async (payload: WizardSavePayload): Promise<WizardSaveResult> => {
      const res = await fetch("/api/operativo/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, ...payload }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; saved?: { status?: string } };
      if (!res.ok) return json.error ?? "No se pudo registrar el contacto";
      await loadHistorial();
      return { status: json.saved?.status ?? null };
    },
    [cardId, loadHistorial],
  );

  const originUrl = nav.originUrl ?? FALLBACK_ORIGIN;
  const positionLabel = nav.index >= 0 ? `${nav.index + 1} de ${nav.total}` : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={originUrl}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver{nav.originLabel ? ` a ${nav.originLabel}` : ""}
          </Link>
          <h1 className="font-display text-lg font-bold text-slate-900">Gestión de llamada</h1>
        </div>
        <nav aria-label="Navegación entre tarjetas" className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void goTo("prev")}
            disabled={!nav.hasPrev || navigating}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </button>
          {positionLabel ? <span className="text-xs font-semibold text-slate-600">{positionLabel}</span> : null}
          <button
            type="button"
            onClick={() => void goTo("next")}
            disabled={!nav.hasNext || navigating}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            Siguiente
            <ArrowRight className="h-4 w-4" />
          </button>
        </nav>
      </div>

      {loadError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {loadError}
        </p>
      ) : null}

      {currentData ? (
        <>
          <CallSummaryHeader
            card={currentData.card}
            contactoEstado={cardContactoEstado(currentData.card, currentData.historial)}
            attempts={currentData.historial.length}
          />

          <Panel>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">Historial de llamadas</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {currentData.historial.length} intento(s) registrados
                </p>
              </div>
              {canCall ? (
                <button
                  type="button"
                  onClick={() => setWizardOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
                >
                  <PhoneCall className="h-4 w-4" />
                  {currentData.historial.length ? "Nueva llamada" : "Contactar"}
                </button>
              ) : null}
            </header>
            <CallHistoryTimeline historial={currentData.historial} />
          </Panel>
        </>
      ) : loading && !loadError ? (
        <p className="py-12 text-center text-sm text-slate-500">Cargando tarjeta...</p>
      ) : null}

      {wizardOpen && wizardCard ? (
        <OperativeContactWizard
          card={wizardCard}
          index={Math.max(nav.index, 0)}
          total={Math.max(nav.total, 1)}
          hasPrev={nav.hasPrev && !navigating}
          hasNext={nav.hasNext && !navigating}
          provincesList={provincias}
          operatorName={operatorName}
          onClose={() => setWizardOpen(false)}
          onPrev={() => void goTo("prev")}
          onNext={() => void goTo("next")}
          onSave={saveContact}
          canManageGroups={canCall}
          cardGroups={cardGroups.groups}
          onGroupsChanged={() => {
            void cardGroups.reload();
            void loadHistorial();
          }}
        />
      ) : null}
    </div>
  );
}
