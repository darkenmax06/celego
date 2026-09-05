import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardSelectionBar } from "@/components/cards/card-selection-bar";

/**
 * SDD card-groups — Work Unit F, Task 17. RED against the missing
 * `@/components/cards/card-selection-bar` module.
 *
 * "Quitar del grupo" must be visible only when the current `grupo` filter
 * holds exactly ONE token that is a real group id (not `SIN_GRUPO`).
 */
describe("CardSelectionBar", () => {
  const baseProps = {
    onClear: vi.fn(),
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
});
