import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tarjetas list columns: order + visibility come from the per-user server
 * layout (`/api/user-preferences/tables/tarjetas`), can be reordered from the
 * "Columnas" popover (drag & drop or move buttons), and the legacy
 * localStorage visible-columns list is migrated once.
 */
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tarjetas",
}));

vi.mock("@/components/filters/filter-bar", () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}));

vi.mock("@/components/cards/card-detail-modal", () => ({
  CardDetailModal: () => null,
}));

import TarjetasClient from "@/app/(protected)/tarjetas/tarjetas-client";

const PREFS_URL = "/api/user-preferences/tables/tarjetas";
const LEGACY_KEY = "celego:workspace:v1:tarjetas:visible-columns";

const fetchMock = vi.fn();
let savedLayout: { saved: boolean; columns: { key: string; visible: boolean }[] } = { saved: false, columns: [] };

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

function headerLabels() {
  return screen
    .getAllByRole("columnheader")
    .map((cell) => cell.textContent?.trim() ?? "")
    .filter(Boolean);
}

function putBodies() {
  return fetchMock.mock.calls
    .filter(([url, init]) => url === PREFS_URL && (init as RequestInit | undefined)?.method === "PUT")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as { columns: { key: string; visible: boolean }[] });
}

beforeEach(() => {
  window.localStorage.clear();
  savedLayout = { saved: false, columns: [] };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === PREFS_URL) {
      if (init?.method === "PUT") return { ok: true, json: async () => ({ ok: true }) };
      return { ok: true, json: async () => ({ tableKey: "tarjetas", ...savedLayout }) };
    }
    if (url.startsWith("/api/card-groups")) {
      return { ok: true, json: async () => ({ groups: [] }) };
    }
    return {
      ok: true,
      json: async () => ({
        cards: [buildCard("card-1", "4000000000000001")],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("TarjetasClient — column layout", () => {
  it("renders the columns in the order saved on the server", async () => {
    savedLayout = {
      saved: true,
      columns: [
        { key: "estado", visible: true },
        { key: "tc", visible: true },
        { key: "cliente", visible: true },
      ],
    };
    render(<TarjetasClient role="FACTURACION" />);

    await waitFor(() => expect(headerLabels().slice(0, 3)).toEqual(["Estado", "TC", "Cliente"]));
    // Columns not in the saved layout are appended with their default visibility.
    expect(headerLabels()).toContain("Provincia");
    expect(headerLabels()).not.toContain("Fecha de creación");
  });

  it("moves a column with the keyboard-accessible buttons and saves the new order", async () => {
    render(<TarjetasClient role="FACTURACION" />);
    await waitFor(() => expect(headerLabels().slice(0, 2)).toEqual(["TC", "Gestión Contacto"]));

    fireEvent.click(screen.getByRole("button", { name: /Columnas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mover Gestión Contacto arriba" }));

    expect(headerLabels().slice(0, 2)).toEqual(["Gestión Contacto", "TC"]);
    await waitFor(() => expect(putBodies()).toHaveLength(1), { timeout: 3000 });
    expect(putBodies()[0].columns.slice(0, 2)).toEqual([
      { key: "contactoEstado", visible: true },
      { key: "tc", visible: true },
    ]);
  });

  it("reorders columns by drag and drop in the column chooser", async () => {
    render(<TarjetasClient role="FACTURACION" />);
    await waitFor(() => expect(headerLabels()[0]).toBe("TC"));

    fireEvent.click(screen.getByRole("button", { name: /Columnas/ }));
    const list = screen.getByRole("list", { name: "Orden de columnas" });
    const cliente = within(list).getByRole("listitem", { name: "Cliente" });
    const tc = within(list).getByRole("listitem", { name: "TC" });

    fireEvent.dragStart(cliente);
    fireEvent.dragOver(tc);
    fireEvent.drop(tc);

    expect(headerLabels().slice(0, 2)).toEqual(["Cliente", "TC"]);
    expect(within(list).getAllByRole("listitem")[0]).toHaveAccessibleName("Cliente");
  });

  it("hides a column from the chooser without changing the order", async () => {
    render(<TarjetasClient role="FACTURACION" />);
    await waitFor(() => expect(headerLabels()).toContain("Producto"));

    fireEvent.click(screen.getByRole("button", { name: /Columnas/ }));
    const list = screen.getByRole("list", { name: "Orden de columnas" });
    fireEvent.click(within(within(list).getByRole("listitem", { name: "Producto" })).getByText("Producto"));

    expect(headerLabels()).not.toContain("Producto");
    expect(headerLabels().slice(0, 2)).toEqual(["TC", "Gestión Contacto"]);
  });

  it("migrates the legacy localStorage visible columns once when no server layout exists", async () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ version: 1, value: ["tc", "cliente", "acciones"] }));
    render(<TarjetasClient role="FACTURACION" />);

    await waitFor(() => expect(headerLabels()).toEqual(["TC", "Cliente"]));
    await waitFor(() => expect(putBodies()).toHaveLength(1));
    expect(putBodies()[0].columns.filter((column) => column.visible).map((column) => column.key)).toEqual([
      "tc",
      "cliente",
    ]);
    await waitFor(() => expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull());
  });

  it("ignores the legacy list when the server already has a layout", async () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ version: 1, value: ["tc", "cliente"] }));
    savedLayout = { saved: true, columns: [{ key: "tc", visible: true }, { key: "estado", visible: true }] };
    render(<TarjetasClient role="FACTURACION" />);

    await waitFor(() => expect(headerLabels().slice(0, 2)).toEqual(["TC", "Estado"]));
    expect(putBodies()).toHaveLength(0);
  });
});
