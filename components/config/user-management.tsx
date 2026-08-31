"use client";

import { KeyRound, Plus, Search, ShieldCheck, UserRoundCog, X } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import toast from "react-hot-toast";
import { Panel } from "@/components/ui/panel";
import { usePersistentState } from "@/lib/use-persistent-state";

type UserRole = "ADMIN" | "OPERADOR" | "FACTURACION" | "MENSAJERO";
type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type AuditEvent = {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  result: string;
  details: unknown;
  actorEmail: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
  targetUser: { id: string; name: string; email: string } | null;
};

const roles: UserRole[] = ["ADMIN", "OPERADOR", "FACTURACION", "MENSAJERO"];

function roleLabel(role: UserRole) {
  return {
    ADMIN: "Administrador",
    OPERADOR: "Operador",
    FACTURACION: "Facturación",
    MENSAJERO: "Mensajero",
  }[role];
}

export function UserManagement() {
  const [query, setQuery] = usePersistentState("config:users:q", "");
  const [role, setRole] = usePersistentState("config:users:role", "ALL");
  const [active, setActive] = usePersistentState("config:users:active", "ALL");
  const [selectedId, setSelectedId] = usePersistentState<string | null>(
    "config:users:selected",
    null,
  );
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (deferredQuery.trim()) params.set("q", deferredQuery.trim());
    if (role !== "ALL") params.set("role", role);
    if (active !== "ALL") params.set("active", active);
    const response = await fetch(`/api/config/usuarios?${params}`, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(json?.error ?? "No se pudieron cargar los usuarios");
      setLoading(false);
      return;
    }
    setUsers(json.users ?? []);
    setCurrentUserId(json.currentUserId ?? "");
    setTotalPages(json.pagination?.totalPages ?? 1);
    setLoading(false);
  }, [active, deferredQuery, page, role]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, role, active]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedId) ?? null,
    [selectedId, users],
  );

  function showSuccess(value: string) {
    toast.success(value);
  }

  function showError(value: string) {
    toast.error(value);
  }

  async function saveUser(input: {
    id?: string;
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
    password?: string;
  }) {
    const response = await fetch("/api/config/usuarios", {
      method: input.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      showError(json?.error ?? "No se pudo guardar el usuario");
      return false;
    }
    setCreating(false);
    setSelectedId(json.user.id);
    showSuccess(input.id ? "Usuario actualizado" : "Usuario creado");
    await loadUsers();
    return true;
  }

  async function changePassword(userId: string, password: string) {
    const response = await fetch("/api/config/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, password }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      showError(json?.error ?? "No se pudo cambiar la contraseña");
      return false;
    }
    setPasswordOpen(false);
    showSuccess("Contraseña actualizada");
    return true;
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[240px] flex-1">
            <Search
              aria-hidden="true"
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o correo"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </label>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="ALL">Todos los roles</option>
            {roles.map((item) => (
              <option key={item} value={item}>
                {roleLabel(item)}
              </option>
            ))}
          </select>
          <select
            value={active}
            onChange={(event) => setActive(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="ALL">Todos los estados</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setSelectedId(null);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0f2544] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#17355d]"
          >
            <Plus size={17} />
            Nuevo usuario
          </button>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="Usuarios" subtitle="Selecciona una fila para administrar su acceso.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-3">Usuario</th>
                  <th className="pb-3">Rol</th>
                  <th className="pb-3">Estado</th>
                  <th className="pb-3">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => {
                      setCreating(false);
                      setSelectedId(user.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setCreating(false);
                        setSelectedId(user.id);
                      }
                    }}
                    tabIndex={0}
                    className={`cursor-pointer border-t transition ${
                      selectedId === user.id
                        ? "border-blue-200 bg-blue-50/70"
                        : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-900">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="py-3 pr-3">{roleLabel(user.role)}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          user.active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-slate-500">
                      {new Date(user.updatedAt).toLocaleDateString("es-DO")}
                    </td>
                  </tr>
                ))}
                {!loading && !users.length ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-500">
                      No hay usuarios para estos filtros.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-500">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          ) : null}
        </Panel>

        <aside className="xl:sticky xl:top-5 xl:self-start">
          {creating ? (
            <UserEditor
              mode="create"
              onClose={() => setCreating(false)}
              onSave={saveUser}
            />
          ) : selectedUser ? (
            <UserEditor
              mode="edit"
              user={selectedUser}
              isCurrentUser={selectedUser.id === currentUserId}
              onClose={() => setSelectedId(null)}
              onSave={saveUser}
              onPassword={() => setPasswordOpen(true)}
            />
          ) : (
            <Panel>
              <div className="py-10 text-center">
                <UserRoundCog
                  className="mx-auto text-slate-300"
                  size={42}
                  strokeWidth={1.4}
                />
                <p className="mt-3 font-semibold text-slate-800">Selecciona un usuario</p>
                <p className="mt-1 text-sm text-slate-500">
                  Aquí podrás editar su perfil, acceso y consultar actividad.
                </p>
              </div>
            </Panel>
          )}
        </aside>
      </div>

      {passwordOpen && selectedUser ? (
        <PasswordDialog
          user={selectedUser}
          onClose={() => setPasswordOpen(false)}
          onSave={changePassword}
        />
      ) : null}
    </div>
  );
}

function UserEditor({
  mode,
  user,
  isCurrentUser = false,
  onClose,
  onSave,
  onPassword,
}: {
  mode: "create" | "edit";
  user?: UserRow;
  isCurrentUser?: boolean;
  onClose: () => void;
  onSave: (input: {
    id?: string;
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
    password?: string;
  }) => Promise<boolean>;
  onPassword?: () => void;
}) {
  const [tab, setTab] = useState<"PROFILE" | "ACTIVITY">("PROFILE");
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "OPERADOR");
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onSave({
      id: user?.id,
      name,
      email,
      role,
      active,
      ...(mode === "create" ? { password } : {}),
    });
    setSaving(false);
  }

  return (
    <Panel>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-700">
            {mode === "create" ? "Alta de acceso" : "Administración de acceso"}
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-slate-900">
            {mode === "create" ? "Nuevo usuario" : user?.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          <X size={18} />
        </button>
      </div>

      {mode === "edit" ? (
        <div className="mb-4 flex border-b border-slate-200" role="tablist">
          <button
            type="button"
            onClick={() => setTab("PROFILE")}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "PROFILE"
                ? "border-[#0f2544] text-[#0f2544]"
                : "border-transparent text-slate-500"
            }`}
          >
            Perfil
          </button>
          <button
            type="button"
            onClick={() => setTab("ACTIVITY")}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "ACTIVITY"
                ? "border-[#0f2544] text-[#0f2544]"
                : "border-transparent text-slate-500"
            }`}
          >
            Actividad
          </button>
        </div>
      ) : null}

      {tab === "ACTIVITY" && user ? (
        <UserActivity userId={user.id} />
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Nombre">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              required
            />
          </Field>
          <Field label="Correo">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              required
            />
          </Field>
          <Field label="Rol">
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              disabled={isCurrentUser}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 disabled:bg-slate-100"
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {roleLabel(item)}
                </option>
              ))}
            </select>
          </Field>
          {mode === "create" ? (
            <Field label="Contraseña inicial">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                minLength={6}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                required
              />
            </Field>
          ) : null}
          <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3">
            <span>
              <span className="block text-sm font-semibold text-slate-800">Usuario activo</span>
              <span className="block text-xs text-slate-500">
                Permite iniciar sesión y utilizar sus módulos.
              </span>
            </span>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              disabled={isCurrentUser}
              className="h-4 w-4"
            />
          </label>

          {mode === "edit" ? (
            <button
              type="button"
              onClick={onPassword}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <KeyRound size={17} />
              Cambiar contraseña
            </button>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f2544] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <ShieldCheck size={17} />
            {saving ? "Guardando..." : mode === "create" ? "Crear usuario" : "Guardar cambios"}
          </button>
        </form>
      )}
    </Panel>
  );
}

function UserActivity({ userId }: { userId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [result, setResult] = useState("ALL");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (result !== "ALL") params.set("result", result);
      if (action.trim()) params.set("action", action.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`/api/config/usuarios/${userId}/actividad?${params}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => null);
      setEvents(response.ok ? (json.events ?? []) : []);
      setLoading(false);
    })();
  }, [action, from, result, to, userId]);

  return (
    <div>
      <div className="mb-3 grid gap-2">
        <select
          value={result}
          onChange={(event) => setResult(event.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="ALL">Todos los resultados</option>
          <option value="SUCCESS">Exitosos</option>
          <option value="FAILURE">Fallidos</option>
          <option value="DENIED">Denegados</option>
        </select>
        <input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="Filtrar por acción exacta"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            aria-label="Actividad desde"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-label="Actividad hasta"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {events.map((event) => (
          <article key={event.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {event.entity} · {event.action}
              </p>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  event.result === "SUCCESS"
                    ? "bg-emerald-100 text-emerald-700"
                    : event.result === "DENIED"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-700"
                }`}
              >
                {event.result}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(event.createdAt).toLocaleString("es-DO")}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Actor: {event.user?.name ?? event.actorEmail ?? "Sistema"}
            </p>
          </article>
        ))}
        {!loading && !events.length ? (
          <p className="py-8 text-center text-sm text-slate-500">No hay actividad registrada.</p>
        ) : null}
      </div>
    </div>
  );
}

function PasswordDialog({
  user,
  onClose,
  onSave,
}: {
  user: UserRow;
  onClose: () => void;
  onSave: (userId: string, password: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = password.length >= 6 && password === confirmPassword;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          setSaving(true);
          await onSave(user.id, password);
          setSaving(false);
        }}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Cambiar contraseña</h2>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength={6}
            placeholder="Nueva contraseña"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
            autoFocus
          />
          <input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            minLength={6}
            placeholder="Confirmar contraseña"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Actualizar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
