import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <ConfirmDialog
        open={open}
        title="Eliminar provincia"
        message="¿Seguro?"
        confirmLabel="Eliminar"
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </>
  );
}

function openDialog() {
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Abrir" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("ConfirmDialog focus management", () => {
  it("wraps Tab from the last button back to the first", () => {
    openDialog();
    const confirm = screen.getByRole("button", { name: "Eliminar" });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("wraps Shift+Tab from the first button to the last", () => {
    openDialog();
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveFocus();
  });

  it("returns focus to the element that opened it when closed", () => {
    const trigger = openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
