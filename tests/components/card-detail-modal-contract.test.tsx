import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardDetailModal } from "@/components/cards/card-detail-modal";

/**
 * SDD contrato-tarjetas-pistoleo — Phase 6 (task 6.5).
 *
 * Toggling `hasContract` from the card-detail modal must save the field
 * without auto-resolving the card's ENTREGA_DIGITAL_SIN_CONTRATO exception
 * status (spec scenario "Toggle after exception status reached").
 */

function baseCardPayload() {
  return {
    id: "card-1",
    tc: "4000000000000001",
    requestNumber: null,
    productType: "CREDITO",
    externalReference: null,
    zona: "Zona 1",
    provincia: "Santo Domingo",
    isRemote: false,
    dispatchDate: null,
    dispatchOrigin: "TORRE_POPULAR",
    deliveryType: null,
    emissionType: null,
    supplier: null,
    contractType: null,
    hasContract: true,
    contractImageAt: null,
    status: "ENTREGA_DIGITAL_SIN_CONTRATO",
    reassignedProvince: null,
    reassignedZone: null,
    reassignedAt: null,
    isAdditional: false,
    additionalIndex: 0,
    urgent: false,
    slaDueDate: null,
    returnReason: null,
    metadata: {},
    customer: { nombre: "Cliente Prueba", cedula: "00100000001", direccionRaw: null, telefonosRaw: null },
    currentMessenger: null,
    reassignedMessenger: null,
    deliveryReassignments: [],
    logs: [],
    contacts: [],
    activeUrgentCase: null,
  };
}

beforeEach(() => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/tarjetas/card-1")) {
      return { ok: true, json: async () => ({ card: baseCardPayload() }) } as Response;
    }
    if (url.startsWith("/api/config/motivos-retorno")) {
      return { ok: true, json: async () => ({ motivos: [] }) } as Response;
    }
    if (url.startsWith("/api/config/provincias")) {
      return { ok: true, json: async () => ({ provincias: [] }) } as Response;
    }
    if (url === "/api/tarjetas" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return {
        ok: true,
        json: async () => ({ card: { ...baseCardPayload(), ...body } }),
      } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("CardDetailModal — hasContract toggle", () => {
  it("saves hasContract without resolving ENTREGA_DIGITAL_SIN_CONTRATO", async () => {
    render(<CardDetailModal cardId="card-1" onClose={vi.fn()} onUpdated={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Cambiar Status")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Cambiar Status"));

    const checkbox = await screen.findByLabelText(/tarjeta requiere contrato/i);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByText("Guardar cambio"));

    await waitFor(() => {
      const patchCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => call[0] === "/api/tarjetas" && (call[1] as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(String((patchCall![1] as RequestInit).body));
      expect(body.hasContract).toBe(false);
      expect(body.status).toBe("ENTREGA_DIGITAL_SIN_CONTRATO");
    });
  });
});
