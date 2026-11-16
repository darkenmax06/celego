import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Tarjetas header "Importar" button opening the card import UI in a modal. */
let searchParams = new URLSearchParams();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => "/tarjetas",
}));

vi.mock("@/components/filters/filter-bar", () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}));

vi.mock("@/components/cards/card-detail-modal", () => ({
  CardDetailModal: () => null,
}));

import TarjetasClient from "@/app/(protected)/tarjetas/tarjetas-client";

const fetchMock = vi.fn();

function cardListCalls() {
  return fetchMock.mock.calls.filter(([url]) => typeof url === "string" && url.startsWith("/api/tarjetas?")).length;
}

/** Uploader inputs are hidden; pick the one inside the labelled uploader. */
function upload(label: string) {
  const input = screen.getByText(label).closest("label")?.querySelector("input[type=file]");
  if (!input) throw new Error(`No file input for ${label}`);
  fireEvent.change(input, { target: { files: [new File(["x"], "archivo.xlsx")] } });
}

beforeEach(() => {
  window.localStorage.clear();
  searchParams = new URLSearchParams();
  replaceMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/card-groups")) {
      return { ok: true, status: 200, json: async () => ({ groups: [] }) };
    }
    if (url === "/api/tarjetas/importar") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ created: 2, updated: 0, skipped: 0, rejected: 0, parsedRows: 2 }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ cards: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 } }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("TarjetasClient — Importar button", () => {
  it.each(["ADMIN", "OPERADOR"])("shows Importar next to Nueva tarjeta for %s", (role) => {
    render(<TarjetasClient role={role} />);
    expect(screen.getByRole("button", { name: "Importar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva tarjeta" })).toBeInTheDocument();
  });

  it.each(["FACTURACION", "MENSAJERO"])("hides Importar for %s", (role) => {
    render(<TarjetasClient role={role} />);
    expect(screen.queryByRole("button", { name: "Importar" })).not.toBeInTheDocument();
  });

  it("opens the import UI in a modal and closes it", async () => {
    render(<TarjetasClient role="OPERADOR" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    const dialog = screen.getByRole("dialog", { name: "Importar tarjetas" });
    expect(within(dialog).getByText("Importar Data Diaria")).toBeInTheDocument();
    expect(within(dialog).getByText("2. Despacho")).toBeInTheDocument();
    expect(within(dialog).getByText("3. Entregas Pinit")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reloads the card list after a successful import", async () => {
    render(<TarjetasClient role="ADMIN" />);
    await waitFor(() => expect(cardListCalls()).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    upload("Importar Data Diaria");

    expect(await screen.findByText(/Data Diaria Crédito importada: 2 creadas/)).toBeInTheDocument();
    await waitFor(() => expect(cardListCalls()).toBe(2));
  });

  it("opens the modal from ?importar=1 and drops the param", async () => {
    searchParams = new URLSearchParams("importar=1");
    render(<TarjetasClient role="ADMIN" />);

    expect(await screen.findByRole("dialog", { name: "Importar tarjetas" })).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/tarjetas", { scroll: false });
    // `importar` is not a card filter, so it never reaches the list API.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("importar=1"))).toBe(false);
  });
});
