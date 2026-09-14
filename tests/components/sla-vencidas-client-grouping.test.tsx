import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups — Stage C on `/sla-vencidas`: fan-out across buckets, the
 * "Sin grupo" bucket, honest bucket headers built from the server totals, and
 * the scalar group-bys still producing exactly one bucket per row.
 */
let capturedOnFilterChange: ((next: Record<string, string>) => void) | null = null;
let capturedGroupByOptions: { field: string; label: string }[] = [];

vi.mock("@/components/filters/filter-bar", () => ({
  FilterBar: (props: {
    groupByOptions: { field: string; label: string }[];
    onFilterChange: (next: Record<string, string>) => void;
  }) => {
    capturedGroupByOptions = props.groupByOptions;
    capturedOnFilterChange = props.onFilterChange;
    return <div data-testid="filter-bar" />;
  },
}));

vi.mock("@/components/operativo/operative-contact-wizard", () => ({
  OperativeContactWizard: () => null,
}));

import SlaVencidasClient from "@/app/(protected)/sla-vencidas/sla-vencidas-client";

const fetchMock = vi.fn();

function buildRow(id: string, tc: string, groupIds: string[], provincia = "SANTIAGO") {
  return {
    id,
    tc,
    status: "EN_RUTA",
    slaDueDate: null,
    dispatchDate: null,
    provincia,
    zona: "Norte",
    tipoTarjeta: "CREDITO",
    adicional: false,
    adicionalNumero: 0,
    nombre: "Cliente Test",
    cedula: "001-0000000-0",
    direccion: "Calle 1",
    telefonos: "8090000000",
    mensajero: "Mensajero X",
    mensajeroId: "m-1",
    diasVencidos: 4,
    groupIds,
  };
}

const ROWS = [
  buildRow("card-1", "4000000000000001", ["group-1", "group-2"]),
  buildRow("card-2", "4000000000000002", ["group-1"], "AZUA"),
  buildRow("card-3", "4000000000000003", []),
];

beforeEach(() => {
  window.localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:stub");
  URL.revokeObjectURL = vi.fn();
  capturedOnFilterChange = null;
  capturedGroupByOptions = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/card-groups")) {
      return {
        ok: true,
        json: async () => ({
          groups: [
            { id: "group-1", name: "Grupo A", _count: { members: 2 } },
            { id: "group-2", name: "Grupo B", _count: { members: 1 } },
          ],
        }),
      };
    }
    if (url.startsWith("/api/config/provincias")) {
      return { ok: true, json: async () => ({ provincias: [] }) };
    }
    if (url.startsWith("/api/list-query/group-by")) {
      return {
        ok: true,
        json: async () => ({
          groups: [
            { key: "group-1", count: 9 },
            { key: "group-2", count: 2 },
            { key: "SIN_GRUPO", count: 6 },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        filters: { messengerId: "ALL" },
        messengers: [],
        total: ROWS.length,
        rows: ROWS,
        pagination: { page: 1, pageSize: 100, total: ROWS.length, totalPages: 1 },
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

async function renderGroupedBy(groupBy: string) {
  render(<SlaVencidasClient role="ADMIN" />);
  await waitFor(() => expect(capturedOnFilterChange).not.toBeNull());
  await act(async () => {
    capturedOnFilterChange!({ groupBy });
  });
}

describe("SlaVencidasClient — group by Grupo", () => {
  it("offers Grupo as a group-by option", async () => {
    render(<SlaVencidasClient role="ADMIN" />);
    await waitFor(() => expect(capturedGroupByOptions.length).toBeGreaterThan(0));
    expect(capturedGroupByOptions.some((option) => option.field === "grupo")).toBe(true);
  });

  it("shows a multi-group row in every bucket and adds Sin grupo", async () => {
    await renderGroupedBy("grupo");

    await waitFor(() => expect(screen.getByText("Grupo A")).toBeInTheDocument());
    expect(screen.getByText("Grupo B")).toBeInTheDocument();
    expect(screen.getByText("Sin grupo")).toBeInTheDocument();
    expect(
      screen.getAllByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }),
    ).toHaveLength(2);
  });

  it("keeps one selection for a row shown in two buckets", async () => {
    await renderGroupedBy("grupo");
    await waitFor(() =>
      expect(
        screen.getAllByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }),
      ).toHaveLength(2),
    );

    fireEvent.click(
      screen.getAllByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" })[1],
    );

    await waitFor(() => {
      for (const box of screen.getAllByRole("checkbox", {
        name: "Seleccionar tarjeta 4000000000000001",
      })) {
        expect(box).toBeChecked();
      }
    });
    expect(screen.getByText("1 seleccionadas")).toBeInTheDocument();
  });

  it("renders the server total next to the page count and the fan-out note", async () => {
    await renderGroupedBy("grupo");

    await waitFor(() =>
      expect(screen.getByText("9 tarjetas · 2 en esta página")).toBeInTheDocument(),
    );
    expect(screen.getByText("2 tarjetas · 1 en esta página")).toBeInTheDocument();
    expect(screen.getByText("6 tarjetas · 1 en esta página")).toBeInTheDocument();
    expect(screen.getByTestId("card-group-fanout-note")).toBeInTheDocument();
  });
});

describe("SlaVencidasClient — scalar group-bys are unchanged", () => {
  it("puts every row in exactly one bucket with the plain count copy", async () => {
    await renderGroupedBy("provincia");

    await waitFor(() => expect(screen.getAllByText("SANTIAGO").length).toBeGreaterThan(0));
    expect(
      screen.getAllByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }),
    ).toHaveLength(1);
    expect(screen.getByText("2 tarjetas")).toBeInTheDocument();
    expect(screen.getByText("1 tarjeta")).toBeInTheDocument();
    expect(screen.queryByTestId("card-group-fanout-note")).not.toBeInTheDocument();
  });

  it("groups by mensajero exactly as before", async () => {
    await renderGroupedBy("messengerId");

    await waitFor(() => expect(screen.getByText("3 tarjetas")).toBeInTheDocument());
    expect(screen.getAllByText("Mensajero X").length).toBeGreaterThan(0);
  });
});
