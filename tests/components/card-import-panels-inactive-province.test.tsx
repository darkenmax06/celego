import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CardImportPanels } from "@/components/importacion/card-import-panels";

let responseBody: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => responseBody })));
});

/** Uploader inputs are hidden; pick the one inside the labelled uploader. */
function upload(label: string) {
  const input = screen.getByText(label).closest("label")?.querySelector("input[type=file]");
  if (!input) throw new Error(`No file input for ${label}`);
  fireEvent.change(input, { target: { files: [new File(["x"], "archivo.xlsx")] } });
}

describe("CardImportPanels inactive province warning", () => {
  it("warns how many imported rows came with an inactive province", async () => {
    responseBody = { created: 3, updated: 0, count: 3, totalRows: 3, inactiveProvinceRows: 3, inactiveProvinceNames: ["Distrito Nacional"] };
    render(<CardImportPanels />);
    upload("2. Despacho");

    expect(await screen.findByText("3 filas vinieron con provincia inactiva (Distrito Nacional).")).toBeInTheDocument();
    expect(screen.getByText(/Despacho Débito importado con éxito/)).toBeInTheDocument();
  });

  it("shows the warning for the credit daily import too", async () => {
    responseBody = { created: 1, updated: 0, skipped: 0, rejected: 0, parsedRows: 1, inactiveProvinceRows: 1, inactiveProvinceNames: ["Samaná"] };
    render(<CardImportPanels />);
    upload("Importar Data Diaria");

    expect(await screen.findByText("1 fila vino con provincia inactiva (Samaná).")).toBeInTheDocument();
  });

  it("shows no warning when no row had an inactive province", async () => {
    responseBody = { created: 2, updated: 0, count: 2, totalRows: 2, inactiveProvinceRows: 0, inactiveProvinceNames: [] };
    render(<CardImportPanels />);
    upload("1. Consolidado");

    expect(await screen.findByText(/Consolidado Débito importado con éxito/)).toBeInTheDocument();
    expect(screen.queryByText(/provincia inactiva/)).not.toBeInTheDocument();
  });
});
