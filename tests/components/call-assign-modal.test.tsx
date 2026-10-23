import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallAssignModal } from "@/components/llamadas/call-assign-modal";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("CallAssignModal", () => {
  it("loads operators and posts the selected one with the card ids", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/llamadas/operadores") {
        return Promise.resolve(
          jsonResponse({ operadores: [{ id: "op-1", name: "Ana" }, { id: "op-2", name: "Luis" }] }),
        );
      }
      if (url === "/api/llamadas/asignaciones" && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            asignadoA: { id: "op-2", name: "Luis" },
            requested: 2,
            assigned: 1,
            reassigned: 1,
            unchanged: 0,
            notFound: 0,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const onAssigned = vi.fn();

    render(<CallAssignModal cardIds={["c1", "c2"]} onClose={vi.fn()} onAssigned={onAssigned} />);

    const select = await screen.findByRole("combobox", { name: "Operario" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Luis" })).toBeInTheDocument());
    fireEvent.change(select, { target: { value: "op-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() => expect(onAssigned).toHaveBeenCalled());
    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((postCall?.[1] as RequestInit).body))).toEqual({
      cardIds: ["c1", "c2"],
      assignedToId: "op-2",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 asignadas, 1 reasignadas, 0 sin cambios, 0 no encontradas.",
    );
  });

  it("unassign mode sends DELETE without loading operators", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ removed: 3 }));
    const onUnassigned = vi.fn();

    render(
      <CallAssignModal cardIds={["a", "b", "c"]} mode="unassign" onClose={vi.fn()} onUnassigned={onUnassigned} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quitar asignación" }));

    await waitFor(() => expect(onUnassigned).toHaveBeenCalledWith({ removed: 3 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/llamadas/asignaciones");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ cardIds: ["a", "b", "c"] });
  });

  it("surfaces the API error", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/llamadas/operadores"
          ? jsonResponse({ operadores: [{ id: "op-1", name: "Ana" }] })
          : jsonResponse({ error: "Operador no válido" }, 400),
      ),
    );
    render(<CallAssignModal cardIds={["c1"]} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Asignar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    expect(await screen.findByText("Operador no válido")).toBeInTheDocument();
  });
});
