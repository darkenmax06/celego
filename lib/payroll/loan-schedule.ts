export type LoanMode = "IGUALES" | "PERSONALIZADAS";

export type ScheduleInput = {
  principalCents: number;
  installmentCount: number;
  mode: LoanMode;
  /** Required for PERSONALIZADAS: one amount per installment, in order. */
  customAmountsCents?: number[];
};

export class LoanScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanScheduleError";
  }
}

/**
 * Splits a loan into installments.
 *
 * IGUALES spreads the principal evenly; the cents that do not divide exactly go
 * to the first installments so the plan always adds up to the principal.
 * PERSONALIZADAS takes the amounts as given and requires them to add up too.
 */
export function buildLoanSchedule(input: ScheduleInput): number[] {
  const { principalCents, installmentCount, mode } = input;
  if (!Number.isInteger(principalCents) || principalCents <= 0) {
    throw new LoanScheduleError("El monto del prestamo debe ser mayor que 0");
  }
  if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 120) {
    throw new LoanScheduleError("El numero de cuotas debe estar entre 1 y 120");
  }

  if (mode === "PERSONALIZADAS") {
    const amounts = input.customAmountsCents ?? [];
    if (amounts.length !== installmentCount) {
      throw new LoanScheduleError(`Se esperaban ${installmentCount} cuotas y se recibieron ${amounts.length}`);
    }
    if (amounts.some((amount) => !Number.isInteger(amount) || amount <= 0)) {
      throw new LoanScheduleError("Cada cuota debe ser mayor que 0");
    }
    const sum = amounts.reduce((total, amount) => total + amount, 0);
    if (sum !== principalCents) {
      throw new LoanScheduleError(`Las cuotas suman ${sum} centavos y el prestamo es de ${principalCents}`);
    }
    return amounts;
  }

  const base = Math.floor(principalCents / installmentCount);
  const remainder = principalCents - base * installmentCount;
  return Array.from({ length: installmentCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export type InstallmentLike = {
  number: number;
  plannedCents: number;
  appliedCents: number | null;
  status: "PENDIENTE" | "APLICADA" | "OMITIDA";
};

/** What is still owed: the principal minus every installment already applied. */
export function loanBalanceCents(principalCents: number, installments: InstallmentLike[]) {
  const paid = installments
    .filter((item) => item.status === "APLICADA")
    .reduce((total, item) => total + (item.appliedCents ?? item.plannedCents), 0);
  return Math.max(0, principalCents - paid);
}

/**
 * Amount that still has to be scheduled so the loan can finish: the balance minus
 * what the pending installments already cover. Greater than 0 after an
 * installment was omitted or lowered, in which case a new one must be appended.
 */
export function uncoveredCents(principalCents: number, installments: InstallmentLike[]) {
  const pending = installments
    .filter((item) => item.status === "PENDIENTE")
    .reduce((total, item) => total + item.plannedCents, 0);
  return Math.max(0, loanBalanceCents(principalCents, installments) - pending);
}

/** Installment a payment should take next: the lowest-numbered one still pending. */
export function nextPendingInstallment<T extends InstallmentLike>(installments: T[]): T | null {
  return [...installments].filter((item) => item.status === "PENDIENTE").sort((a, b) => a.number - b.number)[0] ?? null;
}
