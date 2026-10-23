import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace }),
  usePathname: () => "/operativo",
}));

import { readFiltersFromSearch, serializeFilters, useCardListFilters } from "@/lib/use-card-list-filters";

const DEFAULTS = { page: "1", pageSize: "25" };

function setUrl(query: string) {
  search = new URLSearchParams(query);
  window.history.replaceState(null, "", query ? `/operativo?${query}` : "/operativo");
}

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockReset();
  setUrl("");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCardListFilters", () => {
  it("reads filters from the URL on mount, over the defaults, ignoring reserved keys", () => {
    setUrl("provincia=SANTIAGO&asignado=ME&page=2&llamar=1");

    const { result } = renderHook(() => useCardListFilters({ defaults: DEFAULTS }));

    expect(result.current.filters).toEqual({ page: "2", pageSize: "25", provincia: "SANTIAGO", asignado: "ME" });
  });

  it("writes changed filters back with router.replace, omitting defaults and ALL", () => {
    const { result } = renderHook(() => useCardListFilters({ defaults: DEFAULTS }));

    act(() => {
      result.current.setFilters((prev) => ({ ...prev, status: "TD_EN_PROCESO_DE_RETORNO", zona: "ALL" }));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(replace).toHaveBeenCalledWith("/operativo?status=TD_EN_PROCESO_DE_RETORNO", { scroll: false });
  });

  it("leaves an already-synced URL alone, and reset returns to the clean path", () => {
    setUrl("grupo=g1");
    const { result } = renderHook(() => useCardListFilters({ defaults: DEFAULTS }));

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).not.toHaveBeenCalled();

    act(() => result.current.resetFilters());
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalledWith("/operativo", { scroll: false });
  });
});

describe("filter URL helpers", () => {
  it("round-trips filters through the query string", () => {
    const filters = { page: "1", pageSize: "25", asignado: "SIN_ASIGNAR", provincia: "SANTIAGO,LA VEGA" };
    const query = serializeFilters(filters, DEFAULTS);
    expect(readFiltersFromSearch(new URLSearchParams(query), DEFAULTS)).toEqual(filters);
  });
});
