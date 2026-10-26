import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilterBar } from "@/components/filters/filter-bar";
import {
  OPERATIVE_TABS,
  buildCallTabsSection,
  type OperativeTab,
} from "@/components/operativo/call-tabs-section";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ filters: [], values: [] }) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openMenu = () => fireEvent.click(screen.getByTitle("Abrir menú de filtros, agrupaciones y favoritos"));

function Harness({ initial = "activos" as OperativeTab, onTab }: { initial?: OperativeTab; onTab?: (t: OperativeTab) => void }) {
  const [tab, setTab] = useState<OperativeTab>(initial);
  const change = (next: OperativeTab) => {
    onTab?.(next);
    setTab(next);
  };
  return (
    <div>
      <span data-testid="current">{tab}</span>
      <FilterBar
        resource="operativo"
        sectionKey="test"
        filters={{}}
        onFilterChange={vi.fn()}
        menuSections={[buildCallTabsSection(tab, change)]}
        onResetExtensions={() => change("activos")}
      />
    </div>
  );
}

describe("OPERATIVE_TABS", () => {
  it("keeps the seven existing view labels in order", () => {
    expect(OPERATIVE_TABS.map((t) => t.label)).toEqual([
      "Tarjetas Activas (Por llamar)",
      "Contactadas",
      "No Contactadas (Intentos)",
      "Casos Urgentes",
      "Traslados (Cambio Prov.)",
      "Solicitudes de Retorno",
      "Extensiones SLA (Banco)",
    ]);
  });
});

describe("buildCallTabsSection with the real FilterBar", () => {
  it("renders a Vista section with every tab as an aria-pressed button", () => {
    render(<Harness />);
    openMenu();
    expect(screen.getByText("Vista")).toBeInTheDocument();
    for (const t of OPERATIVE_TABS) {
      const btn = screen.getByRole("button", { name: t.label });
      expect(btn).toHaveAttribute("aria-pressed", t.id === "activos" ? "true" : "false");
    }
  });

  it("switches tab on click and reflects pressed state", () => {
    const onTab = vi.fn();
    render(<Harness onTab={onTab} />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Contactadas" }));
    expect(onTab).toHaveBeenCalledWith("contactadas");
    expect(screen.getByTestId("current")).toHaveTextContent("contactadas");
    expect(screen.getByRole("button", { name: "Contactadas" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows no chip on the default tab", () => {
    render(<Harness />);
    expect(screen.queryByText("Vista: Tarjetas Activas (Por llamar)")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Limpiar filtros y búsqueda")).not.toBeInTheDocument();
  });

  it("shows a chip on a non-default tab and removing it returns to activos", () => {
    render(<Harness initial="urgentes" />);
    const chip = screen.getByText("Vista: Casos Urgentes");
    fireEvent.click(chip.parentElement!.querySelector("button")!);
    expect(screen.getByTestId("current")).toHaveTextContent("activos");
    expect(screen.queryByText("Vista: Casos Urgentes")).not.toBeInTheDocument();
  });

  it("clear-all returns to activos through onResetExtensions", () => {
    render(<Harness initial="retorno" />);
    fireEvent.click(screen.getByTitle("Limpiar filtros y búsqueda"));
    expect(screen.getByTestId("current")).toHaveTextContent("activos");
  });
});
