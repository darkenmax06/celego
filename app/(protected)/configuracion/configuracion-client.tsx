"use client";

import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UserManagement } from "@/components/config/user-management";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { usePersistentState } from "@/lib/use-persistent-state";

type SlaConfig = { id: string; businessDays: number; warningBusinessDays: number };
type DebitConsolidadoExportConfig = { id: string; dispatchDateFrom: string | null };
type Motivo = { id: string; nombre: string; active: boolean };
type Provincia = { id: string; nombre: string; zona: string; active: boolean };

export default function ConfiguracionClient() {
  const [activeTab, setActiveTab] = usePersistentState<"GENERAL" | "USERS" | "PLANTILLAS">(
    "config:active-tab",
    "GENERAL",
  );
  const [sla, setSla] = useState<SlaConfig | null>(null);
  const [exportConfig, setExportConfig] = useState<DebitConsolidadoExportConfig | null>(null);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [newMotivo, setNewMotivo] = usePersistentState("config:new-return-reason", "");
  const [newProvincia, setNewProvincia] = usePersistentState("config:new-province", "");
  const [newZona, setNewZona] = usePersistentState("config:new-zone", "Metro");

  // Plantilla de comunicación
  const [scriptText, setScriptText] = useState("");
  const [whatsappText, setWhatsappText] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [variables, setVariables] = useState<Array<{ key: string; label: string }>>([]);

  async function loadAll() {
    try {
      const [slaRes, exportConfigRes, motivosRes, provinciasRes, templateRes] = await Promise.all([
        fetch("/api/config/sla", { cache: "no-store" }),
        fetch("/api/config/export-consolidado", { cache: "no-store" }),
        fetch("/api/config/motivos-retorno", { cache: "no-store" }),
        fetch("/api/config/provincias", { cache: "no-store" }),
        fetch("/api/config/plantilla-comunicacion", { cache: "no-store" }),
      ]);
      const [slaJson, exportConfigJson, motivosJson, provinciasJson, templateJson] = await Promise.all([
        slaRes.json(),
        exportConfigRes.json(),
        motivosRes.json(),
        provinciasRes.json(),
        templateRes.json().catch(() => ({})),
      ]);
      setSla(slaJson.config ?? null);
      setExportConfig(exportConfigJson.config ?? null);
      setMotivos(motivosJson.motivos ?? []);
      setProvincias(provinciasJson.provincias ?? []);
      if (templateJson?.config) {
        setScriptText(templateJson.config.scriptText || "");
        setWhatsappText(templateJson.config.whatsappText || "");
      }
      if (templateJson?.variables) {
        setVariables(templateJson.variables);
      }
    } catch {
      failure("No se pudo cargar la configuración");
    }
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    const res = await fetch("/api/config/plantilla-comunicacion", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptText, whatsappText }),
    });
    const json = await res.json();
    setSavingTemplate(false);
    if (!res.ok) {
      failure(json.error ?? "No se pudo guardar la plantilla");
      return;
    }
    success("Plantilla de comunicación guardada correctamente");
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function success(value: string) {
    toast.success(value);
  }

  function failure(value: string) {
    toast.error(value);
  }

  async function saveSla() {
    if (!sla) return;
    const response = await fetch("/api/config/sla", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessDays: sla.businessDays,
        warningBusinessDays: sla.warningBusinessDays,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      failure(json.error ?? "No se pudo guardar SLA");
      return;
    }
    success("SLA actualizado");
    await loadAll();
  }

  async function saveExportConfig() {
    if (!exportConfig) return;
    const toastId = toast.loading("Guardando filtro del consolidado...");
    try {
      const response = await fetch("/api/config/export-consolidado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatchDateFrom: exportConfig.dispatchDateFrom?.slice(0, 10) || null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = Array.isArray(json.details)
          ? `: ${json.details.filter((item: unknown): item is string => typeof item === "string").join(", ")}`
          : "";
        throw new Error(`${json.error ?? "No se pudo guardar el filtro del consolidado"}${details}`);
      }
      await loadAll();
      toast.success("Filtro del consolidado actualizado", { id: toastId });
      return;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar el filtro del consolidado",
        { id: toastId },
      );
    }
  }

  async function addMotivo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/config/motivos-retorno", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: newMotivo }),
    });
    const json = await response.json();
    if (!response.ok) {
      failure(json.error ?? "No se pudo agregar motivo");
      return;
    }
    setNewMotivo("");
    success("Motivo agregado");
    await loadAll();
  }

  async function addProvincia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/config/provincias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: newProvincia, zona: newZona }),
    });
    const json = await response.json();
    if (!response.ok) {
      failure(json.error ?? "No se pudo agregar provincia");
      return;
    }
    setNewProvincia("");
    success("Provincia agregada");
    await loadAll();
  }

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Catálogos operativos, reglas de servicio y administración de accesos"
      />

      <div
        className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        role="tablist"
        aria-label="Secciones de configuración"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "GENERAL"}
          onClick={() => setActiveTab("GENERAL")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === "GENERAL"
              ? "bg-[#0f2544] text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          General
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "PLANTILLAS"}
          onClick={() => setActiveTab("PLANTILLAS")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === "PLANTILLAS"
              ? "bg-[#0f2544] text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Plantilla de Comunicación
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "USERS"}
          onClick={() => setActiveTab("USERS")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeTab === "USERS"
              ? "bg-[#0f2544] text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Usuarios
        </button>
      </div>

      {activeTab === "USERS" ? (
        <UserManagement />
      ) : activeTab === "PLANTILLAS" ? (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            {/* Panel de edición de plantilla */}
            <Panel title="Speech para Llamadas Telefónicas">
              <p className="mb-2 text-xs text-slate-500">
                Texto guía que verá el operador en la columna 3 del wizard para comunicarse vía llamada.
              </p>
              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                rows={7}
                className="w-full rounded-xl border border-slate-300 p-3 text-xs leading-relaxed text-slate-800 focus:border-blue-500 focus:outline-hidden font-mono"
                placeholder="Escribe el speech de llamada..."
              />
            </Panel>

            <Panel title="Plantilla para Mensajes de WhatsApp">
              <p className="mb-2 text-xs text-slate-500">
                Formato con negritas y emojis que se copiará directamente para enviar por WhatsApp.
              </p>
              <textarea
                value={whatsappText}
                onChange={(e) => setWhatsappText(e.target.value)}
                rows={7}
                className="w-full rounded-xl border border-slate-300 p-3 text-xs leading-relaxed text-slate-800 focus:border-blue-500 focus:outline-hidden font-mono"
                placeholder="Escribe el formato para WhatsApp..."
              />
            </Panel>

            {/* Panel de variables disponibles */}
            <Panel className="xl:col-span-2" title="Variables Dinámicas Disponibles">
              <p className="mb-3 text-xs text-slate-600">
                Puedes insertar cualquiera de estas etiquetas en tus textos. Se reemplazarán automáticamente con la información de cada cliente en el wizard:
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {variables.map((v) => (
                  <div
                    key={v.key}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-slate-700">{v.label}</span>
                    <code className="rounded bg-white px-2 py-0.5 font-mono font-bold text-blue-700 border border-slate-200">
                      {v.key}
                    </code>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveTemplate()}
                  disabled={savingTemplate}
                  className="rounded-xl bg-[#0f2544] px-5 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingTemplate ? "Guardando..." : "Guardar Plantillas"}
                </button>
              </div>
            </Panel>
          </div>

        </div>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="SLA de entrega">
              {sla ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setSla((previous) =>
                        previous
                          ? {
                              ...previous,
                              businessDays: Math.max(1, previous.businessDays - 1),
                            }
                          : previous,
                      )
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  >
                    -
                  </button>
                  <label className="ml-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Alerta previa
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={sla.warningBusinessDays}
                      onChange={(event) =>
                        setSla((previous) =>
                          previous
                            ? { ...previous, warningBusinessDays: Math.max(0, Number(event.target.value) || 0) }
                            : previous,
                        )
                      }
                      className="mt-1 block w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm font-normal text-slate-800"
                    />
                    <span className="mt-1 block normal-case">d\u00edas laborables</span>
                  </label>
                  <div className="rounded-xl bg-slate-50 px-6 py-3 text-center">
                    <p className="font-display text-4xl font-bold text-[#0f2544]">
                      {sla.businessDays}
                    </p>
                    <p className="text-xs text-slate-500">días laborables</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSla((previous) =>
                        previous
                          ? { ...previous, businessDays: previous.businessDays + 1 }
                          : previous,
                      )
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSla()}
                    className="ml-auto rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Guardar
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Cargando SLA...</p>
              )}
            </Panel>

            <Panel title="Exportación del consolidado">
              {exportConfig ? (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="consolidado-dispatch-date-from"
                      className="mb-1 block text-sm font-semibold text-slate-700"
                    >
                      Exportar desde fecha de despacho
                    </label>
                    <input
                      id="consolidado-dispatch-date-from"
                      type="date"
                      value={exportConfig.dispatchDateFrom?.slice(0, 10) ?? ""}
                      onChange={(event) =>
                        setExportConfig((previous) =>
                          previous
                            ? { ...previous, dispatchDateFrom: event.target.value || null }
                            : previous,
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Deja el campo vacío para exportar todas las tarjetas de débito, sin filtro de fecha.
                  </p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void saveExportConfig()}
                      className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Cargando configuración de exportación...</p>
              )}
            </Panel>

            <Panel title="Motivos de retorno">
              <form className="mb-3 flex gap-2" onSubmit={addMotivo}>
                <input
                  value={newMotivo}
                  onChange={(event) => setNewMotivo(event.target.value)}
                  placeholder="Nuevo motivo"
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
                  required
                />
                <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  Agregar
                </button>
              </form>
              <div className="max-h-44 space-y-2 overflow-y-auto">
                {motivos.map((motivo) => (
                  <div
                    key={motivo.id}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {motivo.nombre}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="xl:col-span-2" title="Provincias">
              <form
                className="mb-3 grid gap-2 md:grid-cols-[1fr_180px_auto]"
                onSubmit={addProvincia}
              >
                <input
                  value={newProvincia}
                  onChange={(event) => setNewProvincia(event.target.value)}
                  placeholder="Nombre provincia"
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  required
                />
                <select
                  value={newZona}
                  onChange={(event) => setNewZona(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option>Metro</option>
                  <option>Este</option>
                  <option>Norte</option>
                  <option>Sur</option>
                </select>
                <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  Agregar
                </button>
              </form>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {provincias.map((provincia) => (
                  <div
                    key={provincia.id}
                    className="rounded-xl border border-slate-200 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{provincia.nombre}</p>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          provincia.active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {provincia.active ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-500">Zona: {provincia.zona}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

        </>
      )}
    </div>
  );
}
