import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups — Stage C on `/operativo`.
 *
 * This screen gets NO server totals: `app/api/operativo/contacto/route.ts`
 * hand-builds `where` across three tab branches and filters rows in memory, so
 * no honest per-group total exists. The bucket headers state only the page
 * count and the note says so.
 *
 * The wizard keeps walking the FLAT page array: fan-out changes rendering, not
 * the `cards` array, so clicking a repeated card in any bucket opens that same
 * card and the index/total counter stays coherent.
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
  OperativeContactWizard: (props: { card: { tc: string }; index: number; total: number }) => (
    <div data-testid="wizard">
      {`${props.card.tc}|${props.index}|${props.total}`}
    </div>
  ),
}));

vi.mock("@/components/operativo/sla-extension-requests-table", () => ({
  SLAExtensionRequestsTable: () => null,
}));

import OperativoClient from "@/app/(protected)/operativo/operativo-client";

const fetchMock = vi.fn();

function buildCard(
  id: string,
  tc: string,
  groupIds: string[],
  cardId: string | null = id,
) {
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
    groupIds,
  };
}

const CARDS = [
  buildCard("card-1", "4000000000000001", ["group-1", "group-2"]),
  buildCard("card-2", "4000000000000002", []),
  // `urgentes` synthesizes rows with no linked card and no memberships.
  buildCard("urgent-1", "4000000000000003", [], null),
];

beforeEach(() => {
  window.localStorage.clear();
  capturedOnFilterChange = null;
  capturedGroupByOptions = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/card-groups")) {
      return {
        ok: true,
        json: async () => ({
          groups: [
            { id: "group-1", name: "Grupo A", _count: { members: 1 } },
            { id: "group-2", name: "Grupo B", _count: { members: 1 } },
          ],
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
        cards: CARDS,
        pagination: { page: 1, pageSize: 50, total: CARDS.length, totalPages: 1 },
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

async function renderGroupedBy(groupBy: string) {
  render(<OperativoClient role="ADMIN" />);
  await waitFor(() => expect(capturedOnFilterChange).not.toBeNull());
  await act(async () => {
    capturedOnFilterChange!({ groupBy });
  });
}

describe("OperativoClient — group by Grupo", () => {
  it("offers Grupo as a group-by option", async () => {
    render(<OperativoClient role="ADMIN" />);
    await waitFor(() => expect(capturedGroupByOptions.length).toBeGreaterThan(0));
    expect(capturedGroupByOptions.some((option) => option.field === "grupo")).toBe(true);
  });

  it("fans a multi-group card out and buckets card-less rows under Sin grupo", async () => {
    await renderGroupedBy("grupo");

    await waitFor(() => expect(screen.getByText("Grupo A")).toBeInTheDocument());
    expect(screen.getByText("Grupo B")).toBeInTheDocument();
    expect(screen.getByText("Sin grupo")).toBeInTheDocument();

    expect(screen.getAllByText("4000000000000001")).toHaveLength(2);
    // The synthetic `cardId: null` row is still rendered, under "Sin grupo".
    expect(screen.getAllByText("4000000000000003")).toHaveLength(1);
  });

  it("states page-scoped counts and asks the server for no totals", async () => {
    await renderGroupedBy("grupo");

    await waitFor(() =>
      expect(screen.getByTestId("card-group-fanout-note")).toHaveTextContent(
        /solo a las tarjetas de esta página/,
      ),
    );
    expect(screen.getAllByText("1 tarjeta").length).toBeGreaterThan(0);
    expect(screen.queryByText(/en esta página\b/)).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).startsWith("/api/list-query/group-by")),
    ).toBe(false);
  });

  it("opens the right card and keeps a coherent counter when clicked from the second bucket", async () => {
    await renderGroupedBy("grupo");
    await waitFor(() => expect(screen.getAllByText("4000000000000001")).toHaveLength(2));

    const secondOccurrence = screen.getAllByText("4000000000000001")[1];
    fireEvent.click(secondOccurrence.closest("[class*='cursor-pointer']")!);

    await waitFor(() =>
      // index 0 of the flat page array of 3, not a bucket-relative index.
      expect(screen.getByTestId("wizard")).toHaveTextContent("4000000000000001|0|3"),
    );
  });
});

describe("OperativoClient — scalar group-bys are unchanged", () => {
  it("puts every row in exactly one bucket", async () => {
    await renderGroupedBy("provincia");

    await waitFor(() => expect(screen.getAllByText("SANTIAGO").length).toBeGreaterThan(0));
    expect(screen.getAllByText("4000000000000001")).toHaveLength(1);
    expect(screen.getByText("3 tarjetas")).toBeInTheDocument();
    expect(screen.queryByTestId("card-group-fanout-note")).not.toBeInTheDocument();
  });
});
