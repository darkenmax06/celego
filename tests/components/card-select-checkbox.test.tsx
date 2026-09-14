import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardSelectCheckbox } from "@/components/cards/card-select-checkbox";

/**
 * SDD card-groups — Work Unit F, Task 15. RED against the missing
 * `@/components/cards/card-select-checkbox` module.
 */
describe("CardSelectCheckbox", () => {
  it("reflects the checked state via a Spanish aria-label", () => {
    render(<CardSelectCheckbox checked={false} onChange={vi.fn()} label="Seleccionar tarjeta 4000" />);
    const checkbox = screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000" });
    expect(checkbox).not.toBeChecked();
  });

  it("calls onChange with the toggled value", () => {
    const onChange = vi.fn();
    render(<CardSelectCheckbox checked={false} onChange={onChange} label="Seleccionar tarjeta 4000" />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not propagate its click to an ancestor row handler", () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <CardSelectCheckbox checked={false} onChange={vi.fn()} label="Seleccionar tarjeta 4000" />
      </div>,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
