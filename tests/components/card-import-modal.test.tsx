import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CardImportModal } from "@/components/importacion/card-import-modal";

function upload(label: string) {
  const input = screen.getByText(label).closest("label")?.querySelector("input[type=file]");
  if (!input) throw new Error(`No file input for ${label}`);
  fireEvent.change(input, { target: { files: [new File(["x"], "archivo.xlsx")] } });
}

describe("CardImportModal", () => {
  it("closes from the close button and the backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(<CardImportModal onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not close while an upload is in progress", async () => {
    let resolveUpload: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (resolveUpload = resolve))),
    );
    const onClose = vi.fn();
    const onImported = vi.fn();
    const { container } = render(<CardImportModal onClose={onClose} onImported={onImported} />);

    upload("1. Consolidado");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled());

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();

    resolveUpload({ ok: true, status: 200, json: async () => ({ created: 1, updated: 0, totalRows: 1 }) });
    expect(await screen.findByText(/Consolidado Débito importado con éxito/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cerrar" })).toBeEnabled());

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
