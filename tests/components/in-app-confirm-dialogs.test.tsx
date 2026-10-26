import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecountDeliveries } from "@/components/config/recount-deliveries";
import { GeneralPeriods } from "@/components/mensajeros/general-periods";
import { LoansPanel } from "@/components/mensajeros/loans-panel";
import { PayrollPanel } from "@/components/mensajeros/payroll-panel";
import { BizcochitosPanel } from "@/components/status-digitales/bizcochitos-panel";

let fetchMock: ReturnType<typeof vi.fn>;
let nativeConfirm: ReturnType<typeof vi.spyOn>;

function json(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: new Headers(),
    json: async () => body,
    blob: async () => new Blob(),
  };
}

const generalPeriod = { id: "g1", label: "Quincena 1", fromDate: "2026-10-01", toDate: "2026-10-15", messengerId: null, lockedCount: 0 };
const lockedPeriod = { ...generalPeriod, id: "p1", messengerId: "m1", status: "BLOQUEADO", pendingChanges: 0 };
const activeLoan = {
  id: "l1",
  principalCents: 100000,
  installmentCount: 1,
  mode: "IGUALES",
  status: "ACTIVO",
  note: null,
  createdAt: "2026-10-01",
  balanceCents: 100000,
  installments: [],
};

function mutations() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== "GET");
}

beforeEach(() => {
  vi.clearAllMocks();
  nativeConfirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") return json({ locked: 3, cardsChecked: 0, daysTouched: 0, updated: 0, pendingLocked: 0, unchanged: 0 });
    if (url.includes("/api/mensajeros/periodos?messengerId")) return json({ periods: [lockedPeriod] });
    if (url.includes("/api/mensajeros/periodos")) return json({ periods: [generalPeriod] });
    if (url.includes("/api/mensajeros/prestamos")) return json({ loans: [activeLoan] });
    if (url.includes("/api/status-digitales/bizcochitos")) {
      return json({ pendingCount: 4, latest: null, batches: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } });
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

async function expectDialogFlow({
  trigger,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancelar",
}: {
  trigger: () => Promise<HTMLElement>;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
}) {
  fireEvent.click(await trigger());
  const dialog = await screen.findByRole("alertdialog", { name: title });
  expect(dialog).toHaveTextContent(message);
  fireEvent.click(within(dialog).getByRole("button", { name: cancelLabel }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(mutations()).toHaveLength(0);

  fireEvent.click(await trigger());
  const again = await screen.findByRole("alertdialog", { name: title });
  fireEvent.click(within(again).getByRole("button", { name: confirmLabel }));
  await waitFor(() => expect(mutations()).toHaveLength(1));
  expect(nativeConfirm).not.toHaveBeenCalled();
}

describe("in-app confirmation dialogs replace window.confirm", () => {
  it("general periods: locking all messengers", async () => {
    render(<GeneralPeriods />);
    await expectDialogFlow({
      trigger: () => screen.findByRole("button", { name: "Bloquear a todos" }),
      title: "Bloquear periodo",
      message: 'Bloquear "Quincena 1" cierra el pago de todos los mensajeros activos. ¿Continuar?',
      confirmLabel: "Bloquear",
    });
    expect(mutations()[0][1]).toMatchObject({ method: "PATCH" });
  });

  it("general periods: deleting a period", async () => {
    render(<GeneralPeriods />);
    await expectDialogFlow({
      trigger: () => screen.findByRole("button", { name: "Eliminar" }),
      title: "Eliminar periodo",
      message: '¿Eliminar el periodo "Quincena 1"?',
      confirmLabel: "Eliminar",
    });
    expect(mutations()[0][1]).toMatchObject({ method: "DELETE" });
  });

  it("loans: cancelling an active loan", async () => {
    render(<LoansPanel messengerId="m1" />);
    await expectDialogFlow({
      trigger: () => screen.findByRole("button", { name: "Cancelar prestamo" }),
      title: "Cancelar préstamo",
      message: "Cancelar el préstamo elimina las cuotas que faltan. Las ya aplicadas se conservan. ¿Continuar?",
      confirmLabel: "Cancelar préstamo",
      cancelLabel: "Volver",
    });
    expect(JSON.parse(mutations()[0][1].body)).toEqual({ action: "CANCEL", loanId: "l1" });
  });

  it("payroll: unlocking a locked period", async () => {
    render(<PayrollPanel messengerId="m1" />);
    await expectDialogFlow({
      trigger: () => screen.findByRole("button", { name: "Desbloquear" }),
      title: "Desbloquear periodo",
      message: "Desbloquear permite editar los días y las cuotas de este periodo. Debe volver a bloquearlo al terminar. ¿Continuar?",
      confirmLabel: "Desbloquear",
    });
    expect(JSON.parse(mutations()[0][1].body)).toMatchObject({ action: "UNLOCK", periodId: "p1" });
  });

  it("bizcochitos: generating a batch", async () => {
    render(<BizcochitosPanel />);
    await expectDialogFlow({
      trigger: async () => {
        const button = await screen.findByRole("button", { name: /Generar bizcochito/ });
        await waitFor(() => expect(button).toBeEnabled());
        return button;
      },
      title: "Generar Bizcochito",
      message: "Se generará un Bizcochito con 4 entrega(s) digital(es) pendiente(s). ¿Continuar?",
      confirmLabel: "Generar",
    });
    expect(mutations()[0][1]).toMatchObject({ method: "POST" });
  });

  it("recount deliveries: recalculating the count", async () => {
    const { container } = render(<RecountDeliveries />);
    const [from, to] = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    fireEvent.change(from, { target: { value: "2026-10-01" } });
    fireEvent.change(to, { target: { value: "2026-10-15" } });
    await expectDialogFlow({
      trigger: async () => screen.getByRole("button", { name: "Recalcular conteo" }),
      title: "Recalcular conteo",
      message:
        "Se recalculará el conteo de entregas de todos los mensajeros del 2026-10-01 al 2026-10-15. Los periodos bloqueados no se modifican: sus cambios quedan pendientes. ¿Continuar?",
      confirmLabel: "Recalcular",
    });
    expect(mutations()[0][1]).toMatchObject({ method: "POST" });
  });
});
