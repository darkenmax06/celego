import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MissingContractWizardModal } from "@/components/status-digitales/missing-contract-wizard-modal";

describe("MissingContractWizardModal", () => {
  const items = [
    {
      fileName: "4-14060756242.jpg",
      identifier: "4-14060756242",
      tc: "4000123456789010",
      nombre: "Maria Santos",
      cedula: "00100000002",
      provincia: "Santo Domingo",
    },
  ];

  it("renders missing contract items and confirmation button", () => {
    render(
      <MissingContractWizardModal
        items={items}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Tarjetas pendientes de contrato (1)")).toBeInTheDocument();
    expect(screen.getByText("4000123456789010")).toBeInTheDocument();
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    expect(screen.getByText("4-14060756242.jpg")).toBeInTheDocument();
  });

  it("calls onConfirm when clicking 'Confirmar y procesar'", () => {
    const onConfirm = vi.fn();
    render(
      <MissingContractWizardModal
        items={items}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Confirmar y procesar/i));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
