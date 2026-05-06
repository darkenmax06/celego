"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

type SlaConfig = { id: string; businessDays: number };
type Motivo = { id: string; nombre: string; active: boolean };
type Provincia = { id: string; nombre: string; zona: string; active: boolean };
type Usuario = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OPERADOR" | "FACTURACION" | "MENSAJERO";
  active: boolean;
  createdAt: string;
};

export default function ConfiguracionClient() {
  const [sla, setSla] = useState<SlaConfig | null>(null);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [users, setUsers] = useState<Usuario[]>([]);
  const [newMotivo, setNewMotivo] = useState("");
  const [newProvincia, setNewProvincia] = useState("");
  const [newZona, setNewZona] = useState("Metro");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<Usuario["role"]>("OPERADOR");
  const [message, setMessage] = useState("");

  async function loadAll() {
    const [slaRes, motivosRes, provinciasRes, usersRes] = await Promise.all([
      fetch("/api/config/sla", { cache: "no-store" }),
      fetch("/api/config/motivos-retorno", { cache: "no-store" }),
      fetch("/api/config/provincias", { cache: "no-store" }),
      fetch("/api/config/usuarios", { cache: "no-store" }),
    ]);

    const [slaJson, motivosJson, provinciasJson, usersJson] = await Promise.all([
      slaRes.json(),
      motivosRes.json(),
      provinciasRes.json(),
      usersRes.json(),
    ]);

    setSla(slaJson.config ?? null);
    setMotivos(motivosJson.motivos ?? []);
    setProvincias(provinciasJson.provincias ?? []);
    setUsers(usersJson.users ?? []);
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

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await fetch("/api/config/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo crear usuario");
      return;
    }

    setNewUserName("");
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserRole("OPERADOR");
    setMessage("Usuario creado");
    await loadAll();
  }

  async function toggleUserActive(user: Usuario) {
    const res = await fetch("/api/config/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: user.id,
        active: !user.active,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo actualizar usuario");
      return;
    }

    setMessage(user.active ? "Usuario desactivado" : "Usuario activado");
    setUsers((prev) =>
      prev.map((item) => (item.id === user.id ? { ...item, active: !item.active } : item)),
    );
  }

  async function resetUserPassword(user: Usuario) {
    const password = window.prompt(`Nueva contrasena para ${user.email} (minimo 6 caracteres):`);
    if (!password) return;

    const res = await fetch("/api/config/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: user.id,
        password,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "No se pudo actualizar contrasena");
      return;
    }

    setMessage("Contrasena actualizada");
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

        <Panel className="xl:col-span-2" title="Usuarios y accesos">
          <form className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_180px_1fr_auto]" onSubmit={addUser}>
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Nombre"
              className="rounded-xl border border-slate-300 px-3 py-2"
              required
            />
            <input
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              placeholder="Correo"
              type="email"
              className="rounded-xl border border-slate-300 px-3 py-2"
              required
            />
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as Usuario["role"])}
              className="rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="ADMIN">ADMIN</option>
              <option value="OPERADOR">OPERADOR</option>
              <option value="FACTURACION">FACTURACION</option>
              <option value="MENSAJERO">MENSAJERO</option>
            </select>
            <input
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              placeholder="Contrasena inicial"
              type="password"
              minLength={6}
              className="rounded-xl border border-slate-300 px-3 py-2"
              required
            />
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Crear</button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Correo</th>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{user.name}</td>
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.role}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          user.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleUserActive(user)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          {user.active ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetUserPassword(user)}
                          className="rounded-md bg-[#0f2544] px-2 py-1 text-xs font-semibold text-white"
                        >
                          Cambiar contrasena
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-5 text-center text-sm text-slate-500">
                      No hay usuarios registrados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
