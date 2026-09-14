import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CardGroupAssignModal,
  OFF_FILTER_COUNT_UNAVAILABLE,
} from "@/components/cards/card-group-assign-modal";

/**
 * SDD card-groups — Work Unit F, Task 19. RED against the missing
 * `@/components/cards/card-group-assign-modal` module.
 *
 * Covers: existing-group picker vs new-name field, POST/PATCH submit,
 * `{added, alreadyMember}` surfaced in the result, and the off-filter count
 * stated before the action executes (spec: "Bulk-action confirmation names
 * off-filter count").
 */
const fetchMock = vi.fn();

const groups = [
  { id: "group-1", name: "Grupo A", _count: { members: 3 } },
  { id: "group-2", name: "Grupo B", _count: { members: 0 } },
];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("CardGroupAssignModal", () => {
  it("defaults to the existing-group picker when groups exist", () => {
    render(
      <CardGroupAssignModal
        cardIds={["card-1", "card-2"]}
        offFilterCount={0}
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Grupo existente" })).toBeInTheDocument();
  });

  it("switches to the new-name field", () => {
    render(
      <CardGroupAssignModal
        cardIds={["card-1"]}
        offFilterCount={0}
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Grupo nuevo" }));
    expect(screen.getByRole("textbox", { name: "Nombre del grupo" })).toBeInTheDocument();
  });

  it("states the off-filter count before the action executes", () => {
    render(
      <CardGroupAssignModal
        cardIds={Array.from({ length: 8 }, (_, i) => `card-${i}`)}
        offFilterCount={6}
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText(/6 de las 8 tarjetas seleccionadas est(a|á)n fuera del filtro actual/i)).toBeInTheDocument();
  });

  it("shows a calculating state instead of a stale count while offFilterCount is null", () => {
    render(
      <CardGroupAssignModal
        cardIds={["card-1", "card-2"]}
        offFilterCount={null}
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText(/calculando/i)).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ de las \d+/)).not.toBeInTheDocument();
  });

  it("shows the error message instead of a fabricated count when the count could not be obtained", () => {
    render(
      <CardGroupAssignModal
        cardIds={["card-1", "card-2"]}
        offFilterCount={null}
        offFilterError="No se pudo calcular cuántas tarjetas seleccionadas están fuera del filtro actual."
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no se pudo calcular cuántas tarjetas seleccionadas/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/calculando/i)).not.toBeInTheDocument();
  });

  it("renders honest copy, and never a zero, when the view cannot determine the off-filter count", () => {
    render(
      <CardGroupAssignModal
        cardIds={["card-1", "card-2", "card-3"]}
        offFilterCount={OFF_FILTER_COUNT_UNAVAILABLE}
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/esta vista no puede determinar cu(a|á)ntas/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/podr(i|í)an quedar fuera de lo que ves aqu(i|í)/i)).toBeInTheDocument();
    expect(screen.queryByText(/calculando/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fuera del filtro actual/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 de las/)).not.toBeInTheDocument();
  });

  it("still lets the assignment proceed while the off-filter count is undeterminable", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ group: groups[0], added: 3, alreadyMember: 0, removed: 0 }),
    });

    render(
      <CardGroupAssignModal
        cardIds={["card-1", "card-2", "card-3"]}
        offFilterCount={OFF_FILTER_COUNT_UNAVAILABLE}
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("prefers the error message over the undeterminable state", () => {
    render(
      <CardGroupAssignModal
        cardIds={["card-1"]}
        offFilterCount={OFF_FILTER_COUNT_UNAVAILABLE}
        offFilterError="No se pudo calcular el conteo."
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText("No se pudo calcular el conteo.")).toBeInTheDocument();
    expect(screen.queryByText(/esta vista no puede determinar/i)).not.toBeInTheDocument();
  });

  it("submits a PATCH to the selected existing group with addCardIds", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ group: groups[1], added: 2, alreadyMember: 0, removed: 0 }),
    });

    render(
      <CardGroupAssignModal
        cardIds={["card-1", "card-2"]}
        offFilterCount={0}
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Grupo existente" }), {
      target: { value: "group-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/card-groups/group-2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ addCardIds: ["card-1", "card-2"] }),
      }),
    );
  });

  it("submits a POST to create a new group with cardIds", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ group: { id: "group-3", name: "Nuevo" }, added: 1, alreadyMember: 0 }),
    });

    render(
      <CardGroupAssignModal
        cardIds={["card-1"]}
        offFilterCount={0}
        groups={groups}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Grupo nuevo" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del grupo" }), {
      target: { value: "Rechazos BHD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/card-groups",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Rechazos BHD", cardIds: ["card-1"] }),
      }),
    );
  });

  it("surfaces {added, alreadyMember} and calls onSuccess with the result", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ group: groups[0], added: 7, alreadyMember: 3, removed: 0 }),
    });
    const onSuccess = vi.fn();

    render(
      <CardGroupAssignModal
        cardIds={["card-1"]}
        offFilterCount={0}
        groups={groups}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() =>
      expect(screen.getByText(/7 agregadas, 3 ya eran miembros/i)).toBeInTheDocument(),
    );
    expect(onSuccess).toHaveBeenCalledWith({ added: 7, alreadyMember: 3 });
  });
});
