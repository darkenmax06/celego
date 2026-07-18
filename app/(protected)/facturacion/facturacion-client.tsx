"use client";

import { useEffect, useMemo, useState } from "react";
import { fromCents, formatCurrencyDOP, formatCurrencyUSD, toCents } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { usePersistentState } from "@/lib/use-persistent-state";

type ZoneRange = {
  id?: string;
  minQty: number;
  maxQty: number | null;
  centsPerCard: number;
};

type ZoneTariff = {
  id: string;
  zona: string;
  baseCents: number;
  active: boolean;
  ranges: ZoneRange[];
};

type SummaryRow = {
  zona: string;
  tarjetasEntregadas: number;
  tarifaAplicadaUsdCents?: number;
  totalUsdCents?: number;
  totalDopCents?: number;
  isRemoteSurcharge?: boolean;
};

type InvoiceFormState = {
  invoiceNumber: string;
  ncf: string;
  issueDate: string;
  clientName: string;
  rnc: string;
  city: string;
  state: string;
  purchaseOrder: string;
  representative: string;
  fob: string;
  paymentTerms: string;
};

const ZONE_COLORS: Record<string, string> = {
  Metro: "border-t-blue-500 text-blue-700",
  Este: "border-t-emerald-500 text-emerald-700",
  Norte: "border-t-violet-500 text-violet-700",
  Sur: "border-t-amber-500 text-amber-700",
  REMOTA: "border-t-orange-500 text-orange-700",
};

function buildDefaultInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `FAC-${y}${m}${d}-${h}${mm}`;
}

export default function FacturacionClient() {
  const [zones, setZones] = useState<ZoneTariff[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [totalUsdCents, setTotalUsdCents] = useState(0);
  const [totalDopCents, setTotalDopCents] = useState(0);
  const [additionalExcluded, setAdditionalExcluded] = useState(0);
  const [fxRate, setFxRate, fxRateHydrated] = usePersistentState(
    "facturacion:fx-rate",
    "60",
  );
  const [message, setMessage] = useState("");
  const [showInvoiceModal, setShowInvoiceModal] = usePersistentState(
    "facturacion:invoice-modal",
    false,
  );
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [from, setFrom, fromHydrated] = usePersistentState(
    "facturacion:from",
    new Date().toISOString().slice(0, 10),
  );
  const [to, setTo, toHydrated] = usePersistentState(
    "facturacion:to",
    new Date().toISOString().slice(0, 10),
  );
  const [invoiceForm, setInvoiceForm] = usePersistentState<InvoiceFormState>(
    "facturacion:invoice-form",
    () => ({
    invoiceNumber: buildDefaultInvoiceNumber(),
    ncf: "",
    issueDate: new Date().toISOString().slice(0, 10),
    clientName: "BANCO POPULAR DOMINICANO S.A",
    rnc: "",
    city: "Santo Domingo",
    state: "D.N.",
    purchaseOrder: "",
    representative: "",
    fob: "",
    paymentTerms: "Credito 30 dias.",
    }),
  );
  const billingFiltersHydrated = fxRateHydrated && fromHydrated && toHydrated;

  async function loadTarifas() {
    const res = await fetch("/api/facturacion/tarifas", { cache: "no-store" });
    const json = await res.json();
    setZones(json.zones ?? []);
  }

  async function loadSummary() {
    const params = new URLSearchParams({ from, to, fxRate });
    const res = await fetch(`/api/facturacion/resumen?${params.toString()}`, { cache: "no-store" });
    const json = await res.json();
    setSummary(json.rows ?? []);
    setTotalUsdCents(json.totalUsdCents ?? 0);
    setTotalDopCents(json.totalDopCents ?? 0);
    setAdditionalExcluded(json.additionalExcluded ?? 0);
  }

  useEffect(() => {
    if (!billingFiltersHydrated) return;
    void Promise.all([loadTarifas(), loadSummary()]);
  }, [billingFiltersHydrated]);

  async function saveZona(zone: ZoneTariff) {
    const ranges = zone.ranges
      .map((range) => ({
        minQty: Math.max(1, Math.trunc(range.minQty || 1)),
        maxQty: range.maxQty === null || range.maxQty === undefined ? null : Math.max(1, Math.trunc(range.maxQty)),
        centsPerCard: Math.max(0, Math.trunc(range.centsPerCard || 0)),
      }))
      .sort((a, b) => a.minQty - b.minQty);

    for (let index = 0; index < ranges.length; index += 1) {
      const current = ranges[index];
      if (current.maxQty !== null && current.maxQty < current.minQty) {
        setMessage(`Rango invalido en zona ${zone.zona}: 'Hasta' no puede ser menor que 'Desde'.`);
        return;
      }
      if (index < ranges.length - 1) {
        const next = ranges[index + 1];
        if (current.maxQty === null) {
          setMessage(`Rango invalido en zona ${zone.zona}: solo el ultimo rango puede quedar abierto.`);
          return;
        }
        if (current.maxQty >= next.minQty) {
          setMessage(`Rango invalido en zona ${zone.zona}: hay superposicion entre rangos.`);
          return;
        }
      }
    }

    const payload = {
      zona: zone.zona,
      baseCents: zone.baseCents,
      active: zone.active,
      ranges,
    };

    const res = await fetch("/api/facturacion/tarifas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo guardar tarifa");
      return;
    }

    setMessage(`Tarifa guardada para zona ${zone.zona}`);
    await Promise.all([loadTarifas(), loadSummary()]);
  }

  async function exportFacturacion() {
    const params = new URLSearchParams({
      type: "facturacion",
      format: "xlsx",
      from,
      to,
      fxRate,
    });
    const res = await fetch(`/api/reportes/export?${params.toString()}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "No se pudo exportar facturacion" }));
      setMessage(data.error ?? "No se pudo exportar facturacion");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturacion-${from}-${to}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Reporte de facturacion exportado");
  }

  async function generateInvoicePdf() {
    const parsedFxRate = Number(fxRate);
    if (!Number.isFinite(parsedFxRate) || parsedFxRate <= 0) {
      setMessage("La tasa USD debe ser mayor que cero");
      return;
    }
    if (!invoiceForm.invoiceNumber.trim()) {
      setMessage("Debes indicar el numero de factura");
      return;
    }
    if (!invoiceForm.ncf.trim()) {
      setMessage("Debes indicar el NCF");
      return;
    }

    setGeneratingInvoice(true);
    setMessage("");
    const payload = {
      from,
      to,
      fxRate: parsedFxRate,
      ...invoiceForm,
    };

    const res = await fetch("/api/facturacion/factura", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "No se pudo generar la factura" }));
      setMessage(data.error ?? "No se pudo generar la factura");
      setGeneratingInvoice(false);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `factura-${invoiceForm.invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    setGeneratingInvoice(false);
    setShowInvoiceModal(false);
    setInvoiceForm((prev) => ({
      ...prev,
      invoiceNumber: buildDefaultInvoiceNumber(),
    }));
    setMessage("Factura PDF generada");
  }

  const summaryMap = useMemo(
    () => new Map(summary.map((row) => [row.zona, row])),
    [summary],
  );

  return (
    <div>
      <PageHeader title="Facturacion" subtitle="Tarifas por zona y rangos de volumen (referencia UI)" />

      <Panel>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">Facturacion</h2>
            <p className="text-sm text-slate-500">Configuracion de tarifas y calculo por periodo</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void exportFacturacion()}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            >
              Exportar reporte
            </button>
            <button
              onClick={() => setShowInvoiceModal(true)}
              className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white"
            >
              Generar Factura
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Periodo de facturacion</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">al</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">Tasa USD</span>
          <input
            type="number"
            min={0.0001}
            step="0.0001"
            value={fxRate}
            onChange={(event) => setFxRate(event.target.value)}
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void loadSummary()}
            className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white"
          >
            Calcular
          </button>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {zones.map((zone) => {
            const row = summaryMap.get(zone.zona);
            const colorClasses = ZONE_COLORS[zone.zona] ?? "border-t-slate-400 text-slate-700";
            return (
              <article key={zone.id} className={`rounded-xl border border-slate-200 border-t-4 bg-white p-4 ${colorClasses}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zona {zone.zona}</p>
                <p className="mt-1 font-display text-2xl font-bold">{formatCurrencyUSD(row?.totalUsdCents ?? 0)}</p>
                <p className="text-xs text-slate-500">{formatCurrencyDOP(row?.totalDopCents ?? 0)}</p>
                <p className="mt-1 text-xs text-slate-500">{row?.tarjetasEntregadas ?? 0} entregas</p>
              </article>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {zones.map((zone) => (
            <ZoneEditor key={zone.id} zone={zone} onSave={saveZona} />
          ))}
        </div>
      </Panel>

      <Panel className="mt-5" title="Total del periodo">
        <p className="font-display text-3xl font-bold text-slate-900">{formatCurrencyUSD(totalUsdCents)}</p>
        <p className="text-sm text-slate-600">{formatCurrencyDOP(totalDopCents)} (tasa: {fxRate || "1"})</p>
        <p className="mt-1 text-xs text-slate-500">
          Adicionales excluidas de facturacion: {additionalExcluded}
        </p>
      </Panel>

      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

      {showInvoiceModal ? (
        <FacturaModal
          from={from}
          to={to}
          fxRate={fxRate}
          value={invoiceForm}
          generating={generatingInvoice}
          onChange={(patch) => setInvoiceForm((prev) => ({ ...prev, ...patch }))}
          onClose={() => setShowInvoiceModal(false)}
          onSubmit={() => void generateInvoicePdf()}
        />
      ) : null}
    </div>
  );
}

function ZoneEditor({
  zone,
  onSave,
}: {
  zone: ZoneTariff;
  onSave: (zone: ZoneTariff) => Promise<void>;
}) {
  const [local, setLocal] = useState<ZoneTariff>(zone);

  useEffect(() => {
    setLocal(zone);
  }, [zone]);

  function addRange() {
    setLocal((prev) => {
      if (!prev.ranges.length) {
        return {
          ...prev,
          ranges: [{ minQty: 1, maxQty: null, centsPerCard: prev.baseCents }],
        };
      }

      const nextRanges = [...prev.ranges];
      const lastIndex = nextRanges.length - 1;
      const last = nextRanges[lastIndex];
      const minQty = (last.maxQty ?? last.minQty) + 1;

      if (last.maxQty === null) {
        nextRanges[lastIndex] = { ...last, maxQty: minQty - 1 };
      }

      nextRanges.push({ minQty, maxQty: null, centsPerCard: prev.baseCents });
      return { ...prev, ranges: nextRanges };
    });
  }

  function updateRange(index: number, patch: Partial<ZoneRange>) {
    setLocal((prev) => ({
      ...prev,
      ranges: prev.ranges.map((range, rowIndex) => (rowIndex === index ? { ...range, ...patch } : range)),
    }));
  }

  function removeRange(index: number) {
    setLocal((prev) => ({
      ...prev,
      ranges: prev.ranges.filter((_, rowIndex) => rowIndex !== index),
    }));
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-slate-900">Zona {local.zona}</h3>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={local.active}
            onChange={(event) => setLocal((prev) => ({ ...prev, active: event.target.checked }))}
          />
          Activa
        </label>
      </div>

      <label className="mb-3 block text-sm text-slate-600">
        Tarifa base (USD)
        <input
          type="number"
          min={0}
          step="0.01"
          value={local.baseCents / 100}
          onChange={(event) =>
            setLocal((prev) => ({ ...prev, baseCents: toCents(Number(event.target.value || 0)) }))
          }
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="rounded-xl border border-slate-200">
        <div className="grid grid-cols-[90px_90px_1fr_36px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Desde</span>
          <span>Hasta</span>
          <span>Precio</span>
          <span></span>
        </div>
        <div className="space-y-2 p-3">
          {local.ranges.map((range, index) => (
            <div key={index} className="grid grid-cols-[90px_90px_1fr_36px] gap-2">
              <input
                type="number"
                min={1}
                value={range.minQty}
                onChange={(event) => updateRange(index, { minQty: Number(event.target.value || 1) })}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                min={1}
                value={range.maxQty ?? ""}
                onChange={(event) =>
                  updateRange(index, {
                    maxQty: event.target.value === "" ? null : Number(event.target.value),
                  })
                }
                placeholder="8"
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={range.centsPerCard / 100}
                onChange={(event) =>
                  updateRange(index, { centsPerCard: toCents(Number(event.target.value || 0)) })
                }
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRange(index)}
                className="rounded-lg border border-slate-300 text-xs text-slate-600"
              >
                x
              </button>
            </div>
          ))}
          {!local.ranges.length ? (
            <p className="text-xs text-slate-500">Sin rangos configurados. Se usara tarifa base.</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={addRange}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600"
        >
          + Agregar rango
        </button>
        <button
          type="button"
          onClick={() => void onSave(local)}
          className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white"
        >
          Guardar zona
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Tarifa base actual: <span className="font-semibold text-slate-700">${fromCents(local.baseCents)}</span>
      </p>
    </article>
  );
}
function FacturaModal({
  from,
  to,
  fxRate,
  value,
  generating,
  onChange,
  onClose,
  onSubmit,
}: {
  from: string;
  to: string;
  fxRate: string;
  value: InvoiceFormState;
  generating: boolean;
  onChange: (patch: Partial<InvoiceFormState>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className="max-h-[95vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">Generar factura PDF</h3>
            <p className="text-sm text-slate-600">Plantilla exacta basada en Factura Ejemplo.pdf</p>
            <p className="text-xs text-slate-500">
              Periodo: {from} al {to} | Tasa USD: {fxRate}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600">
            Cerrar
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">
            Numero de factura
            <input
              type="text"
              value={value.invoiceNumber}
              onChange={(event) => onChange({ invoiceNumber: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            NCF
            <input
              type="text"
              value={value.ncf}
              onChange={(event) => onChange({ ncf: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            Fecha
            <input
              type="date"
              value={value.issueDate}
              onChange={(event) => onChange({ issueDate: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            Cliente
            <input
              type="text"
              value={value.clientName}
              onChange={(event) => onChange({ clientName: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            RNC
            <input
              type="text"
              value={value.rnc}
              onChange={(event) => onChange({ rnc: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            Orden de compra
            <input
              type="text"
              value={value.purchaseOrder}
              onChange={(event) => onChange({ purchaseOrder: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            Ciudad
            <input
              type="text"
              value={value.city}
              onChange={(event) => onChange({ city: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            Estado
            <input
              type="text"
              value={value.state}
              onChange={(event) => onChange({ state: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            Representante
            <input
              type="text"
              value={value.representative}
              onChange={(event) => onChange({ representative: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            FOB
            <input
              type="text"
              value={value.fob}
              onChange={(event) => onChange({ fob: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="mt-3 block text-sm text-slate-600">
          Condiciones de pago
          <input
            type="text"
            value={value.paymentTerms}
            onChange={(event) => onChange({ paymentTerms: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={generating}
            className="rounded-lg bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? "Generando..." : "Generar y descargar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

