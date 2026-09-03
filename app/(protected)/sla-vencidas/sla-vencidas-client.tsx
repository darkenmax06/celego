"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, PhoneCall } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { usePersistentState } from "@/lib/use-persistent-state";
import { FilterBar } from "@/components/filters/filter-bar";
import { TableColumnSelector } from "@/components/ui/table-column-selector";
import {
  useResizableColumns,
  ResizableHeader,
} from "@/components/ui/use-resizable-columns";
import {
  OperativeContactWizard,
  type PhoneState,
  type OperativeWizardCard,
} from "@/components/operativo/operative-contact-wizard";

type MessengerOption = {
  id: string;
  nombre: string;
};

type Row = {
  id: string;
  tc: string;
  status: string;
  slaDueDate: string | null;
  dispatchDate: string | null;
  provincia: string;
  zona: string;
  tipoTarjeta: string;
  adicional: boolean;
  adicionalNumero: number;
  nombre: string;
  cedula: string;
  direccion: string;
  telefonos: string;
  mensajero: string;
  mensajeroId: string;
  diasVencidos: number;
  contactado?: boolean;
  contactoEstado?: string;
  canalContacto?: string | null;
  solicitudRetorno?: boolean;
  motivoRetorno?: string | null;
  traslado?: Record<string, unknown> | null;
  nuevaDireccion?: string | null;
  fechaPreferenciaEntrega?: string | null;
  comentarioContacto?: string | null;
  metadata?: unknown;
};

type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Payload = {
  filters: { messengerId: string };
  messengers: MessengerOption[];
  total: number;
  rows: Row[];
  pagination?: PaginationMeta;
};

const EXPORT_COLUMNS = [
  { key: "nombre", label: "Cliente", locked: true },
  { key: "cedula", label: "Cédula" },
  { key: "tc", label: "TC" },
  { key: "contactoEstado", label: "Gestión Contacto" },
  { key: "status", label: "Status" },
  { key: "slaDueDate", label: "SLA vence" },
  { key: "diasVencidos", label: "Días vencidos" },
  { key: "dispatchDate", label: "Fecha despacho" },
  { key: "mensajero", label: "Mensajero" },
  { key: "provincia", label: "Provincia" },
  { key: "zona", label: "Zona" },
  { key: "tipoTarjeta", label: "Tipo tarjeta" },
  { key: "adicional", label: "Adicional" },
  { key: "direccion", label: "Dirección" },
  { key: "telefonos", label: "Contactos" },
] as const;

type ExportColumnKey = (typeof EXPORT_COLUMNS)[number]["key"];

const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = [
  "nombre",
  "cedula",
  "tc",
  "contactoEstado",
  "status",
  "slaDueDate",
  "diasVencidos",
  "tipoTarjeta",
  "adicional",
  "mensajero",
  "provincia",
  "direccion",
  "telefonos",
];

const DEFAULT_SLA_COLUMN_WIDTHS: Record<string, number> = {
  nombre: 220,
  cedula: 130,
  tc: 180,
  contactoEstado: 160,
  status: 140,
  slaDueDate: 120,
  diasVencidos: 120,
  dispatchDate: 130,
  mensajero: 160,
  provincia: 140,
  zona: 130,
  tipoTarjeta: 120,
  adicional: 110,
  direccion: 240,
  telefonos: 150,
};

function dateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-DO");
}

function getSlaGroupKey(row: Row, groupBy: string): { key: string; label: string } {
  switch (groupBy) {
    case "contactoEstado": {
      if (row.contactoEstado === "RETORNO_SOLICITADO") return { key: "RETORNO_SOLICITADO", label: "⚠ Retorno Solicitado" };
      if (row.contactoEstado === "TRASLADO_SOLICITADO") return { key: "TRASLADO_SOLICITADO", label: "✈ Traslado Solicitado" };
      if (row.contactoEstado === "CONTACTADA") return { key: "CONTACTADA", label: "✓ Contactadas" };
      return { key: "NO_CONTACTADA", label: "○ No Contactadas / Pendientes" };
    }
    case "messengerId":
    case "mensajero":
      return { key: row.mensajeroId || "UNASSIGNED", label: row.mensajero || "Sin Asignar" };
    case "provincia":
      return { key: row.provincia || "SIN_PROVINCIA", label: row.provincia || "Sin Provincia" };
    case "zona":
      return { key: row.zona || "SIN_ZONA", label: row.zona || "Sin Zona" };
    case "status":
      return { key: row.status || "SIN_ESTADO", label: row.status || "Sin Estado" };
    case "tipoTarjeta":
      return { key: row.tipoTarjeta || "SIN_TIPO", label: row.tipoTarjeta || "Sin Tipo" };
    case "adicional":
      return row.adicional
        ? { key: `ADIC_${row.adicionalNumero}`, label: `Adicional ${row.adicionalNumero}` }
        : { key: "PRINCIPAL", label: "Principal" };
    default: {
      const val = (row as unknown as Record<string, unknown>)[groupBy];
      if (val !== undefined && val !== null) {
        return { key: String(val), label: String(val) };
      }
      return { key: "ALL", label: "General" };
    }
  }
}

export default function SlaVencidasClient() {
  const [filters, setFilters] = useState<Record<string, string>>({
    messengerId: "ALL",
    page: "1",
    pageSize: "50",
  });
  const [messengers, setMessengers] = useState<MessengerOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exportColumns, setExportColumns] = usePersistentState<ExportColumnKey[]>(
    "sla-vencidas:columns",
    DEFAULT_EXPORT_COLUMNS,
  );
  const { widths: columnWidths, updateWidth: onColumnResize } = useResizableColumns(
    "sla-vencidas",
    DEFAULT_SLA_COLUMN_WIDTHS,
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Wizard state for SLA Vencidas
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [provincesList, setProvinciasList] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/config/provincias", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.provincias) {
          setProvinciasList(data.provincias.map((p: { nombre: string }) => p.nombre).sort());
        }
      })
      .catch(() => {});
  }, []);

  async function loadData(currentFilters = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(currentFilters).forEach(([k, v]) => {
      if (v && v !== "ALL") params.set(k, v);
    });

    const query = params.toString();
    const res = await fetch(`/api/sla-vencidas${query ? `?${query}` : ""}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({ error: "No se pudo cargar SLA vencidas" }))) as
      | Payload
      | { error: string };

    if (!res.ok || "error" in json) {
      setMessage(("error" in json && json.error) || "No se pudo cargar SLA vencidas");
      setLoading(false);
      return;
    }

    setMessengers(json.messengers ?? []);
    setRows(json.rows ?? []);
    if (json.pagination) {
      setPagination(json.pagination);
    } else {
      setPagination({
        page: 1,
        pageSize: json.total || json.rows.length,
        total: json.total || json.rows.length,
        totalPages: 1,
      });
    }
    setMessage("");
    setLoading(false);
  }

  useEffect(() => {
    void loadData(filters);
  }, [filters]);

  const groupedRows = useMemo(() => {
    if (!filters.groupBy) return null;
    const groups: Record<string, { groupKey: string; groupLabel: string; items: Row[] }> = {};
    for (const row of rows) {
      const { key, label } = getSlaGroupKey(row, filters.groupBy);
      if (!groups[key]) {
        groups[key] = { groupKey: key, groupLabel: label, items: [] };
      }
      groups[key].items.push(row);
    }
    return Object.values(groups);
  }, [rows, filters.groupBy]);

  // Selected card for OperativeContactWizard
  const selectedIndex = selectedCardId ? rows.findIndex((r) => r.id === selectedCardId) : -1;
  const currentRow = selectedIndex >= 0 ? rows[selectedIndex] : null;

  const currentWizardCard: OperativeWizardCard | null = useMemo(() => {
    if (!currentRow) return null;
    const rawPhones = (currentRow.telefonos || "")
      .split(/[\n,;]+/g)
      .map((p) => p.trim())
      .filter(Boolean);

    const phones: PhoneState[] = rawPhones.length
      ? rawPhones.map((num, i) => ({
          num,
          principal: i === 0,
          funciona: false,
          comentario: "",
        }))
      : [{ num: "", principal: true, funciona: false, comentario: "" }];

    return {
      id: currentRow.id,
      cardId: currentRow.id,
      tc: currentRow.tc,
      nombre: currentRow.nombre,
      cedula: currentRow.cedula,
      provincia: currentRow.provincia,
      zona: currentRow.zona,
      status: currentRow.status,
      fechaDespacho: currentRow.dispatchDate,
      tipoEmision: currentRow.tipoTarjeta,
      direcciones: currentRow.direccion ? [currentRow.direccion] : [],
      refs: [],
      mensajero: currentRow.mensajero || "Sin asignar",
      telefonos: phones,
      remaining: -currentRow.diasVencidos,
      readOnly: false,
    };
  }, [currentRow]);

  async function saveContactFromWizard(payload: {
    telefonos: PhoneState[];
    comentario: string;
    contactado: boolean;
    canalContacto?: "WHATSAPP" | "LLAMADA_DIRECTA" | null;
    nuevaDireccion?: string | null;
    fechaPreferenciaEntrega?: string | null;
    solicitudRetorno?: boolean;
    motivoRetorno?: string | null;
    trasladoProvincia?: string | null;
    trasladoMotivo?: string | null;
  }) {
    if (!currentRow) return "No hay tarjeta seleccionada";

    const res = await fetch("/api/operativo/contacto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: currentRow.id,
        ...payload,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return data.error ?? "No se pudo registrar contacto";
    }

    await loadData();
    return null;
  }

  async function exportJpgZip() {
    const params = new URLSearchParams();
    if (filters.messengerId && filters.messengerId !== "ALL") {
      params.set("messengerId", filters.messengerId);
    }
    const res = await fetch(`/api/sla-vencidas/export?${params.toString()}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo exportar imagenes" }));
      setMessage(json.error ?? "No se pudo exportar imagenes");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sla-vencidas-${filters.messengerId === "ALL" ? "general" : filters.messengerId}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Export JPG generado");
  }

  async function exportList(format: "csv" | "xlsx" | "pdf") {
    if (!exportColumns.length) {
      setMessage("Selecciona al menos una columna para exportar el listado.");
      return;
    }

    const res = await fetch("/api/sla-vencidas/export-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messengerId: filters.messengerId || "ALL",
        columns: exportColumns,
        format,
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "No se pudo exportar el listado" }));
      setMessage(json.error ?? "No se pudo exportar el listado");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sla-vencidas-listado.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Listado exportado en ${format.toUpperCase()}`);
  }

  const renderSlaRow = (row: Row) => (
    <tr
      key={row.id}
      onClick={() => setSelectedCardId(row.id)}
      className="cursor-pointer border-t border-slate-100 align-top hover:bg-blue-50/50 transition-colors"
    >
      {exportColumns.includes("nombre") ? (
        <td className="px-3 py-2.5 font-semibold text-slate-900 truncate" title={row.nombre}>
          <div className="flex items-center gap-1.5 min-w-0">
            <PhoneCall className="h-3.5 w-3.5 text-blue-600 opacity-60 shrink-0" />
            <span className="truncate">{row.nombre}</span>
          </div>
        </td>
      ) : null}
      {exportColumns.includes("tc") || exportColumns.includes("cedula") ? (
        <td className="px-3 py-2.5 truncate">
          {exportColumns.includes("tc") ? (
            <p className="font-mono font-bold text-blue-700 truncate" title={row.tc}>{row.tc}</p>
          ) : null}
          {exportColumns.includes("cedula") ? (
            <p className="text-xs text-slate-500 truncate" title={row.cedula}>{row.cedula}</p>
          ) : null}
        </td>
      ) : null}
      {exportColumns.includes("contactoEstado" as ExportColumnKey) ? (
        <td className="px-3 py-2.5 truncate">
          {row.solicitudRetorno || row.contactoEstado === "RETORNO_SOLICITADO" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-bold text-rose-700">
              ⚠ Retorno
            </span>
          ) : row.traslado || row.contactoEstado === "TRASLADO_SOLICITADO" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
              ✈ Traslado
            </span>
          ) : row.contactado || row.contactoEstado === "CONTACTADA" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              ✓ Contactada {row.canalContacto ? `(${row.canalContacto})` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              ○ No contactada
            </span>
          )}
        </td>
      ) : null}
      {exportColumns.includes("mensajero") ? (
        <td className="px-3 py-2.5 text-slate-700 truncate" title={row.mensajero || "SIN ASIGNAR"}>
          <span className="truncate block">{row.mensajero || "SIN ASIGNAR"}</span>
        </td>
      ) : null}
      {exportColumns.includes("provincia") || exportColumns.includes("zona") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={row.provincia || row.zona}>
          <span className="truncate block">{row.provincia || row.zona}</span>
        </td>
      ) : null}
      {exportColumns.includes("tipoTarjeta") || exportColumns.includes("adicional") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">
          <span className="truncate block">
            {row.adicional ? `ADIC. ${row.adicionalNumero}` : "PRINCIPAL"}
          </span>
        </td>
      ) : null}
      {exportColumns.includes("status") ? (
        <td className="px-3 py-2.5 truncate">
          <StatusBadge value={row.status} />
        </td>
      ) : null}
      {exportColumns.includes("slaDueDate") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate">
          <span className="truncate block">{dateLabel(row.slaDueDate)}</span>
        </td>
      ) : null}
      {exportColumns.includes("diasVencidos") ? (
        <td className="px-3 py-2.5 text-rose-700 font-semibold truncate">
          <span className="truncate block">{row.diasVencidos} día(s)</span>
        </td>
      ) : null}
      {exportColumns.includes("direccion") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={row.direccion || ""}>
          <span className="truncate block">{row.direccion || "-"}</span>
        </td>
      ) : null}
      {exportColumns.includes("telefonos") ? (
        <td className="px-3 py-2.5 text-slate-600 truncate" title={row.telefonos || ""}>
          <span className="truncate block">{row.telefonos || "-"}</span>
        </td>
      ) : null}
    </tr>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tarjetas con SLA vencidas"
        subtitle="Haz clic en cualquier tarjeta para abrir el Wizard de contacto en 3 columnas, gestionar llamadas, traslados o retornos"
      />

      <FilterBar
        resource="sla-vencidas"
        sectionKey="sla-vencidas"
        filters={filters}
        onFilterChange={(next) => setFilters({ ...next, page: "1", pageSize: filters.pageSize || "50" })}
        onReset={() => setFilters({ messengerId: "ALL", page: "1", pageSize: "50" })}
        searchPlaceholder="Buscar por TC, cédula, nombre, provincia o zona..."
        facets={[
          {
            field: "contactoEstado",
            label: "Gestión Contacto",
            options: [
              { label: "Contactadas", value: "CONTACTADA" },
              { label: "No contactadas / Pendientes", value: "NO_CONTACTADA" },
              { label: "Retorno solicitado", value: "RETORNO_SOLICITADO" },
              { label: "Traslado solicitado", value: "TRASLADO_SOLICITADO" },
            ],
          },
          {
            field: "productType",
            label: "Producto",
            options: [
              { label: "Crédito", value: "CREDITO" },
              { label: "Débito", value: "DEBITO" },
            ],
          },
          {
            field: "messengerId",
            label: "Mensajero",
            options: messengers.map((m) => ({ label: m.nombre, value: m.id })),
          },
          { field: "provincia", label: "Provincia" },
          { field: "zona", label: "Zona" },
          { field: "status", label: "Status" },
        ]}
        groupByOptions={[
          { field: "contactoEstado", label: "Gestión Contacto" },
          { field: "productType", label: "Producto" },
          { field: "messengerId", label: "Mensajero" },
          { field: "provincia", label: "Provincia" },
          { field: "zona", label: "Zona" },
          { field: "status", label: "Status" },
        ]}
      />

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void exportJpgZip()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Exportar JPG (ZIP)
            </button>
            <button
              type="button"
              onClick={() => void exportList("csv")}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => void exportList("xlsx")}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={() => void exportList("pdf")}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Exportar PDF
            </button>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
            Total vencidas: {pagination.total} {pagination.total > rows.length ? `(Mostrando ${rows.length})` : ""}
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {loading ? "Cargando..." : `Listado (${rows.length})`}
            </h2>
            {filters.groupBy ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Agrupado por: {filters.groupBy}
              </span>
            ) : null}
          </div>
          <TableColumnSelector
            columns={EXPORT_COLUMNS}
            visibleColumns={exportColumns}
            onChange={setExportColumns}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          {(() => {
            const visibleHeaderCount = [
              exportColumns.includes("nombre"),
              exportColumns.includes("tc") || exportColumns.includes("cedula"),
              exportColumns.includes("mensajero"),
              exportColumns.includes("provincia") || exportColumns.includes("zona"),
              exportColumns.includes("tipoTarjeta") || exportColumns.includes("adicional"),
              exportColumns.includes("status"),
              exportColumns.includes("slaDueDate"),
              exportColumns.includes("diasVencidos"),
              exportColumns.includes("direccion"),
              exportColumns.includes("telefonos"),
            ].filter(Boolean).length;

            return (
              <table className="w-full min-w-[1200px] text-left text-sm table-fixed">
                <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600 border-b border-slate-200">
                  <tr>
                    {exportColumns.includes("nombre") ? (
                      <ResizableHeader
                        columnKey="nombre"
                        label="Cliente"
                        width={columnWidths.nombre}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("tc") || exportColumns.includes("cedula") ? (
                      <ResizableHeader
                        columnKey="tc"
                        label="TC / Cédula"
                        width={columnWidths.tc}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("mensajero") ? (
                      <ResizableHeader
                        columnKey="mensajero"
                        label="Mensajero"
                        width={columnWidths.mensajero}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("provincia") || exportColumns.includes("zona") ? (
                      <ResizableHeader
                        columnKey="provincia"
                        label="Provincia / Zona"
                        width={columnWidths.provincia}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("tipoTarjeta") || exportColumns.includes("adicional") ? (
                      <ResizableHeader
                        columnKey="tipoTarjeta"
                        label="Tipo"
                        width={columnWidths.tipoTarjeta}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("status") ? (
                      <ResizableHeader
                        columnKey="status"
                        label="Status"
                        width={columnWidths.status}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("slaDueDate") ? (
                      <ResizableHeader
                        columnKey="slaDueDate"
                        label="SLA"
                        width={columnWidths.slaDueDate}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("diasVencidos") ? (
                      <ResizableHeader
                        columnKey="diasVencidos"
                        label="Vencida"
                        width={columnWidths.diasVencidos}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("direccion") ? (
                      <ResizableHeader
                        columnKey="direccion"
                        label="Dirección"
                        width={columnWidths.direccion}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                    {exportColumns.includes("telefonos") ? (
                      <ResizableHeader
                        columnKey="telefonos"
                        label="Contactos"
                        width={columnWidths.telefonos}
                        onResize={onColumnResize}
                        className="px-3"
                      />
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {groupedRows ? (
                    groupedRows.map((group) => {
                      const isCollapsed = Boolean(collapsedGroups[group.groupKey]);
                      return (
                        <React.Fragment key={group.groupKey}>
                          <tr
                            onClick={() =>
                              setCollapsedGroups((prev) => ({
                                ...prev,
                                [group.groupKey]: !prev[group.groupKey],
                              }))
                            }
                            className="cursor-pointer bg-slate-100/90 font-semibold text-slate-900 transition hover:bg-slate-200/80 select-none border-y border-slate-200"
                          >
                            <td colSpan={visibleHeaderCount} className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                {isCollapsed ? (
                                  <ChevronRight className="h-4 w-4 text-slate-600" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-600" />
                                )}
                                <span className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                                  Grupo:
                                </span>
                                <span className="text-sm font-bold text-slate-900">
                                  {group.groupLabel}
                                </span>
                                <span className="rounded-full bg-slate-200/90 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                  {group.items.length}{" "}
                                  {group.items.length === 1 ? "tarjeta" : "tarjetas"}
                                </span>
                              </div>
                            </td>
                          </tr>
                          {!isCollapsed
                            ? group.items.map((row) => renderSlaRow(row))
                            : null}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    rows.map((row) => renderSlaRow(row))
                  )}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={visibleHeaderCount} className="py-8 text-center text-sm text-slate-500">
                        {loading ? "Cargando..." : "No hay tarjetas SLA vencidas para este filtro."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            );
          })()}
        </div>

        {pagination.totalPages > 1 || pagination.total > 10 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>
                Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> ({pagination.total} total)
              </span>
              <span className="text-slate-300">|</span>
              <label className="flex items-center gap-1">
                <span>Por página:</span>
                <select
                  value={filters.pageSize || "50"}
                  onChange={(e) => setFilters((prev) => ({ ...prev, pageSize: e.target.value, page: "1" }))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setFilters((prev) => ({ ...prev, page: String(Math.max(1, pagination.page - 1)) }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setFilters((prev) => ({ ...prev, page: String(pagination.page + 1) }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      {/* OPERATIVE WIZARD ON SLA VENCIDAS */}
      {selectedIndex >= 0 && currentWizardCard ? (
        <OperativeContactWizard
          card={currentWizardCard}
          index={selectedIndex}
          total={rows.length}
          provincesList={provincesList}
          onClose={() => setSelectedCardId(null)}
          onPrev={() => setSelectedCardId(rows[Math.max(selectedIndex - 1, 0)]?.id ?? null)}
          onNext={() =>
            setSelectedCardId(rows[Math.min(selectedIndex + 1, rows.length - 1)]?.id ?? null)
          }
          onSave={saveContactFromWizard}
        />
      ) : null}
    </div>
  );
}
