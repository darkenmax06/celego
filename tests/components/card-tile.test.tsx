import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardTile } from "@/components/cards/card-tile";
import type { CardTileData } from "@/lib/cards/card-tile-data";

const base: CardTileData = {
  id: "card-1",
  tc: "4000000000000001",
  nombre: "Ana Pérez",
  cedula: "001-0000000-1",
  provincia: "SANTIAGO",
  zona: "Norte",
  status: "EN_RUTA",
};

describe("CardTile", () => {
  it("renders the typical card fields and the contact badge", () => {
    render(
      <CardTile data={{ ...base, contactoEstado: "CONTACTADA", canalContacto: "WHATSAPP" }} footerLeft="Principal" />,
    );

    expect(screen.getByText("4000000000000001")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Cédula: 001-0000000-1")).toBeInTheDocument();
    expect(screen.getByText(/SANTIAGO • Norte/)).toBeInTheDocument();
    expect(screen.getByText(/Contactada \(WhatsApp\)/)).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
  });

  it("toggles selection through the checkbox and is not a button without onOpen", () => {
    const onToggle = vi.fn();
    render(<CardTile data={base} selection={{ checked: false, onToggle }} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar tarjeta 4000000000000001" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Abrir gestión/ })).not.toBeInTheDocument();
  });

  it("shows call meta (SLA overdue, assignee, messenger) for call workspaces", () => {
    render(
      <CardTile
        data={{
          ...base,
          slaDueDate: "2026-10-01T12:00:00.000Z",
          diasVencidos: 4,
          asignadoA: { id: "u1", name: "Operador Uno" },
          mensajero: "Juan Mensajero",
        }}
      />,
    );

    expect(screen.getByText(/4 día\(s\) vencida/)).toBeInTheDocument();
    expect(screen.getByText("Operador Uno")).toBeInTheDocument();
    expect(screen.getByText("Juan Mensajero")).toBeInTheDocument();
  });

  it("renders 'Sin asignar' when the card has no assignee", () => {
    render(<CardTile data={{ ...base, asignadoA: null }} />);
    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
  });

  it("opens on click / Enter, but footer actions never trigger onOpen", () => {
    const onOpen = vi.fn();
    const onAction = vi.fn();
    render(
      <CardTile
        data={base}
        onOpen={onOpen}
        actions={
          <button type="button" onClick={onAction}>
            Llamar
          </button>
        }
      />,
    );

    const tile = screen.getByRole("button", { name: /Abrir gestión de Ana Pérez/ });
    fireEvent.click(tile);
    fireEvent.keyDown(tile, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Llamar" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
