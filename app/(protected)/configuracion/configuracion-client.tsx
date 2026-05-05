"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

type SlaConfig = { id: string; businessDays: number };
type Motivo = { id: string; nombre: string; active: boolean };
type Provincia = { id: string; nombre: string; zona: string; active: boolean };

export default function ConfiguracionClient() {
  const [sla, setSla] = useState<SlaConfig | null>(null);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [newMotivo, setNewMotivo] = useState("");
  const [newProvincia, setNewProvincia] = useState("");
  const [newZona, setNewZona] = useState("Metro");
  const [message, setMessage] = useState("");

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

  async function saveSla() {
    if (!sla) return;
    const res = await fetch("/api/config/sla", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessDays: sla.businessDays }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo guardar SLA");
      return;
    }

    setMessage("SLA actualizado");
    await loadAll();
  }

  async function addMotivo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch("/api/config/motivos-retorno", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: newMotivo }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo agregar motivo");
      return;
    }

    setNewMotivo("");
    setMessage("Motivo agregado");
    await loadAll();
  }

  async function addProvincia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch("/api/config/provincias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: newProvincia, zona: newZona }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo agregar provincia");
      return;
    }

    setNewProvincia("");
    setMessage("Provincia agregada");
    await loadAll();
  }

  return (
    <div>
      <PageHeader title="Configuracion" subtitle="SLA, motivos de retorno y provincias del sistema" />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="SLA de entrega">
          {sla ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSla((prev) => (prev ? { ...prev, businessDays: Math.max(1, prev.businessDays - 1) } : prev))}
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                -
              </button>
              <div className="rounded-xl bg-slate-50 px-6 py-3 text-center">
                <p className="font-display text-4xl font-bold text-[#0f2544]">{sla.businessDays}</p>
                <p className="text-xs text-slate-500">dias laborables</p>
              </div>
              <button
                onClick={() => setSla((prev) => (prev ? { ...prev, businessDays: prev.businessDays + 1 } : prev))}
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                +
              </button>
              <button onClick={() => void saveSla()} className="ml-auto rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white">
                Guardar
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Cargando SLA...</p>
          )}
        </Panel>

        <Panel title="Motivos de retorno">
          <form className="mb-3 flex gap-2" onSubmit={addMotivo}>
            <input value={newMotivo} onChange={(e) => setNewMotivo(e.target.value)} placeholder="Nuevo motivo" className="flex-1 rounded-xl border border-slate-300 px-3 py-2" required />
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Agregar</button>
          </form>
          <div className="max-h-44 space-y-2 overflow-y-auto">
            {motivos.map((motivo) => (
              <div key={motivo.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {motivo.nombre}
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="xl:col-span-2" title="Provincias">
          <form className="mb-3 grid gap-2 md:grid-cols-[1fr_180px_auto]" onSubmit={addProvincia}>
            <input value={newProvincia} onChange={(e) => setNewProvincia(e.target.value)} placeholder="Nombre provincia" className="rounded-xl border border-slate-300 px-3 py-2" required />
            <select value={newZona} onChange={(e) => setNewZona(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2">
              <option>Metro</option>
              <option>Este</option>
              <option>Norte</option>
              <option>Sur</option>
            </select>
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Agregar</button>
          </form>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {provincias.map((provincia) => (
              <div key={provincia.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold">{provincia.nombre}</p>
                <p className="text-slate-500">Zona: {provincia.zona}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
