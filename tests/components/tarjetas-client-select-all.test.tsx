import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Odoo-style "select all matching" on /tarjetas: once the whole page is
 * selected the bar offers every card matching the filters; bulk actions then
 * send the list query instead of ids, and any filter change ends the mode.
 */
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tarjetas",
}));

let capturedOnFilterChange: ((next: Record<string, string>) => void) | null = null;

vi.mock("@/components/filters/filter-bar", () => ({
  FilterBar: (props: { onFilterChange: (next: Record<string, string>) => void }) => {
    capturedOnFilterChange = props.onFilterChange;
    return <div data-testid="filter-bar" />;
  },
}));

vi.mock("@/components/cards/card-detail-modal", () => ({
  CardDetailModal: () => null,
}));

import TarjetasClient from "@/app/(protected)/tarjetas/tarjetas-client";

const fetchMock = vi.fn();
let total = 4536;

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

function callsTo(path: string) {
  return fetchMock.mock.calls.filter(([url]) => typeof url === "string" && url.startsWith(path));
}

function bodyOf(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string);
}

beforeEach(() => {
  window.localStorage.clear();
  total = 4536;
  capturedOnFilterChange = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/card-groups")) {
      if (init?.method === "POST") {
        return { ok: true, json: async () => ({ group: { id: "group-new" }, added: total, alreadyMember: 0 }) };
      }
      return { ok: true, json: async () => ({ groups: [{ id: "group-1", name: "Grupo A", _count: { members: 0 } }] }) };
    }
    if (url.startsWith("/api/tarjetas/exportar-seleccion")) {
      return { ok: false, json: async () => ({ error: "stop" }) };
    }
    if (url.startsWith("/api/tarjetas/off-filter-count")) {
      return { ok: true, json: async () => ({ offFilterCount: 0 }) };
    }
    if (url.startsWith("/api/user-preferences")) {
      return { ok: true, json: async () => ({ saved: false, columns: [] }) };
    }
    return {
      ok: true,
      json: async () => ({
        cards: [buildCard("card-1", "4000000000000001"), buildCard("card-2", "4000000000000002")],
        pagination: { page: 1, pageSize: 50, total, totalPages: Math.max(1, Math.ceil(total / 50)) },
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

async function selectPage() {
  render(<TarjetasClient role="ADMIN" />);
  await waitFor(() => expect(screen.getByText("4000000000000001")).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText(/Listado de tarjetas \(4536\)/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas en esta página" }));
  await waitFor(() => expect(screen.getByText("2 seleccionadas")).toBeInTheDocument());
}

describe("TarjetasClient — select all matching", () => {
  it("offers every matching card once the whole page is selected", async () => {
    await selectPage();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todas las 4,536" }));

    expect(screen.getByText("4,536 seleccionadas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Seleccionar todas las/ })).not.toBeInTheDocument();

    // × goes back to the page selection.
    fireEvent.click(screen.getByRole("button", { name: "Volver a la selección de la página" }));
    expect(screen.getByText("2 seleccionadas")).toBeInTheDocument();
  });

  it("does not offer it when the page already holds every matching card", async () => {
    total = 2;
    render(<TarjetasClient role="ADMIN" />);
    await waitFor(() => expect(screen.getByText("4000000000000001")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas en esta página" }));
    await waitFor(() => expect(screen.getByText("2 seleccionadas")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Seleccionar todas las/ })).not.toBeInTheDocument();
  });

  it("exports with the filter payload instead of ids", async () => {
    await selectPage();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todas las 4,536" }));

    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/4,536 tarjetas/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Siguiente" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Descargar" }));

    await waitFor(() => expect(callsTo("/api/tarjetas/exportar-seleccion")).toHaveLength(1));
    const body = bodyOf(callsTo("/api/tarjetas/exportar-seleccion")[0]);
    expect(body.selection).toEqual({ mode: "filter", query: { page: "1", pageSize: "50" } });
    expect(body).not.toHaveProperty("cardIds");
  });

  it("creates a group with the filter payload and skips the off-filter count", async () => {
    await selectPage();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todas las 4,536" }));

    fireEvent.click(screen.getByRole("button", { name: /Crear grupo con la selección/ }));
    expect(screen.getByText(/Se aplicará a las 4,536 tarjetas/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre del grupo"), { target: { value: "Todas" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() =>
      expect(callsTo("/api/card-groups").filter(([, init]) => (init as RequestInit)?.method === "POST")).toHaveLength(1),
    );
    const post = callsTo("/api/card-groups").find(([, init]) => (init as RequestInit)?.method === "POST")!;
    expect(bodyOf(post)).toEqual({ name: "Todas", selection: { mode: "filter", query: { page: "1", pageSize: "50" } } });
    expect(callsTo("/api/tarjetas/off-filter-count")).toHaveLength(0);
  });

  it("assigns to an existing group with addSelection", async () => {
    await selectPage();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todas las 4,536" }));

    fireEvent.click(screen.getByRole("button", { name: /Asignar a grupo existente/ }));
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() =>
      expect(callsTo("/api/card-groups/group-1").filter(([, init]) => (init as RequestInit)?.method === "PATCH")).toHaveLength(1),
    );
    const patch = callsTo("/api/card-groups/group-1")[0];
    expect(bodyOf(patch)).toEqual({ addSelection: { mode: "filter", query: { page: "1", pageSize: "50" } } });
  });

  it("keeps the mode across pages but clears it when a filter changes", async () => {
    await selectPage();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todas las 4,536" }));

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(callsTo("/api/tarjetas?").some(([url]) => String(url).includes("page=2"))).toBe(true));
    expect(screen.getByText("4,536 seleccionadas")).toBeInTheDocument();

    act(() => capturedOnFilterChange!({ provincia: "SANTIAGO" }));
    await waitFor(() => expect(screen.queryByText("4,536 seleccionadas")).not.toBeInTheDocument());
    expect(screen.getByText("2 seleccionadas")).toBeInTheDocument();
  });

  it("falls back to the page selection when a row is unchecked", async () => {
    await selectPage();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todas las 4,536" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }));
    expect(screen.getByText("1 seleccionadas")).toBeInTheDocument();
  });
});
