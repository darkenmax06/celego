import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupByConfig } from "@/components/filters/filter-bar";

/**
 * SDD card-groups — Stage C, Tasks C1/C3/C4 on `/tarjetas`.
 *
 * Covers the fan-out (a card in two groups appears in both buckets and stays
 * one selection), the "Sin grupo" bucket, the bucket-header copy with and
 * without a server total, and the scalar group-bys still producing exactly one
 * bucket per row.
 */
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

let capturedGroupByOptions: GroupByConfig[] = [];
let capturedOnFilterChange: ((next: Record<string, string>) => void) | null = null;

vi.mock("@/components/filters/filter-bar", () => ({
  FilterBar: (props: {
    groupByOptions: GroupByConfig[];
    onFilterChange: (next: Record<string, string>) => void;
  }) => {
    capturedGroupByOptions = props.groupByOptions;
    capturedOnFilterChange = props.onFilterChange;
    return <div data-testid="filter-bar" />;
  },
}));

vi.mock("@/components/cards/card-detail-modal", () => ({
  CardDetailModal: () => null,
}));

import TarjetasClient from "@/app/(protected)/tarjetas/tarjetas-client";

const fetchMock = vi.fn();

function buildCard(id: string, tc: string, groupIds: string[], provincia = "SANTIAGO") {
  return {
    id,
    tc,
    productType: "CREDITO",
    provincia,
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
    groupIds,
  };
}

const CARDS = [
  buildCard("card-1", "4000000000000001", ["group-1", "group-2"]),
  buildCard("card-2", "4000000000000002", ["group-1"], "AZUA"),
  buildCard("card-3", "4000000000000003", []),
];

/** `null` server totals means the group-by request never answers. */
let groupByTotals: { key: string; count: number }[] | null = [
  { key: "group-1", count: 7 },
  { key: "group-2", count: 3 },
  { key: "SIN_GRUPO", count: 5 },
];

beforeEach(() => {
  window.localStorage.clear();
  capturedGroupByOptions = [];
  capturedOnFilterChange = null;
  groupByTotals = [
    { key: "group-1", count: 7 },
    { key: "group-2", count: 3 },
    { key: "SIN_GRUPO", count: 5 },
  ];
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
    if (url.startsWith("/api/list-query/group-by")) {
      if (!groupByTotals) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ groups: groupByTotals }) };
    }
    return {
      ok: true,
      json: async () => ({
        cards: CARDS,
        pagination: { page: 1, pageSize: 50, total: 3, totalPages: 1 },
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

async function renderGroupedBy(groupBy: string) {
  render(<TarjetasClient role="ADMIN" />);
  await waitFor(() => expect(capturedOnFilterChange).not.toBeNull());
  await act(async () => {
    capturedOnFilterChange!({ groupBy });
  });
}

describe("TarjetasClient — group by Grupo", () => {
  it("offers Grupo as a group-by option", async () => {
    render(<TarjetasClient role="ADMIN" />);
    await waitFor(() => expect(capturedGroupByOptions.length).toBeGreaterThan(0));
    expect(capturedGroupByOptions.some((option) => option.field === "grupo")).toBe(true);
  });

  it("shows a card that belongs to two groups in both buckets, plus a Sin grupo bucket", async () => {
    await renderGroupedBy("grupo");

    await waitFor(() => expect(screen.getByText("Grupo A")).toBeInTheDocument());
    expect(screen.getByText("Grupo B")).toBeInTheDocument();
    expect(screen.getByText("Sin grupo")).toBeInTheDocument();

    // card-1 is in group-1 and group-2, so it renders once per bucket.
    expect(
      screen.getAllByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000003" }),
    ).toHaveLength(1);
  });

  it("keeps one selection for a card shown in two buckets", async () => {
    await renderGroupedBy("grupo");
    await waitFor(() =>
      expect(
        screen.getAllByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }),
      ).toHaveLength(2),
    );

    const boxes = screen.getAllByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" });
    fireEvent.click(boxes[0]);

    await waitFor(() => {
      for (const box of screen.getAllByRole("checkbox", {
        name: "Seleccionar tarjeta 4000000000000001",
      })) {
        expect(box).toBeChecked();
      }
    });
    expect(screen.getByText("1 seleccionadas")).toBeInTheDocument();
  });

  it("renders the fan-out note only while grouping by Grupo", async () => {
    await renderGroupedBy("grupo");
    await waitFor(() =>
      expect(screen.getByTestId("card-group-fanout-note")).toBeInTheDocument(),
    );

    await act(async () => {
      capturedOnFilterChange!({ groupBy: "provincia" });
    });
    await waitFor(() =>
      expect(screen.queryByTestId("card-group-fanout-note")).not.toBeInTheDocument(),
    );
  });

  it("renders the server total and the page count in the bucket header", async () => {
    await renderGroupedBy("grupo");

    await waitFor(() =>
      expect(screen.getByText("7 tarjetas · 2 en esta página")).toBeInTheDocument(),
    );
    expect(screen.getByText("3 tarjetas · 1 en esta página")).toBeInTheDocument();
    expect(screen.getByText("5 tarjetas · 1 en esta página")).toBeInTheDocument();
  });

  it("states only the page count when no server total is available", async () => {
    groupByTotals = null;
    await renderGroupedBy("grupo");

    await waitFor(() => expect(screen.getByText("Grupo A")).toBeInTheDocument());
    expect(screen.getByText("2 tarjetas")).toBeInTheDocument();
    expect(screen.queryByText(/en esta página/)).not.toBeInTheDocument();
  });
});

describe("TarjetasClient — scalar group-bys are unchanged", () => {
  it("puts every row in exactly one bucket and keeps the plain count copy", async () => {
    await renderGroupedBy("provincia");

    await waitFor(() => expect(screen.getAllByText("SANTIAGO").length).toBeGreaterThan(0));
    expect(screen.getAllByText("AZUA").length).toBeGreaterThan(0);
    expect(screen.getByText("2 tarjetas")).toBeInTheDocument();
    expect(screen.getByText("1 tarjeta")).toBeInTheDocument();
    expect(
      screen.getAllByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }),
    ).toHaveLength(1);
  });

  it("groups by status with a single bucket for identical rows", async () => {
    await renderGroupedBy("status");

    await waitFor(() => expect(screen.getByText("3 tarjetas")).toBeInTheDocument());
    expect(screen.queryByTestId("card-group-fanout-note")).not.toBeInTheDocument();
  });
});
