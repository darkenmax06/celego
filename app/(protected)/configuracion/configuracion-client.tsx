"use client";

import { FormEvent, useEffect, useState } from "react";
import { UserManagement } from "@/components/config/user-management";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { usePersistentState } from "@/lib/use-persistent-state";

type SlaConfig = { id: string; businessDays: number };
type Motivo = { id: string; nombre: string; active: boolean };
type Provincia = { id: string; nombre: string; zona: string; active: boolean };

export default function ConfiguracionClient() {
  const [activeTab, setActiveTab] = usePersistentState<"GENERAL" | "USERS">(
    "config:active-tab",
    "GENERAL",
  );
  const [sla, setSla] = useState<SlaConfig | null>(null);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [newMotivo, setNewMotivo] = usePersistentState("config:new-return-reason", "");
  const [newProvincia, setNewProvincia] = usePersistentState("config:new-province", "");
  const [newZona, setNewZona] = usePersistentState("config:new-zone", "Metro");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAll() {
    const [slaRes, motivosRes, provinciasRes] = await Promise.all([
      fetch("/api/config/sla", { cache: "no-store" }),
      fetch("/api/config/motivos-retorno", { cache: "no-store" }),
      fetch("/api/config/provincias", { cache: "no-store" }),
    ]);
    const [slaJson, motivosJson, provinciasJson] = await Promise.all([
      slaRes.json(),
      motivosRes.json(),
      provinciasRes.json(),
    ]);
    setSla(slaJson.config ?? null);
    setMotivos(motivosJson.motivos ?? []);
    setProvincias(provinciasJson.provincias ?? []);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function success(value: string) {
    setMessage(value);
    setError("");
  }

  function failure(value: string) {
    setError(value);
    setMessage("");
  }

  async function saveSla() {
    if (!sla) return;
    const response = await fetch("/api/config/sla", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessDays: sla.businessDays }),
    });
    const json = await response.json();
    if (!response.ok) {
      failure(json.error ?? "No se pudo guardar SLA");
      return;
    }
    success("SLA actualizado");
    await loadAll();
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
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="SLA de entrega">
              {sla ? (
                <div className="flex items-center gap-3">
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

          {message ? (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
