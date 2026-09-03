import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContratoPendienteWizard,
  type ContratoPendienteCard,
} from "@/components/cards/contrato-pendiente-wizard";

/**
 * SDD contrato-tarjetas-pistoleo — Phase 6 (task 6.5).
 *
 * Both resolution flows of the pending-contract wizard, in isolation.
 */

function digitalCard(overrides: Partial<ContratoPendienteCard> = {}): ContratoPendienteCard {
  return {
    id: "card-1",
    tc: "4000000000000001",
    status: "ENTREGA_DIGITAL_SIN_CONTRATO",
    provincia: "Santo Domingo",
    contractImageAt: null,
    customer: { nombre: "Cliente Prueba", cedula: "00100000001", telefonosRaw: "8095551234" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ card: {} }) })),
  );
  vi.stubGlobal("open", vi.fn());
});

describe("ContratoPendienteWizard — ENTREGA_DIGITAL_SIN_CONTRATO", () => {
  it("uploads the contract image and resolves via SUBIR_CONTRATO", async () => {
    const onResolved = vi.fn();
    render(<ContratoPendienteWizard card={digitalCard()} onClose={vi.fn()} onResolved={onResolved} />);

    const file = new File(["x"], "4000000000000001 (C).jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/seleccionar archivo/i, { selector: "input" }) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /registrar imagen de contrato/i }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));

    expect(fetch).toHaveBeenCalledWith(
      "/api/contratos-pendientes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          cardId: "card-1",
          action: "SUBIR_CONTRATO",
          fileName: "4000000000000001 (C).jpg",
        }),
      }),
    );
  });

  it("shows an error and does not resolve when no file is selected", async () => {
    const onResolved = vi.fn();
    render(<ContratoPendienteWizard card={digitalCard()} onClose={vi.fn()} onResolved={onResolved} />);

    const button = screen.getByRole("button", { name: /registrar imagen de contrato/i });
    expect(button).toBeDisabled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});

describe("ContratoPendienteWizard — ENTREGA_SIN_CONTRATO", () => {
  it("marks the card delivered, opens the print export, and resolves", async () => {
    const onResolved = vi.fn();
    const card = digitalCard({ id: "card-2", status: "ENTREGA_SIN_CONTRATO" });
    render(<ContratoPendienteWizard card={card} onClose={vi.fn()} onResolved={onResolved} />);

    fireEvent.click(screen.getByRole("button", { name: /marcar como entregada/i }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));

    expect(fetch).toHaveBeenCalledWith(
      "/api/contratos-pendientes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ cardId: "card-2", action: "MARCAR_ENTREGADO" }),
      }),
    );
    expect(window.open).toHaveBeenCalledWith(
      "/api/rutas/export?cardId=card-2&format=pdf",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
