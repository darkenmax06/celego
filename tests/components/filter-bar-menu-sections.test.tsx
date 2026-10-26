import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilterBar, type FilterBarProps } from "@/components/filters/filter-bar";

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

function setup(props: Partial<FilterBarProps> = {}) {
  const onFilterChange = vi.fn();
  const onReset = vi.fn();
  const utils = render(
    <FilterBar
      resource="cards"
      sectionKey="test"
      filters={{}}
      onFilterChange={onFilterChange}
      onReset={onReset}
      {...props}
    />,
  );
  return { ...utils, onFilterChange, onReset };
}

const openMenu = () => fireEvent.click(screen.getByTitle("Abrir menú de filtros, agrupaciones y favoritos"));

describe("FilterBar menuSections", () => {
  it("renders section content in the filters column after filterMenuExtra", () => {
    setup({
      filterMenuExtra: <div data-testid="extra">extra</div>,
      menuSections: [
        { id: "vista", title: "Vista", render: () => <button type="button">Opción de vista</button> },
      ],
    });
    openMenu();
    const extra = screen.getByTestId("extra");
    const section = screen.getByText("Opción de vista");
    expect(screen.getByText("Vista")).toBeInTheDocument();
    expect(extra.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders section chips before filter chips and removes via the chip onRemove", () => {
    const onRemove = vi.fn();
    setup({
      filters: { estado: "ABIERTA" },
      menuSections: [
        { id: "vista", title: "Vista", render: () => null, chips: [{ key: "vista", label: "Vista: SLA", onRemove }] },
      ],
    });
    const sectionChip = screen.getByText("Vista: SLA");
    const filterChip = screen.getByText("estado: ABIERTA");
    expect(sectionChip.compareDocumentPosition(filterChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(sectionChip.parentElement!.querySelector("button")!);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("shows the clear button and the placeholder for section chips alone", () => {
    setup({
      searchPlaceholder: "Buscar tarjetas",
      menuSections: [
        { id: "vista", title: "Vista", render: () => null, chips: [{ key: "vista", label: "Vista: SLA", onRemove: vi.fn() }] },
      ],
    });
    expect(screen.getByTitle("Limpiar filtros y búsqueda")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Agregar criterio...")).toBeInTheDocument();
  });

  it("calls onResetExtensions exactly once on clear-all, not each chip onRemove", () => {
    const onResetExtensions = vi.fn();
    const removeA = vi.fn();
    const removeB = vi.fn();
    const { onReset } = setup({
      onResetExtensions,
      menuSections: [
        {
          id: "vista",
          title: "Vista",
          render: () => null,
          chips: [
            { key: "a", label: "A", onRemove: removeA },
            { key: "b", label: "B", onRemove: removeB },
          ],
        },
      ],
    });
    fireEvent.click(screen.getByTitle("Limpiar filtros y búsqueda"));
    expect(onResetExtensions).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(removeA).not.toHaveBeenCalled();
    expect(removeB).not.toHaveBeenCalled();
  });

  it("calls onResetExtensions also when onReset is absent", () => {
    const onResetExtensions = vi.fn();
    const { onFilterChange } = setup({
      onReset: undefined,
      onResetExtensions,
      menuSections: [
        { id: "vista", title: "Vista", render: () => null, chips: [{ key: "a", label: "A", onRemove: vi.fn() }] },
      ],
    });
    fireEvent.click(screen.getByTitle("Limpiar filtros y búsqueda"));
    expect(onResetExtensions).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it("does not trap focus or swallow Escape/Tab keys from section content", () => {
    const onKeyDown = vi.fn();
    setup({
      menuSections: [
        { id: "vista", title: "Vista", render: () => <button type="button">Foco</button> },
      ],
    });
    openMenu();
    document.addEventListener("keydown", onKeyDown);
    const button = screen.getByText("Foco");
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.keyDown(button, { key: "Escape" });
    fireEvent.keyDown(button, { key: "Tab" });
    document.removeEventListener("keydown", onKeyDown);
    expect(onKeyDown).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Foco")).toBeInTheDocument();
  });

  it("is identical with the new props absent or empty (parity)", () => {
    const base = { filters: { estado: "ABIERTA", q: "x" } };
    const a = setup(base);
    openMenu();
    const htmlA = a.container.innerHTML;
    a.unmount();
    const b = setup({ ...base, menuSections: [] });
    openMenu();
    expect(b.container.innerHTML).toBe(htmlA);
  });

  it("without chips, the clear button stays hidden", () => {
    setup({ menuSections: [{ id: "vista", title: "Vista", render: () => null }] });
    expect(screen.queryByTitle("Limpiar filtros y búsqueda")).not.toBeInTheDocument();
  });
});
