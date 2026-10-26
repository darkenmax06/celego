"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrencyDOP, toCents } from "@/lib/money";
import { buildLoanSchedule, LoanScheduleError } from "@/lib/payroll/loan-schedule";

type Installment = {
  id: string;
  number: number;
  plannedCents: number;
  appliedCents: number | null;
  status: "PENDIENTE" | "APLICADA" | "OMITIDA";
  paymentId: string | null;
};

type Loan = {
  id: string;
  principalCents: number;
  installmentCount: number;
  mode: "IGUALES" | "PERSONALIZADAS";
  status: "ACTIVO" | "PAGADO" | "CANCELADO";
  note: string | null;
  createdAt: string;
  balanceCents: number;
  installments: Installment[];
};

const STATUS_STYLE: Record<Loan["status"], string> = {
  ACTIVO: "bg-blue-100 text-blue-700",
  PAGADO: "bg-emerald-100 text-emerald-700",
  CANCELADO: "bg-slate-200 text-slate-600",
};

const INSTALLMENT_LABEL: Record<Installment["status"], string> = {
  PENDIENTE: "Pendiente",
  APLICADA: "Aplicada",
  OMITIDA: "Omitida",
};

/** Loans of one messenger: create them, choose how they are split, follow the balance. */
export function LoansPanel({ messengerId }: { messengerId: string }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState("4");
  const [mode, setMode] = useState<"IGUALES" | "PERSONALIZADAS">("IGUALES");
  const [custom, setCustom] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loanToCancel, setLoanToCancel] = useState<Loan | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/mensajeros/prestamos?messengerId=${messengerId}`, { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setLoans(json.loans ?? []);
  }, [messengerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const principalCents = toCents(Number(amount) || 0);
  const installmentCount = Math.max(0, Math.trunc(Number(count) || 0));
  const customCents = useMemo(
    () => Array.from({ length: installmentCount }, (_, index) => toCents(Number(custom[index]) || 0)),
    [custom, installmentCount],
  );

  const preview = useMemo(() => {
    if (principalCents <= 0 || installmentCount < 1) return { plan: null as number[] | null, error: "" };
    try {
      return { plan: buildLoanSchedule({ principalCents, installmentCount, mode, customAmountsCents: customCents }), error: "" };
    } catch (error) {
      return { plan: null, error: error instanceof LoanScheduleError ? error.message : "Revise los datos" };
    }
  }, [principalCents, installmentCount, mode, customCents]);

  const customSum = customCents.reduce((total, value) => total + value, 0);

  async function createLoan() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/mensajeros/prestamos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messengerId,
        principalCents,
        installmentCount,
        mode,
        customAmountsCents: mode === "PERSONALIZADAS" ? customCents : undefined,
        note: note || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo crear el prestamo");
      return;
    }
    setAmount("");
    setNote("");
    setCustom([]);
    setMessage("Prestamo creado");
    await load();
  }

  async function patch(body: Record<string, unknown>, okMessage: string) {
    const res = await fetch("/api/mensajeros/prestamos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMessage(res.ok ? okMessage : (json.error ?? "No se pudo actualizar"));
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-900">Nuevo prestamo</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Monto (RD$)
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Cuotas
            <input type="number" min="1" max="120" value={count} onChange={(e) => setCount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Forma de pago
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="IGUALES">Cuotas iguales</option>
              <option value="PERSONALIZADAS">Cuotas personalizadas</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Nota
            <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>

        {mode === "PERSONALIZADAS" && installmentCount > 0 ? (
          <div className="mt-3">
            <p className="mb-2 text-xs text-slate-500">
              Defina cada cuota. Suman {formatCurrencyDOP(customSum)} de {formatCurrencyDOP(principalCents)}
              {customSum !== principalCents && principalCents > 0 ? ` (faltan ${formatCurrencyDOP(principalCents - customSum)})` : ""}.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: installmentCount }, (_, index) => (
                <label key={index} className="text-[11px] font-semibold text-slate-500">
                  Cuota {index + 1}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={custom[index] ?? ""}
                    onChange={(e) => setCustom((current) => Object.assign([...current], { [index]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {mode === "IGUALES" && preview.plan ? (
          <p className="mt-3 text-xs text-slate-500">
            {preview.plan.length} cuotas: {[...new Set(preview.plan)].map((value) => formatCurrencyDOP(value)).join(" / ")}
          </p>
        ) : null}
        {preview.error && principalCents > 0 && mode === "PERSONALIZADAS" && customSum > 0 ? <p className="mt-2 text-xs text-amber-700">{preview.error}</p> : null}

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void createLoan()}
            disabled={busy || !preview.plan}
            className="rounded-xl bg-[#0f2544] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Guardando..." : "Crear prestamo"}
          </button>
          {message ? <span className="text-xs text-slate-600">{message}</span> : null}
        </div>
      </div>

      {!loans.length ? <p className="text-sm text-slate-500">Este mensajero no tiene prestamos.</p> : null}

      {loans.map((loan) => (
        <article key={loan.id} className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {formatCurrencyDOP(loan.principalCents)}{" "}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[loan.status]}`}>{loan.status}</span>
              </p>
              <p className="text-xs text-slate-500">
                Saldo pendiente {formatCurrencyDOP(loan.balanceCents)} · {loan.mode === "IGUALES" ? "cuotas iguales" : "cuotas personalizadas"}
                {loan.note ? ` · ${loan.note}` : ""}
              </p>
            </div>
            {loan.status === "ACTIVO" ? (
              <button
                onClick={() => setLoanToCancel(loan)}
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700"
              >
                Cancelar prestamo
              </button>
            ) : null}
          </div>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1">Cuota</th>
                <th>Plan</th>
                <th>Descontado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loan.installments.map((item) => {
                const editable = loan.status === "ACTIVO" && item.status === "PENDIENTE" && !item.paymentId;
                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="py-1.5">#{item.number}</td>
                    <td>
                      {editable ? (
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          defaultValue={(item.plannedCents / 100).toFixed(2)}
                          onBlur={(e) => {
                            const cents = toCents(Number(e.target.value) || 0);
                            if (cents > 0 && cents !== item.plannedCents) void patch({ action: "SET_PLANNED", installmentId: item.id, plannedCents: cents }, "Cuota actualizada");
                          }}
                          className="w-28 rounded border border-slate-300 px-2 py-1"
                        />
                      ) : (
                        formatCurrencyDOP(item.plannedCents)
                      )}
                    </td>
                    <td>{item.status === "APLICADA" ? formatCurrencyDOP(item.appliedCents ?? item.plannedCents) : "-"}</td>
                    <td>
                      {INSTALLMENT_LABEL[item.status]}
                      {item.paymentId && item.status === "PENDIENTE" ? " (en el pago actual)" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      ))}

      <ConfirmDialog
        open={loanToCancel !== null}
        title="Cancelar préstamo"
        message="Cancelar el préstamo elimina las cuotas que faltan. Las ya aplicadas se conservan. ¿Continuar?"
        confirmLabel="Cancelar préstamo"
        cancelLabel="Volver"
        onCancel={() => setLoanToCancel(null)}
        onConfirm={() => {
          if (!loanToCancel) return;
          setLoanToCancel(null);
          void patch({ action: "CANCEL", loanId: loanToCancel.id }, "Prestamo cancelado");
        }}
      />
    </div>
  );
}
