import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteProgressPanel } from "@/components/rutas/route-progress-panel";

/**
 * Slice 2, task 2.2 — the route-progress grid relocated from the "Lotes"
 * module tab into "Operativo de rutas" (spec scenario "Route-progress
 * sub-tab exists"). This renders the relocated view in isolation, proving it
 * shows real Route data under RUTA labeling, never LOTE.
 */

const formatDate = (value: string) => `fmt(${value})`;

function buildRoute(overrides: Partial<Parameters<typeof RouteProgressPanel>[0]["routes"][number]> = {}) {
  return {
    id: "route-0000000abcde",
    fecha: "2026-08-24",
    messenger: { nombre: "Pedro Martinez" },
    items: [] as Array<{ id: string; card: { metadata: unknown } }>,
    ...overrides,
  };
}

describe("RouteProgressPanel", () => {
  it("labels each card with RUTA, never LOTE", () => {
    render(
      <RouteProgressPanel routes={[buildRoute()]} formatDate={formatDate} onSelectRoute={vi.fn()} />,
    );

    expect(screen.getByText("RUTA ABCDE")).toBeInTheDocument();
    expect(screen.queryByText(/LOTE/)).not.toBeInTheDocument();
  });

  it("computes per-card stats from real route item outcomes", () => {
    const route = buildRoute({
      items: [
        { id: "item-1", card: { metadata: { route: { result: "ACUSE_RECIBIDO" } } } },
        { id: "item-2", card: { metadata: { route: { result: "ACUSE_RECIBIDO" } } } },
        { id: "item-3", card: { metadata: { route: { result: "DEVUELTA_TIENDA" } } } },
        { id: "item-4", card: { metadata: { route: { result: "EN_RUTA" } } } },
        { id: "item-5", card: { metadata: {} } },
      ],
    });

    render(<RouteProgressPanel routes={[route]} formatDate={formatDate} onSelectRoute={vi.fn()} />);

    // total 5, recibidas 2, retornadas 1 -> round((2+1)/5*100) = 60%
    expect(screen.getByText("60% procesado")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "p" })).toBeInTheDocument();
  });

  it("calls onSelectRoute with the route id when 'Ver tarjetas' is clicked", () => {
    const onSelectRoute = vi.fn();
    render(
      <RouteProgressPanel
        routes={[buildRoute({ id: "route-xyz999" })]}
        formatDate={formatDate}
        onSelectRoute={onSelectRoute}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ver tarjetas" }));

    expect(onSelectRoute).toHaveBeenCalledTimes(1);
    expect(onSelectRoute).toHaveBeenCalledWith("route-xyz999");
  });

  it("shows an empty-state message that never mentions LOTE when there are no routes", () => {
    render(<RouteProgressPanel routes={[]} formatDate={formatDate} onSelectRoute={vi.fn()} />);

    expect(screen.getByText(/rutas en progreso/i)).toBeInTheDocument();
    expect(screen.queryByText(/lote/i)).not.toBeInTheDocument();
  });
});
