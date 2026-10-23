import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FacturacionClient from "@/app/(protected)/facturacion/facturacion-client";

vi.mock("@/lib/use-persistent-state", () => ({
  usePersistentState: (_key: string, initial: unknown) => [...React.useState(initial), true],
}));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      return { ok: true, json: async () => ({ zone: { ...body, id: "saved" } }) };
    }
    if (url.includes("tarifas")) return { ok: true, json: async () => ({ zones: [{ id: "credit", productType: "CREDITO", zona: "Metro", baseCents: 100, active: true, ranges: [] }] }) };
    return { ok: true, json: async () => ({ rows: [], totalUsdCents: 0, totalDopCents: 0 }) };
  });
});

describe("billing tariff tabs", () => {
  it("preserves independent drafts across switching and saves only the selected product", async () => {
    render(<FacturacionClient />);
    await waitFor(() => expect(screen.getAllByLabelText("Tarifa base (USD)").length).toBe(10));
    const creditPanel = screen.getByRole("tabpanel");
    const creditInput = within(creditPanel).getAllByLabelText("Tarifa base (USD)")[0];
    fireEvent.change(creditInput, { target: { value: "1.23" } });
    fireEvent.click(screen.getByRole("tab", { name: "Débito" }));
    const debitPanel = screen.getByRole("tabpanel");
    const debitInput = within(debitPanel).getAllByLabelText("Tarifa base (USD)")[0];
    expect((debitInput as HTMLInputElement).value).toBe("");
    expect((within(debitPanel).getAllByRole("button", { name: "Guardar zona" })[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(debitInput, { target: { value: "2.34" } });
    fireEvent.click(screen.getByRole("tab", { name: "Crédito" }));
    expect((creditInput as HTMLInputElement).value).toBe("1.23");
    fireEvent.click(screen.getByRole("tab", { name: "Débito" }));
    expect((debitInput as HTMLInputElement).value).toBe("2.34");
    fireEvent.click(within(debitPanel).getAllByRole("button", { name: "Guardar zona" })[0]);
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
    const [, options] = fetchMock.mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(JSON.parse(options.body)).toMatchObject({ productType: "DEBITO", zona: "Metro", baseCents: 234 });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("débito"));
    fireEvent.click(screen.getByRole("tab", { name: "Crédito" }));
    expect((creditInput as HTMLInputElement).value).toBe("1.23");
  });

  it("supports keyboard tab navigation and displays missing-rate errors instead of a zero invoice total", async () => {
    fetchMock.mockImplementation(async (url: string) => url.includes("tarifas")
      ? { ok: true, json: async () => ({ zones: [] }) }
      : { ok: false, json: async () => ({ error: "Configura una tarifa activa de débito" }) });
    render(<FacturacionClient />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("débito"));
    const creditTab = screen.getByRole("tab", { name: "Crédito" });
    creditTab.focus();
    fireEvent.keyDown(creditTab, { key: "ArrowRight" });
    const debitTab = screen.getByRole("tab", { name: "Débito" });
    expect(debitTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(debitTab);
  });
});
