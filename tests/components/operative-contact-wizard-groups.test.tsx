import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OperativeContactWizard,
  type OperativeWizardCard,
} from "@/components/operativo/operative-contact-wizard";

/**
 * Stage B, Task B3: an "Asignar a grupo" control in the wizard's sticky footer
 * action row, opening the shared assign modal for exactly one card.
 *
 * The wizard already carries `groupIds` (Stage A), so the groups the card is
 * already in are resolved client-side against the group list the host screen
 * already fetched — no extra endpoint and no duplicate fetch.
 */
const fetchMock = vi.fn();

const groups = [
  { id: "group-1", name: "Grupo A", _count: { members: 2 } },
  { id: "group-2", name: "Grupo B", _count: { members: 5 } },
];

function buildCard(overrides: Partial<OperativeWizardCard> = {}): OperativeWizardCard {
  return {
    id: "card-1",
    cardId: "card-1",
    tc: "4000000000000001",
    nombre: "Cliente Test",
    cedula: "001-0000000-0",
    provincia: "SANTIAGO",
    zona: "Norte",
    status: "EN_RUTA",
    direcciones: ["Calle 1"],
    refs: [],
    telefonos: [{ num: "8090000000", principal: true, funciona: false, comentario: "" }],
    groupIds: [],
    ...overrides,
  };
}

function renderWizard(card: OperativeWizardCard, props: Record<string, unknown> = {}) {
  return render(
    <OperativeContactWizard
      card={card}
      index={0}
      total={1}
      onClose={vi.fn()}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onSave={vi.fn(async () => null)}
      canManageGroups
      cardGroups={groups}
      {...props}
    />,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ group: groups[0], added: 1, alreadyMember: 0, removed: 0 }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("OperativeContactWizard — assign to group (Task B3)", () => {
  it("renders the Asignar a grupo action for a role that can manage groups", () => {
    renderWizard(buildCard());
    expect(screen.getByRole("button", { name: /asignar a grupo/i })).toBeInTheDocument();
  });

  it("hides the action for a role that cannot manage groups", () => {
    renderWizard(buildCard(), { canManageGroups: false });
    expect(screen.queryByRole("button", { name: /asignar a grupo/i })).not.toBeInTheDocument();
  });

  it("opens the assign modal for exactly this one card", async () => {
    renderWizard(buildCard());

    fireEvent.click(screen.getByRole("button", { name: /asignar a grupo/i }));

    const dialogHeading = await screen.findByRole("heading", { name: "Asignar a grupo" });
    expect(dialogHeading).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    // The wizard also loads its script templates on mount, so assert the group
    // call specifically rather than the total call count.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/card-groups/group-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ addCardIds: ["card-1"] }),
        }),
      ),
    );
  });

  it("shows no off-filter warning: one explicitly chosen card has no filter ambiguity", async () => {
    renderWizard(buildCard());
    fireEvent.click(screen.getByRole("button", { name: /asignar a grupo/i }));

    await screen.findByRole("heading", { name: "Asignar a grupo" });
    expect(screen.queryByText(/calculando/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fuera del filtro actual/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/esta vista no puede determinar/i)).not.toBeInTheDocument();
  });

  it("names the groups the card already belongs to", () => {
    renderWizard(buildCard({ groupIds: ["group-2"] }));
    expect(screen.getByText("Grupo B")).toBeInTheDocument();
    expect(screen.queryByText("Grupo A")).not.toBeInTheDocument();
  });

  it("shows nothing about membership when the card is in no group", () => {
    renderWizard(buildCard({ groupIds: [] }));
    expect(screen.queryByText("Grupo B")).not.toBeInTheDocument();
  });

  it("does not offer the action for a wizard row with no linked card", () => {
    renderWizard(buildCard({ cardId: null }));
    expect(screen.queryByRole("button", { name: /asignar a grupo/i })).not.toBeInTheDocument();
  });
});
