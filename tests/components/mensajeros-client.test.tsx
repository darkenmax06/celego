import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MensajerosClient from "@/app/(protected)/mensajeros/mensajeros-client";

vi.mock("@/components/mensajeros/general-periods", () => ({ GeneralPeriods: () => null }));
vi.mock("@/components/mensajeros/loans-panel", () => ({ LoansPanel: () => null }));
vi.mock("@/components/mensajeros/payroll-panel", () => ({ PayrollPanel: () => null }));

const pagination = { page: 1, pageSize: 24, total: 1, totalPages: 1 };
const messenger = (id: string, nombre: string, activo: boolean) => ({
  id,
  nombre,
  telefono: null,
  zonaPrincipal: "Metro",
  provinciaTrabajo: null,
  activo,
  serviceRates: [],
});

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;
let listResponder: (url: string) => Promise<ReturnType<typeof json>>;

function listCalls() {
  return fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/mensajeros?"));
}

beforeEach(() => {
  window.localStorage.clear();
  listResponder = async (url) =>
    json({
      messengers: url.includes("onlyArchived=1")
        ? [messenger("m2", "Beto Archivado", false)]
        : [messenger("m1", "Ana Activa", true)],
      pagination,
    });
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/mensajeros?")) return listResponder(url);
    if (url.startsWith("/api/mensajeros/estado?")) {
      return json({ id: "m1", activo: true, openRoutes: 2, assignedCards: 15 });
    }
    if (url === "/api/mensajeros/estado" && init?.method === "POST") {
      return json({ changed: true, openRoutes: 2, assignedCards: 15 });
    }
    if (url.startsWith("/api/mensajeros/gestion-diaria")) return json({ records: [], reports: [] });
    if (url.startsWith("/api/config/provincias")) return json({ provincias: [] });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("MensajerosClient archive lifecycle (R3.3)", () => {
  it("refetches with onlyArchived when switching tabs even at page 1", async () => {
    render(<MensajerosClient />);
    await screen.findAllByText("Ana Activa");
    expect(listCalls().every((url) => url.includes("onlyActive=1"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Archivados" }));

    await screen.findByText("Beto Archivado");
    expect(listCalls().some((url) => url.includes("onlyArchived=1") && url.includes("page=1"))).toBe(true);
    expect(screen.queryByText("Registro global del dia")).not.toBeInTheDocument();
  });

  it("discards a stale response that resolves after a newer one", async () => {
    let releaseActive: (value: ReturnType<typeof json>) => void = () => {};
    const heldActive = new Promise<ReturnType<typeof json>>((resolve) => {
      releaseActive = resolve;
    });
    listResponder = (url) =>
      url.includes("onlyArchived=1")
        ? Promise.resolve(json({ messengers: [messenger("m2", "Beto Archivado", false)], pagination }))
        : heldActive;

    render(<MensajerosClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Archivados" }));
    await screen.findByText("Beto Archivado");

    await act(async () => {
      releaseActive(json({ messengers: [messenger("m1", "Ana Activa", true)], pagination }));
    });

    expect(screen.queryAllByText("Ana Activa")).toHaveLength(0);
    expect(screen.getByText("Beto Archivado")).toBeInTheDocument();
  });

  it("archives through a confirm dialog showing both counts", async () => {
    render(<MensajerosClient />);
    await screen.findAllByText("Ana Activa");

    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("2 rutas abiertas");
    expect(dialog).toHaveTextContent("15 tarjetas asignadas");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Archivar mensajero" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/mensajeros/estado" && init?.method === "POST");
      expect(JSON.parse(post![1].body)).toEqual({ id: "m1", action: "archive" });
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("closes the dialog and reports an error when the lifecycle request fails", async () => {
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/mensajeros/estado" && init?.method === "POST") throw new TypeError("network down");
      return base(url, init);
    });
    render(<MensajerosClient />);
    await screen.findAllByText("Ana Activa");

    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Archivar mensajero" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await screen.findByText("No se pudo actualizar el mensajero")).toBeInTheDocument();
  });

  it("restores an archived messenger through the dialog", async () => {
    render(<MensajerosClient />);
    await screen.findAllByText("Ana Activa");
    fireEvent.click(screen.getByRole("button", { name: "Archivados" }));
    await screen.findByText("Beto Archivado");

    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Restaurar mensajero" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/mensajeros/estado" && init?.method === "POST");
      expect(JSON.parse(post![1].body)).toEqual({ id: "m2", action: "restore" });
    });
  });

  it("does not send activo when saving a profile", async () => {
    render(<MensajerosClient />);
    await screen.findAllByText("Ana Activa");
    fireEvent.click(screen.getByRole("button", { name: "Ver perfil" }));
    fireEvent.click(await screen.findByRole("button", { name: "Guardar perfil y tarifas" }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(patch![1].body)).not.toHaveProperty("activo");
    });
  });

  it("hides Eliminar unless the page grants canDelete", async () => {
    render(<MensajerosClient />);
    await screen.findAllByText("Ana Activa");
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });

  it("deletes through a destructive dialog on both tabs", async () => {
    render(<MensajerosClient canDelete />);
    await screen.findAllByText("Ana Activa");
    fireEvent.click(screen.getByRole("button", { name: "Archivados" }));
    await screen.findByText("Beto Archivado");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await screen.findByRole("alertdialog");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar mensajero" }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(JSON.parse(del![1].body)).toEqual({ id: "m2" });
    });
    await screen.findByText("Beto Archivado fue eliminado");
  });

  it("surfaces the 409 history message and suggests Archivar", async () => {
    const error = "No se puede eliminar: tiene historial (loans: 2). Use Archivar en su lugar.";
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? json({ error, code: "TIENE_HISTORIAL" }, 409) : base(url, init),
    );
    render(<MensajerosClient canDelete />);
    await screen.findAllByText("Ana Activa");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar mensajero" }));

    await screen.findByText(error);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
