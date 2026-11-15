import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollPanel } from "@/components/mensajeros/payroll-panel";

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, blob: async () => new Blob(["jpg"]) };
}

const openPeriod = { id: "p1", label: "Quincena 1", fromDate: "2026-10-01", toDate: "2026-10-15", messengerId: null, status: "ABIERTO", pendingChanges: 0, report: null };
const payment = { id: "pay1", grossCents: 1000, deductionCents: 0, netCents: 1000, lockedAt: null, period: { id: "p1", label: "Quincena 1" }, installments: [] };

let fetchMock: ReturnType<typeof vi.fn>;
let periods: Array<Record<string, unknown>>;
let lockResponse: Record<string, unknown>;

beforeEach(() => {
  periods = [openPeriod];
  lockResponse = { status: "BLOQUEADO", report: { id: "rep-1", generatedAt: "2026-10-16T00:00:00.000Z" } };
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/mensajeros/periodos?")) return json({ periods });
    if (url === "/api/mensajeros/periodos" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      if (body.action === "LOCK") {
        periods = [{ ...openPeriod, status: "BLOQUEADO", report: lockResponse.report ?? null }];
        return json(lockResponse);
      }
      if (body.action === "REGENERATE_REPORT") return json({ status: "BLOQUEADO", report: { id: "rep-2", generatedAt: "x" } });
    }
    if (url.startsWith("/api/mensajeros/pagos")) return json({ payment });
    if (url.startsWith("/api/mensajeros/reportes/")) return json({});
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("PayrollPanel period report", () => {
  it("confirms the stored report after a lock", async () => {
    render(<PayrollPanel messengerId="m1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Bloquear" }));

    expect(await screen.findByText("Periodo bloqueado, pago cerrado y reporte guardado en el historial")).toHaveClass("text-emerald-700");
  });

  it("shows a warning when the lock succeeded but the report failed", async () => {
    lockResponse = { status: "BLOQUEADO", reportWarning: "El periodo quedo bloqueado, pero no se pudo generar el reporte." };
    render(<PayrollPanel messengerId="m1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Bloquear" }));

    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("no se pudo generar el reporte");
    expect(warning).toHaveClass("text-amber-800");
  });

  it("downloads the stored report of a locked period and can regenerate it", async () => {
    periods = [{ ...openPeriod, status: "BLOQUEADO", report: { id: "rep-1", generatedAt: "x" } }];
    render(<PayrollPanel messengerId="m1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver pago" }));

    fireEvent.click(await screen.findByRole("button", { name: "Descargar reporte" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/mensajeros/reportes/rep-1/imagen")).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/mensajeros/gestion-diaria"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Regenerar reporte" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/mensajeros/reportes/rep-2/imagen")).toBe(true));
    const regenerate = fetchMock.mock.calls.find(([, init]) => init?.body && String(init.body).includes("REGENERATE_REPORT"));
    expect(JSON.parse(String(regenerate![1].body))).toEqual({ action: "REGENERATE_REPORT", periodId: "p1", messengerId: "m1" });
  });

  it("only previews an open period without storing a report", async () => {
    render(<PayrollPanel messengerId="m1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver pago" }));
    fireEvent.click(await screen.findByRole("button", { name: "Vista previa del reporte (imagen)" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/mensajeros/reportes?mode=single"))).toBe(true),
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});
