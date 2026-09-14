import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stage B, Tasks B2 and B5. RED against `operativo-client.tsx` before wiring.
 *
 * `/operativo` renders cards as a `<div>` grid rather than table rows, so the
 * checkbox sits in the card header beside the identity that is already shown.
 *
 * This screen CANNOT answer the off-filter-count question — the route
 * hand-builds `where` across three tab branches and filters rows in memory
 * before slicing — so the modal must receive the explicit "undeterminable"
 * state, never a fabricated 0 and never a permanently-loading `null`.
 *
 * The `urgentes` tab can emit synthetic rows with `cardId: null` (an urgent
 * case with no linked card). Those have no card to assign, so they must not
 * offer a checkbox at all.
 */
vi.mock("@/components/filters/filter-bar", () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}));

vi.mock("@/components/operativo/operative-contact-wizard", () => ({
  OperativeContactWizard: () => null,
}));

vi.mock("@/components/operativo/sla-extension-requests-table", () => ({
  SLAExtensionRequestsTable: () => null,
}));

import OperativoClient from "@/app/(protected)/operativo/operativo-client";

const fetchMock = vi.fn();

function buildCard(id: string, tc: string, cardId: string | null = id) {
  return {
    id,
    cardId,
    tc,
    nombre: "Cliente Test",
    cedula: "001-0000000-0",
    provincia: "SANTIAGO",
    zona: "Norte",
    status: "EN_RUTA",
    direcciones: [],
    refs: [],
    telefonos: [{ num: "8090000000", principal: true, funciona: false, comentario: "" }],
    groupIds: [],
  };
}

function stubFetch(cards: ReturnType<typeof buildCard>[]) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/card-groups")) {
      return {
        ok: true,
        json: async () => ({
          groups: [{ id: "group-1", name: "Grupo A", _count: { members: 2 } }],
        }),
      };
    }
    if (url.startsWith("/api/config/provincias")) {
      return { ok: true, json: async () => ({ provincias: [] }) };
    }
    if (url.startsWith("/api/operativo/urgencias")) {
      return { ok: true, json: async () => ({ notifications: [] }) };
    }
    return {
      ok: true,
      json: async () => ({
        cards,
        pagination: { page: 1, pageSize: 50, total: cards.length, totalPages: 1 },
      }),
    };
  });
}

function contactoCalls(): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.startsWith("/api/operativo/contacto"));
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  stubFetch([buildCard("card-1", "4000000000000001"), buildCard("card-2", "4000000000000002")]);
  vi.stubGlobal("fetch", fetchMock);
});

describe("OperativoClient — card-groups selection wiring (ADMIN)", () => {
  it("renders one selection checkbox per card in the grid", async () => {
    render(<OperativoClient role="ADMIN" />);

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("shows the selection bar once a card is selected", async () => {
    render(<OperativoClient role="ADMIN" />);
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));

    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }));

    await waitFor(() => expect(screen.getByText("1 seleccionadas")).toBeInTheDocument());
  });

  it("tells the operator the off-filter count is undeterminable instead of showing a zero", async () => {
    render(<OperativoClient role="ADMIN" />);
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));

    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }));
    await waitFor(() => expect(screen.getByText("1 seleccionadas")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Asignar a grupo existente" }));

    await waitFor(() =>
      expect(screen.getByText(/esta vista no puede determinar/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/calculando/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 de las/)).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("off-filter-count")),
    ).toBe(false);
  });

  it("offers no checkbox for an urgent row that has no linked card", async () => {
    stubFetch([buildCard("urgent-1", "4000000000000003", null)]);

    render(<OperativoClient role="ADMIN" />);

    await waitFor(() => expect(screen.getAllByText("Cliente Test").length).toBeGreaterThan(0));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("OperativoClient — role gating", () => {
  it("renders no selection checkboxes for a role that cannot manage groups", async () => {
    render(<OperativoClient role="FACTURACION" />);
    await waitFor(() => expect(screen.getAllByText("Cliente Test").length).toBeGreaterThan(0));

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("OperativoClient — page-size selector (Task B5)", () => {
  it("offers no page size above the descriptor cap of 100", async () => {
    render(<OperativoClient role="ADMIN" />);

    const select = await screen.findByRole("combobox", { name: "Tarjetas por página" });
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(values).toEqual(["25", "50", "100"]);
  });

  it("refetches with the chosen page size and resets to page 1", async () => {
    render(<OperativoClient role="ADMIN" />);
    const select = await screen.findByRole("combobox", { name: "Tarjetas por página" });

    fireEvent.change(select, { target: { value: "100" } });

    await waitFor(() =>
      expect(
        contactoCalls().some((url) => url.includes("pageSize=100")),
      ).toBe(true),
    );
    const last = contactoCalls().at(-1)!;
    expect(last).toContain("page=1");
  });
});
