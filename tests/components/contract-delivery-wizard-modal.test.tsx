import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ContractDeliveryWizardModal } from "@/components/rutas/contract-delivery-wizard-modal";

describe("ContractDeliveryWizardModal", () => {
  const candidate = {
    itemId: "item-123",
    cardId: "card-456",
    tc: "4000123456789010",
    cedula: "40200000001",
    nombre: "Juan Perez",
    status: "EN_RUTA",
    dispatchDate: "2026-08-30",
  };

  it("renders card info and questions clearly", () => {
    render(
      <ContractDeliveryWizardModal
        candidate={candidate}
        onConfirmWithoutContract={vi.fn()}
        onConfirmWithContract={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Verificación de Contrato Requerido")).toBeInTheDocument();
    expect(screen.getByText("4000123456789010")).toBeInTheDocument();
    expect(screen.getByText("Juan Perez")).toBeInTheDocument();
    expect(screen.getByText("¿Tienes el contrato firmado de esta tarjeta aquí?")).toBeInTheDocument();
  });

  it("calls onConfirmWithoutContract when clicking 'No, guardar sin contrato'", () => {
    const onConfirmWithout = vi.fn();
    render(
      <ContractDeliveryWizardModal
        candidate={candidate}
        onConfirmWithoutContract={onConfirmWithout}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("No, guardar sin contrato"));
    expect(onConfirmWithout).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirmWithContract when clicking 'Sí, tengo el contrato'", () => {
    const onConfirmWith = vi.fn();
    render(
      <ContractDeliveryWizardModal
        candidate={candidate}
        onConfirmWithoutContract={vi.fn()}
        onConfirmWithContract={onConfirmWith}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Sí, tengo el contrato"));
    expect(onConfirmWith).toHaveBeenCalledTimes(1);
  });
});
