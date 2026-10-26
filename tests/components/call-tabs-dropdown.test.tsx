import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CallTabsDropdown } from "@/components/operativo/call-tabs-dropdown";

afterEach(cleanup);

describe("CallTabsDropdown", () => {
  it("starts closed with aria-expanded=false and opens on click", () => {
    render(<CallTabsDropdown tab="extensiones-sla" onTabChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /Vista: Extensiones SLA \(Banco\)/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Contactadas" })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Contactadas" })).toBeInTheDocument();
  });

  it("selects a tab and closes", () => {
    const onTabChange = vi.fn();
    render(<CallTabsDropdown tab="extensiones-sla" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Vista:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tarjetas Activas (Por llamar)" }));
    expect(onTabChange).toHaveBeenCalledWith("activos");
    expect(screen.queryByRole("button", { name: "Contactadas" })).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<CallTabsDropdown tab="extensiones-sla" onTabChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /Vista:/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("button", { name: "Contactadas" }), { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on outside click", () => {
    render(
      <div>
        <span>fuera</span>
        <CallTabsDropdown tab="extensiones-sla" onTabChange={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Vista:/ }));
    fireEvent.mouseDown(screen.getByText("fuera"));
    expect(screen.getByRole("button", { name: /Vista:/ })).toHaveAttribute("aria-expanded", "false");
  });
});
