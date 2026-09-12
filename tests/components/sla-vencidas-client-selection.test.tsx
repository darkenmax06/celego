import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stage B, Task B1. RED against `sla-vencidas-client.tsx` before wiring:
 * a leading checkbox column (header select-all for the current page plus one
 * per row), the shared `CardSelectionBar`, the `CardGroupAssignModal`, and an
 * off-filter count read from the resource-generic endpoint with
 * `resource: "sla-vencidas"`.
 *
 * The checkbox column must not be counted as an exportable column, and every
 * `colSpan` in the table must grow with it — otherwise the grouped-header and
 * empty-state rows stop spanning the full width.
 */
vi.mock("@/components/filters/filter-bar", () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}));

vi.mock("@/components/operativo/operative-contact-wizard", () => ({
  OperativeContactWizard: () => null,
}));

import SlaVencidasClient from "@/app/(protected)/sla-vencidas/sla-vencidas-client";

const fetchMock = vi.fn();

function buildRow(id: string, tc: string) {
  return {
    id,
    tc,
    status: "EN_RUTA",
    slaDueDate: null,
    dispatchDate: null,
    provincia: "SANTIAGO",
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
    groupIds: [],
  };
}

function stubFetch(rows: ReturnType<typeof buildRow>[]) {
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
    if (url.startsWith("/api/sla-vencidas/export-list")) {
      return { ok: true, blob: async () => new Blob(["col"]) };
    }
    if (url.startsWith("/api/list-query/off-filter-count")) {
      return { ok: true, json: async () => ({ resource: "sla-vencidas", offFilterCount: 3 }) };
    }
    return {
      ok: true,
      json: async () => ({
        filters: { messengerId: "ALL" },
        messengers: [],
        total: rows.length,
        rows,
        pagination: { page: 1, pageSize: 100, total: rows.length, totalPages: 1 },
      }),
    };
  });
}

beforeEach(() => {
  window.localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:stub");
  URL.revokeObjectURL = vi.fn();
  fetchMock.mockReset();
  stubFetch([buildRow("card-1", "4000000000000001"), buildRow("card-2", "4000000000000002")]);
  vi.stubGlobal("fetch", fetchMock);
});

describe("SlaVencidasClient — card-groups selection wiring (ADMIN)", () => {
  it("renders a leading header checkbox and one per-row checkbox", async () => {
    render(<SlaVencidasClient role="ADMIN" />);

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar todas en esta página" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }),
    ).toBeInTheDocument();
  });

  it("selects only the current page's rows from the header checkbox and shows the bar", async () => {
    render(<SlaVencidasClient role="ADMIN" />);
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));

    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas en esta página" }));

    await waitFor(() => expect(screen.getByText("2 seleccionadas")).toBeInTheDocument());
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000002" }),
    ).toBeChecked();
  });

  it("opens the assign modal and reads the off-filter count for resource sla-vencidas", async () => {
    render(<SlaVencidasClient role="ADMIN" />);
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));

    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas en esta página" }));
    await waitFor(() => expect(screen.getByText("2 seleccionadas")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Asignar a grupo existente" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/list-query/off-filter-count",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/list-query/off-filter-count",
    )!;
    expect(JSON.parse((call[1] as { body: string }).body)).toMatchObject({
      resource: "sla-vencidas",
      cardIds: ["card-1", "card-2"],
    });
  });

  it("grows every colSpan so the checkbox column does not shorten the empty-state row", async () => {
    stubFetch([]);

    render(<SlaVencidasClient role="ADMIN" />);

    await waitFor(() =>
      expect(screen.getByText(/No hay tarjetas SLA vencidas/)).toBeInTheDocument(),
    );
    const cell = screen.getByText(/No hay tarjetas SLA vencidas/).closest("td")!;
    // 10 default visible column groups + 1 for the checkbox column.
    expect(cell.getAttribute("colspan")).toBe("11");
  });

  it("keeps the checkbox column out of the exportable column set", async () => {
    render(<SlaVencidasClient role="ADMIN" />);
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));

    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url === "/api/sla-vencidas/export-list"),
      ).toBe(true),
    );
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/sla-vencidas/export-list",
    )!;
    const columns = JSON.parse((call[1] as { body: string }).body).columns as string[];
    expect(columns).not.toContain("select");
    expect(columns).toContain("nombre");
  });
});

describe("SlaVencidasClient — role gating", () => {
  it("renders no selection checkboxes for a role that cannot manage groups", async () => {
    render(<SlaVencidasClient role="FACTURACION" />);
    await waitFor(() => expect(screen.getAllByText("Cliente Test").length).toBeGreaterThan(0));

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
