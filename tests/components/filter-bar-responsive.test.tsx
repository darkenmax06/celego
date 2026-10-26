import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilterBar } from "@/components/filters/filter-bar";
import { CallTabsDropdown } from "@/components/operativo/call-tabs-dropdown";

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

function classesOf(element: Element | null) {
  return (element?.getAttribute("class") ?? "").split(/\s+/);
}

describe("FilterBar popover on narrow viewports", () => {
  it("fits the viewport on phones and keeps the 700px three-column layout from md up", () => {
    const { container } = render(
      <FilterBar resource="cards" sectionKey="test" filters={{}} onFilterChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByTitle("Abrir menú de filtros, agrupaciones y favoritos"));
    const popover = container.querySelector("[data-filter-menu-popover]");
    const classes = classesOf(popover);

    // Phones: never wider than the viewport, columns stacked and scrollable.
    expect(classes).toEqual(expect.arrayContaining(["w-full", "max-w-[calc(100vw-2rem)]", "flex-col", "overflow-y-auto"]));
    expect(classes).not.toContain("min-w-[700px]");
    // Desktop (>= md): the original side-by-side layout.
    expect(classes).toEqual(expect.arrayContaining(["md:min-w-[700px]", "md:max-w-4xl", "md:flex-row"]));

    const columns = Array.from(popover!.children);
    expect(columns).toHaveLength(3);
    for (const column of columns) expect(classesOf(column)).toContain("md:flex-1");
  });
});

describe("CallTabsDropdown on narrow viewports", () => {
  it("caps its panel to the viewport width", () => {
    render(<CallTabsDropdown tab="extensiones-sla" onTabChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Vista:/ }));
    const panel = screen.getByText("Vista", { selector: "p" }).parentElement;
    expect(classesOf(panel)).toEqual(expect.arrayContaining(["w-72", "max-w-[calc(100vw-2rem)]"]));
  });
});
