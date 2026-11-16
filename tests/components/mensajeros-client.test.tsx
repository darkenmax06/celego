import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("edits the messenger name and profile data from Perfil y tarifas", async () => {
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
    let saved = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/config/provincias")) {
        return json({ provincias: [{ id: "p1", nombre: "Santiago", zona: "Norte", active: true }] });
      }
      if (init?.method === "PATCH") {
        saved = true;
        return json({ messenger: {} });
      }
      if (url.startsWith("/api/mensajeros?") && saved) {
        return json({ messengers: [{ ...messenger("m1", "Ana Maria", true), telefono: "809-555" }], pagination });
      }
      return base(url, init);
    });
    render(<MensajerosClient />);
    await screen.findAllByText("Ana Activa");
    fireEvent.click(screen.getByRole("button", { name: "Ver perfil" }));

    const section = await screen.findByRole("region", { name: "Datos del mensajero" });
    fireEvent.change(within(section).getByLabelText("Nombre"), { target: { value: "  Ana Maria " } });
    fireEvent.change(within(section).getByLabelText("Telefono"), { target: { value: "809-555" } });
    fireEvent.change(within(section).getByLabelText("Zona principal"), { target: { value: "Norte" } });
    await within(section).findByRole("option", { name: "Santiago" });
    fireEvent.change(within(section).getByLabelText("Provincia de trabajo"), { target: { value: "Santiago" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil y tarifas" }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(JSON.parse(patch![1].body)).toMatchObject({
        id: "m1",
        nombre: "Ana Maria",
        telefono: "809-555",
        zonaPrincipal: "Norte",
        provinciaTrabajo: "Santiago",
      });
    });
    expect(await screen.findAllByText("Ana Maria")).not.toHaveLength(0);
  });

  it("refuses to save a name shorter than 2 characters", async () => {
    render(<MensajerosClient />);
    await screen.findAllByText("Ana Activa");
    fireEvent.click(screen.getByRole("button", { name: "Ver perfil" }));
    const section = await screen.findByRole("region", { name: "Datos del mensajero" });
    fireEvent.change(within(section).getByLabelText("Nombre"), { target: { value: " A " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil y tarifas" }));

    expect(await screen.findByText("El nombre debe tener al menos 2 caracteres")).toHaveClass("text-rose-700");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("has no Generar reporte tab and lists stored period reports with Descargar", async () => {
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/mensajeros/gestion-diaria")) {
        return json({
          records: [],
          reports: [
            {
              id: "rep-1",
              messengerId: "m1",
              fromDate: "2026-10-01T00:00:00.000Z",
              toDate: "2026-10-15T00:00:00.000Z",
              totalCents: 150000,
              generatedAt: "2026-10-16T12:00:00.000Z",
              imagePath: "messenger-reports/m1/p1.jpg",
              payrollPeriod: { id: "p1", label: "Quincena 1" },
            },
            {
              id: "rep-old",
              messengerId: "m1",
              fromDate: "2026-09-01T00:00:00.000Z",
              toDate: "2026-09-15T00:00:00.000Z",
              totalCents: 1000,
              generatedAt: "2026-09-16T12:00:00.000Z",
              imagePath: null,
              payrollPeriod: null,
            },
          ],
        });
      }
      return base(url, init);
    });
    render(<MensajerosClient />);
    await screen.findAllByText("Ana Activa");
    fireEvent.click(screen.getByRole("button", { name: "Ver perfil" }));

    expect(screen.queryByRole("button", { name: "Generar reporte" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Historial reportes" }));

    const stored = (await screen.findByText("Quincena 1")).closest("article")!;
    expect(stored).toHaveTextContent("2026-10-01 al 2026-10-15");
    expect(within(stored).getByRole("link", { name: "Descargar" })).toHaveAttribute("href", "/api/mensajeros/reportes/rep-1/imagen");
    const legacy = screen.getByText("Reporte por rango").closest("article")!;
    expect(within(legacy).queryByRole("link", { name: "Descargar" })).not.toBeInTheDocument();
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

  it("keeps a 409 history refusal in a red dialog with the counts and offers Archivar", async () => {
    const error = "No se puede eliminar: tiene historial (routes: 27). Use Archivar en su lugar.";
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? json({ error, code: "TIENE_HISTORIAL", counts: { routes: 27, dailyRecords: 33 } }, 409)
        : base(url, init),
    );
    render(<MensajerosClient canDelete />);
    await screen.findAllByText("Ana Activa");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar mensajero" }));

    const refusal = await screen.findByRole("alert");
    expect(refusal).toHaveTextContent("Tiene historial: 27 rutas y 33 registros diarios.");
    expect(refusal).toHaveClass("text-rose-700");
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("No se puede eliminar a Ana Activa");

    fireEvent.click(within(dialog).getByRole("button", { name: "Archivar" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/mensajeros/estado" && init?.method === "POST");
      expect(JSON.parse(post![1].body)).toEqual({ id: "m1", action: "archive" });
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Ana Activa fue archivado")).toHaveClass("text-emerald-700");
  });

  it("only offers Cerrar when the blocked messenger is already archived", async () => {
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? json({ error: "x", code: "TIENE_HISTORIAL", counts: { loans: 1 } }, 409) : base(url, init),
    );
    render(<MensajerosClient canDelete />);
    await screen.findAllByText("Ana Activa");
    fireEvent.click(screen.getByRole("button", { name: "Archivados" }));
    await screen.findByText("Beto Archivado");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar mensajero" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("1 prestamo");
    expect(within(screen.getByRole("alertdialog")).queryByRole("button", { name: "Archivar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("shows other lifecycle errors in red", async () => {
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? json({ error: "Otra operacion esta en curso", code: "CONFLICTO_CONCURRENTE" }, 409) : base(url, init),
    );
    render(<MensajerosClient canDelete />);
    await screen.findAllByText("Ana Activa");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar mensajero" }));

    expect(await screen.findByText("Otra operacion esta en curso")).toHaveClass("text-rose-700");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
