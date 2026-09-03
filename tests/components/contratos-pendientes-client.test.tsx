import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContratosPendientesClient from "@/app/(protected)/contratos-pendientes/contratos-pendientes-client";

/**
 * SDD contrato-tarjetas-pistoleo — Phase 6 (task 6.5).
 *
 * Search + collapsible status filter list for the pending-contract module.
 */

function pendingCard(overrides: Record<string, unknown> = {}) {
  return {
    id: "card-1",
    tc: "4000000000000001",
    status: "ENTREGA_DIGITAL_SIN_CONTRATO",
    provincia: "Santo Domingo",
    contractImageAt: null,
    customer: { nombre: "Cliente Uno", cedula: "00100000001", telefonosRaw: "8095551234" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ cards: [pendingCard()] }) })),
  );
});

describe("ContratosPendientesClient", () => {
  it("renders the pending list with client info", async () => {
    render(<ContratosPendientesClient />);

    await waitFor(() => expect(screen.getByText("4000000000000001")).toBeInTheDocument());
    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
    expect(screen.getByText("00100000001")).toBeInTheDocument();
  });

  it("shows an empty state instead of an error when no cards are pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ cards: [] }) })),
    );

    render(<ContratosPendientesClient />);

    await waitFor(() =>
      expect(screen.getByText(/no hay tarjetas pendientes de contrato/i)).toBeInTheDocument(),
    );
  });

  it("re-queries with the selected status filter", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ cards: [] }) }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ContratosPendientesClient />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText(/filtros/i));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ENTREGA_SIN_CONTRATO" } });

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown[][];
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toContain("status=ENTREGA_SIN_CONTRATO");
    });
  });
});
