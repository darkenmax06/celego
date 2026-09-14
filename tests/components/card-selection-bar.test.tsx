import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardSelectionBar } from "@/components/cards/card-selection-bar";

/**
 * SDD card-groups — Work Unit F, Task 17.
 * SDD card-groups remediation — FIX 1 (selection review panel, Tasks below).
 *
 * "Quitar del grupo" must be visible only when the current `grupo` filter
 * holds exactly ONE token that is a real group id (not `SIN_GRUPO`).
 *
 * Remediation adds a review affordance: clicking the count opens a panel
 * listing every selected card (including ids not on the loaded page, which
 * render as a clearly-labelled minimal entry rather than being silently
 * dropped) and lets the operator deselect one entry at a time.
 */
describe("CardSelectionBar", () => {
  const baseProps = {
    selectedIds: [],
    cardsById: {},
    onClear: vi.fn(),
    onDeselect: vi.fn(),
    onCreateGroup: vi.fn(),
    onAssignExisting: vi.fn(),
    onRemoveFromGroup: vi.fn(),
  };

  it("renders nothing when the selection is empty", () => {
    const { container } = render(
      <CardSelectionBar {...baseProps} count={0} activeGroupFilterIds={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the selection count when count > 0", () => {
    render(<CardSelectionBar {...baseProps} count={8} activeGroupFilterIds={[]} />);
    expect(screen.getByText("8 seleccionadas")).toBeInTheDocument();
  });

  it("hides 'Quitar del grupo' with no group filter active", () => {
    render(<CardSelectionBar {...baseProps} count={3} activeGroupFilterIds={[]} />);
    expect(screen.queryByRole("button", { name: "Quitar del grupo" })).not.toBeInTheDocument();
  });

  it("hides 'Quitar del grupo' when multiple groups are active in the filter", () => {
    render(<CardSelectionBar {...baseProps} count={3} activeGroupFilterIds={["g1", "g2"]} />);
    expect(screen.queryByRole("button", { name: "Quitar del grupo" })).not.toBeInTheDocument();
  });

  it("hides 'Quitar del grupo' when only SIN_GRUPO is active", () => {
    render(<CardSelectionBar {...baseProps} count={3} activeGroupFilterIds={["SIN_GRUPO"]} />);
    expect(screen.queryByRole("button", { name: "Quitar del grupo" })).not.toBeInTheDocument();
  });

  it("shows 'Quitar del grupo' when exactly one real group is active", () => {
    render(<CardSelectionBar {...baseProps} count={3} activeGroupFilterIds={["g1"]} />);
    expect(screen.getByRole("button", { name: "Quitar del grupo" })).toBeInTheDocument();
  });

  it("fires onClear", () => {
    const onClear = vi.fn();
    render(<CardSelectionBar {...baseProps} onClear={onClear} count={2} activeGroupFilterIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar selección" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("fires onCreateGroup and onAssignExisting", () => {
    const onCreateGroup = vi.fn();
    const onAssignExisting = vi.fn();
    render(
      <CardSelectionBar
        {...baseProps}
        onCreateGroup={onCreateGroup}
        onAssignExisting={onAssignExisting}
        count={2}
        activeGroupFilterIds={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear grupo con la selección" }));
    fireEvent.click(screen.getByRole("button", { name: "Asignar a grupo existente" }));
    expect(onCreateGroup).toHaveBeenCalledTimes(1);
    expect(onAssignExisting).toHaveBeenCalledTimes(1);
  });

  it("fires onRemoveFromGroup", () => {
    const onRemoveFromGroup = vi.fn();
    render(
      <CardSelectionBar
        {...baseProps}
        onRemoveFromGroup={onRemoveFromGroup}
        count={2}
        activeGroupFilterIds={["g1"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quitar del grupo" }));
    expect(onRemoveFromGroup).toHaveBeenCalledTimes(1);
  });

  describe("selection review panel", () => {
    const cardsById = {
      "card-1": { id: "card-1", tc: "4000000000000001", customerName: "Ana Perez", cedula: "001-1111111-1" },
      "card-2": { id: "card-2", tc: "4000000000000002", customerName: "Beto Diaz", cedula: "001-2222222-2" },
    };

    it("does not render the review panel until the count is opened", () => {
      render(
        <CardSelectionBar
          {...baseProps}
          count={2}
          selectedIds={["card-1", "card-2"]}
          cardsById={cardsById}
          activeGroupFilterIds={[]}
        />,
      );
      expect(screen.queryByText("Ana Perez")).not.toBeInTheDocument();
    });

    it("opens the review panel and lists every selected card by identity", () => {
      render(
        <CardSelectionBar
          {...baseProps}
          count={2}
          selectedIds={["card-1", "card-2"]}
          cardsById={cardsById}
          activeGroupFilterIds={[]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "2 seleccionadas" }));
      expect(screen.getByText("Ana Perez")).toBeInTheDocument();
      expect(screen.getByText("Beto Diaz")).toBeInTheDocument();
    });

    it("renders a clearly-labelled minimal entry for a selected id not on the loaded page", () => {
      render(
        <CardSelectionBar
          {...baseProps}
          count={3}
          selectedIds={["card-1", "off-page-card"]}
          cardsById={cardsById}
          activeGroupFilterIds={[]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "3 seleccionadas" }));
      expect(screen.getByText("off-page-card")).toBeInTheDocument();
      expect(screen.getByText(/fuera de esta vista/i)).toBeInTheDocument();
    });

    it("lists a card selected on another screen and absent from this screen's dataset", () => {
      // The selection is app-wide (one shared key), so /sla-vencidas can hold a
      // selection made on /tarjetas whose cards it will never load. Dropping
      // those entries is exactly the blindness this panel exists to prevent.
      render(
        <CardSelectionBar
          {...baseProps}
          count={2}
          selectedIds={["selected-on-tarjetas", "card-1"]}
          cardsById={{ "card-1": cardsById["card-1"] }}
          activeGroupFilterIds={[]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "2 seleccionadas" }));
      expect(screen.getByText("selected-on-tarjetas")).toBeInTheDocument();
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    it("deselects a single card from the review panel without clearing the rest", () => {
      const onDeselect = vi.fn();
      render(
        <CardSelectionBar
          {...baseProps}
          onDeselect={onDeselect}
          count={2}
          selectedIds={["card-1", "card-2"]}
          cardsById={cardsById}
          activeGroupFilterIds={[]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "2 seleccionadas" }));
      fireEvent.click(screen.getByRole("button", { name: "Quitar tarjeta 4000000000000001 de la selección" }));
      expect(onDeselect).toHaveBeenCalledExactlyOnceWith("card-1");
    });

    it("keeps 'Limpiar selección' available for the all-at-once case", () => {
      render(
        <CardSelectionBar
          {...baseProps}
          count={2}
          selectedIds={["card-1", "card-2"]}
          cardsById={cardsById}
          activeGroupFilterIds={[]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "2 seleccionadas" }));
      expect(screen.getByRole("button", { name: "Limpiar selección" })).toBeInTheDocument();
    });
  });
});
