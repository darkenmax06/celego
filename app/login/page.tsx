"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);

  // Set by /logout when a stale session (deleted/inactive user) was cleared.
  useEffect(() => {
    setExpired(new URLSearchParams(window.location.search).get("expired") === "1");
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError("Credenciales invalidas");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_20%_20%,#dbeafe_0%,#f5f5f3_45%,#f5f5f3_100%)] px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="font-display text-3xl font-bold text-[#0f2544]">Celego</h1>
        <p className="mt-2 text-sm text-slate-500">Sistema de gestion de mensajeria de tarjetas</p>

        {expired ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Tu sesion expiro o tu usuario ya no esta disponible. Inicia sesion nuevamente.
          </p>
        ) : null}

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Correo</label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none transition focus:border-[#0f2544]"
              placeholder="admin@celego.local"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Contrasena</label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none transition focus:border-[#0f2544]"
              placeholder="********"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-[#0f2544] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#12315c] disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Iniciar sesion"}
          </button>
        </form>
      </section>
    </main>
  );
}
