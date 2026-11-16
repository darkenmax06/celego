import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import { SECTION_STORAGE_KEY } from "@/components/cards/card-detail/card-info-tab";

function cardPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "card-1",
    tc: "5400019569638970",
    requestNumber: null,
    productType: "CREDITO",
    externalReference: "REF-1",
    zona: "Zona 1",
    provincia: "Santo Domingo",
    isRemote: true,
    dispatchDate: new Date(2026, 10, 10).toISOString(),
    dispatchOrigin: "TORRE_POPULAR",
    deliveryType: "Domicilio",
    emissionType: "Nueva",
    supplier: "Suplidor X",
    contractType: "Estandar",
    hasContract: true,
    contractImageAt: null,
    status: "EN_RUTA",
    reassignedProvince: null,
    reassignedZone: null,
    reassignedAt: null,
    isAdditional: true,
    additionalIndex: 1,
    urgent: true,
    slaDueDate: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
    returnReason: null,
    metadata: { operativo: { contactado: true, canalContacto: "WHATSAPP" } },
    customer: {
      nombre: "Cliente Prueba",
      cedula: "00100000001",
      direccionRaw: "Calle 1 | Sector 2",
      telefonosRaw: "8095551234",
    },
    currentMessenger: { nombre: "Pedro" },
    reassignedMessenger: { id: "m-2", nombre: "Juan" },
    deliveryReassignments: [],
    logs: [],
    contacts: [],
    activeUrgentCase: { id: "u-1", level: 4, nextNotificationAt: null, lastNotifiedAt: null },
    ...overrides,
  };
}

function mockFetch(card: ReturnType<typeof cardPayload>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/tarjetas/card-1")) return { ok: true, json: async () => ({ card }) } as Response;
      if (url.startsWith("/api/config/motivos-retorno")) return { ok: true, json: async () => ({ motivos: [] }) } as Response;
      if (url.startsWith("/api/config/provincias")) return { ok: true, json: async () => ({ provincias: [] }) } as Response;
      return { ok: true, json: async () => ({}) } as Response;
    }),
  );
}

async function renderModal(card = cardPayload()) {
  mockFetch(card);
  render(<CardDetailModal cardId="card-1" onClose={vi.fn()} />);
  await screen.findByText("Cliente Prueba");
}

function sectionButton(name: string) {
  return screen.getByRole("button", { name });
}

function expandAll() {
  for (const name of ["Datos de la tarjeta", "Despacho y logística", "SLA y urgencia"]) {
    const button = sectionButton(name);
    if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
  }
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("CardDetailModal — Informacion tab", () => {
  it("shows the card type in the header subtitle", async () => {
    await renderModal();
    expect(screen.getByText("TC 5400019569638970")).toBeInTheDocument();
    expect(screen.getByText("· Adicional #1")).toBeInTheDocument();
  });

  it("omits the additional hint for principal cards", async () => {
    await renderModal(cardPayload({ isAdditional: false, additionalIndex: 0 }));
    expect(screen.queryByText(/· Adicional/)).not.toBeInTheDocument();
  });

  it("renders the four summary tiles", async () => {
    await renderModal();
    const strip = screen.getByRole("list", { name: "Resumen de la tarjeta" });
    const tiles = within(strip).getAllByRole("listitem");
    expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual(["SLA", "Mensajero", "Contacto", "Despacho"]);

    const sla = within(strip).getByRole("listitem", { name: "SLA" });
    expect(within(sla).getByText(/^Vencida hace \d+ días?$/)).toHaveClass("text-rose-700");
    expect(within(sla).getByText("Urgente N4")).toBeInTheDocument();

    const messenger = within(strip).getByRole("listitem", { name: "Mensajero" });
    expect(within(messenger).getByText("Juan")).toBeInTheDocument();
    expect(within(messenger).getByText("reasignado")).toBeInTheDocument();

    const contact = within(strip).getByRole("listitem", { name: "Contacto" });
    expect(within(contact).getByText("Contactada")).toBeInTheDocument();
    expect(within(contact).getByText("WhatsApp")).toBeInTheDocument();

    const dispatch = within(strip).getByRole("listitem", { name: "Despacho" });
    expect(within(dispatch).getByText(new Date(2026, 10, 10).toLocaleDateString("es-DO"))).toBeInTheDocument();
    expect(within(dispatch).getByText("Torre Popular")).toBeInTheDocument();
  });

  it("shows only the SLA date for closed cards and 'Sin asignar' without messenger", async () => {
    const due = new Date(2026, 10, 1);
    await renderModal(
      cardPayload({ status: "ENTREGADA", slaDueDate: due.toISOString(), currentMessenger: null, reassignedMessenger: null }),
    );
    const sla = screen.getByRole("listitem", { name: "SLA" });
    expect(within(sla).getByText(due.toLocaleDateString("es-DO"))).not.toHaveClass("text-rose-700");
    expect(within(sla).queryByText(/Vencida/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Mensajero" })).getByText("Sin asignar")).toBeInTheDocument();
  });

  it("opens client and contact sections by default and toggles with aria-expanded", async () => {
    await renderModal();
    expect(sectionButton("Cliente y dirección")).toHaveAttribute("aria-expanded", "true");
    expect(sectionButton("Gestión de contacto")).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Datos de la tarjeta", "Despacho y logística", "SLA y urgencia"]) {
      expect(sectionButton(name)).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.getByRole("button", { name: /Abrir Asistente de Contacto/ })).toBeInTheDocument();

    const button = sectionButton("Datos de la tarjeta");
    const panel = document.getElementById(button.getAttribute("aria-controls")!);
    expect(panel).not.toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
    expect(within(panel!).getByText("Adicional #1")).toBeInTheDocument();

    fireEvent.click(sectionButton("Cliente y dirección"));
    expect(sectionButton("Cliente y dirección")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Cédula")).not.toBeInTheDocument();
  });

  it("remembers section state in localStorage", async () => {
    await renderModal();
    fireEvent.click(sectionButton("SLA y urgencia"));
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(`celego:workspace:v1:${SECTION_STORAGE_KEY}`) ?? "{}");
      expect(stored.value?.sla).toBe(true);
    });
  });

  it("restores the stored section state", async () => {
    window.localStorage.setItem(
      `celego:workspace:v1:${SECTION_STORAGE_KEY}`,
      JSON.stringify({ version: 1, value: { cliente: false, tarjeta: true, despacho: false, sla: false, contacto: true } }),
    );
    await renderModal();
    await waitFor(() => expect(sectionButton("Datos de la tarjeta")).toHaveAttribute("aria-expanded", "true"));
    expect(sectionButton("Cliente y dirección")).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps every field of the former flat layout", async () => {
    await renderModal();
    expandAll();
    // Old flat-grid label -> new label (see field checklist).
    const labels = [
      "Cédula", // Cedula
      "Provincia", // Provincia original
      "Zona", // Zona original + Zona remota (flag)
      "Dirección completa",
      "Teléfonos registrados",
      "Tipo", // Tipo tarjeta + No. adicional
      "Tipo de emisión",
      "Contrato",
      "Referencia", // Referencia + Referencias chips
      "Fecha de despacho",
      "Origen de despacho",
      "Suplidor",
      "Tipo de entrega",
      "Mensajero",
      "Mensajero reasignado",
      "Provincia de reasignación",
      "Zona facturable",
      "Fecha SLA",
      "Urgente",
      "Nivel de urgencia",
      "Estado de contacto",
      "Canal efectivo",
      "Fecha preferencia",
      "Última gestión",
    ];
    for (const label of labels) {
      expect(screen.getAllByText(label, { selector: "dt, span" }).length, label).toBeGreaterThan(0);
    }
    expect(screen.getByText("Remota")).toBeInTheDocument();
    expect(screen.getByText("Calle 1")).toBeInTheDocument();
    expect(screen.getByText("Sector 2")).toBeInTheDocument();
    expect(screen.getByText("8095551234")).toBeInTheDocument();
    expect(screen.getByText("Nivel 4 (Muy urgente)")).toBeInTheDocument();
    expect(screen.getByText("Suplidor X")).toBeInTheDocument();
  });

  it("shows an em dash for empty values", async () => {
    await renderModal(cardPayload({ supplier: null, contractType: "  " }));
    expandAll();
    const supplier = screen.getByText("Suplidor").closest("div")!;
    expect(within(supplier).getByText("—")).toBeInTheDocument();
    const contract = screen.getByText("Contrato").closest("div")!;
    expect(within(contract).getByText("—")).toBeInTheDocument();
  });
});
