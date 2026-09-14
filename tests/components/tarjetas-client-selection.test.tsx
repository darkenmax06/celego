import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FacetConfig } from "@/components/filters/filter-bar";

/**
 * SDD card-groups — Work Unit G, Task 21. RED against `tarjetas-client.tsx`
 * before wiring: leading th/td checkbox in the list view (current-page-only
 * select-all), a cards-view header checkbox, `colSpan + 2` at both empty-state
 * spots, a "Grupo" facet sourced from `useCardGroups()`, and bar/checkbox
 * column rendering only for ADMIN/OPERADOR.
 */
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

let capturedFacets: FacetConfig[] = [];
let capturedOnViewChange: ((view: string) => void) | null = null;

vi.mock("@/components/filters/filter-bar", () => ({
  FilterBar: (props: {
    facets: FacetConfig[];
    currentView: string;
    onViewChange: (view: string) => void;
  }) => {
    capturedFacets = props.facets;
    capturedOnViewChange = props.onViewChange;
    return <div data-testid="filter-bar" />;
  },
}));

vi.mock("@/components/cards/card-detail-modal", () => ({
  CardDetailModal: () => null,
}));

import TarjetasClient from "@/app/(protected)/tarjetas/tarjetas-client";

const fetchMock = vi.fn();

function buildCard(id: string, tc: string) {
  return {
    id,
    tc,
    productType: "CREDITO",
    provincia: "SANTIAGO",
    zona: "Norte",
    isRemote: false,
    isAdditional: false,
    additionalIndex: 0,
    status: "EN_RUTA",
    urgent: false,
    dispatchOrigin: "TORRE_POPULAR",
    dispatchDate: null,
    customer: { nombre: "Cliente Test", cedula: "001-0000000-0" },
    currentMessenger: null,
    activeUrgentCase: null,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  capturedFacets = [];
  capturedOnViewChange = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/card-groups")) {
      return {
        ok: true,
        json: async () => ({
          groups: [
            { id: "group-1", name: "Grupo A", _count: { members: 2 } },
            { id: "group-2", name: "Grupo B", _count: { members: 0 } },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        cards: [buildCard("card-1", "4000000000000001"), buildCard("card-2", "4000000000000002")],
        pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("TarjetasClient — card-groups selection wiring (ADMIN)", () => {
  it("renders a leading header checkbox and one per-row checkbox in list view", async () => {
    render(<TarjetasClient role="ADMIN" />);

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));
    expect(screen.getByRole("checkbox", { name: "Seleccionar todas en esta página" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" })).toBeInTheDocument();
  });

  it("selects only the current page's cards when the header checkbox is clicked", async () => {
    render(<TarjetasClient role="ADMIN" />);
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));

    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas en esta página" }));

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000002" })).toBeChecked();
    });
    expect(screen.getByText("2 seleccionadas")).toBeInTheDocument();
  });

  it("exposes a Grupo facet sourced from useCardGroups, including Sin grupo", async () => {
    render(<TarjetasClient role="ADMIN" />);

    await waitFor(() => expect(capturedFacets.some((f) => f.field === "grupo")).toBe(true));
    const grupoFacet = capturedFacets.find((f) => f.field === "grupo")!;
    expect(grupoFacet.multi).toBe(true);
    expect(grupoFacet.options).toEqual(
      expect.arrayContaining([
        { label: "Grupo A", value: "group-1" },
        { label: "Grupo B", value: "group-2" },
        { label: "Sin grupo", value: "SIN_GRUPO" },
      ]),
    );
  });

  it("sets colSpan to visibleColumns.length + 2 on the empty-state row", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/card-groups")) {
        return { ok: true, json: async () => ({ groups: [] }) };
      }
      return {
        ok: true,
        json: async () => ({ cards: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } }),
      };
    });

    render(<TarjetasClient role="ADMIN" />);

    await waitFor(() => expect(screen.getByText(/No hay tarjetas/)).toBeInTheDocument());
    const cell = screen.getByText(/No hay tarjetas/).closest("td")!;
    expect(cell.getAttribute("colspan")).toBe("16");
  });

  it("shows a checkbox on each card in the cards view", async () => {
    render(<TarjetasClient role="ADMIN" />);
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));

    capturedOnViewChange!("cards");

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" })).toBeInTheDocument(),
    );
  });
});

describe("TarjetasClient — role gating", () => {
  it("renders no selection checkboxes or bar for a non-ADMIN/OPERADOR role", async () => {
    render(<TarjetasClient role="FACTURACION" />);
    await waitFor(() => expect(screen.getAllByText("Cliente Test").length).toBeGreaterThan(0));

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
