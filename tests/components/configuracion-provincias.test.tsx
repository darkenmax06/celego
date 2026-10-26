import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  }),
}));
vi.mock("react-hot-toast", () => ({ default: toast }));
vi.mock("@/components/config/recount-deliveries", () => ({ RecountDeliveries: () => null }));
vi.mock("@/components/config/user-management", () => ({ UserManagement: () => null }));

import ConfiguracionClient from "@/app/(protected)/configuracion/configuracion-client";

const provincias = [
  { id: "p1", nombre: "Santiago", zona: "Norte", active: true },
  { id: "p2", nombre: "Samaná", zona: "Este", active: false },
];

let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return json({ ok: true });
    if (init?.method === "PATCH") return json({ provincia: {} });
    if (url.includes("provincias")) return json({ provincias });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("Configuracion provinces", () => {
  it("toggles active state with PATCH {id, active}", async () => {
    render(<ConfiguracionClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Desactivar Santiago" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/config/provincias",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ id: "p1", active: false }),
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Activar Samaná" })).toBeInTheDocument();
  });

  it("asks for confirmation in an in-app dialog and does not delete when cancelled", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    render(<ConfiguracionClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Santiago" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Eliminar provincia" });
    expect(dialog).toHaveTextContent('¿Eliminar la provincia "Santiago"? Esta acción no se puede deshacer.');
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("closes the dialog with Escape without deleting", async () => {
    render(<ConfiguracionClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Santiago" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("deletes after confirmation", async () => {
    render(<ConfiguracionClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Santiago" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/config/provincias?id=p1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Provincia eliminada"));
  });

  it("shows the API error message when deletion is blocked", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return json({ error: "No se puede eliminar. Desactívala en su lugar.", references: ["Card.provincia"] }, 409);
      }
      return json(url.includes("provincias") ? { provincias } : {});
    });
    render(<ConfiguracionClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Santiago" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No se puede eliminar. Desactívala en su lugar."),
    );
  });
});
