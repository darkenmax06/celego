import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * SDD card-groups — Work Unit E, Task 11. RED against the missing
 * `@/lib/use-card-selection` module.
 *
 * Product decision 1: selection MUST survive both a filter change (simulated
 * here as unrelated re-renders — the hook holds no filter state at all, so a
 * filter change literally cannot affect it) AND a full remount, because it is
 * backed by `usePersistentState` (localStorage), like `selectedCardId`
 * (`tarjetas-client.tsx:272`).
 */
import { useCardSelection } from "@/lib/use-card-selection";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useCardSelection", () => {
  it("starts empty", async () => {
    const { result } = renderHook(() => useCardSelection());
    await waitFor(() => expect(result.current.count).toBe(0));
    expect(result.current.ids).toEqual([]);
    expect(result.current.isSelected("card-1")).toBe(false);
  });

  it("toggles a card in and out of the selection", async () => {
    const { result } = renderHook(() => useCardSelection());
    await waitFor(() => expect(result.current.count).toBe(0));

    act(() => result.current.toggle("card-1"));
    expect(result.current.isSelected("card-1")).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle("card-1"));
    expect(result.current.isSelected("card-1")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("selectMany adds a whole page's ids without duplicating existing ones", async () => {
    const { result } = renderHook(() => useCardSelection());
    await waitFor(() => expect(result.current.count).toBe(0));

    act(() => result.current.toggle("card-1"));
    act(() => result.current.selectMany(["card-1", "card-2", "card-3"]));

    expect(result.current.count).toBe(3);
    expect(new Set(result.current.ids)).toEqual(new Set(["card-1", "card-2", "card-3"]));
  });

  it("clear empties the selection", async () => {
    const { result } = renderHook(() => useCardSelection());
    await waitFor(() => expect(result.current.count).toBe(0));

    act(() => result.current.selectMany(["card-1", "card-2"]));
    expect(result.current.count).toBe(2);

    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("survives a remount (persisted to localStorage, like selectedCardId)", async () => {
    const first = renderHook(() => useCardSelection());
    await waitFor(() => expect(first.result.current.count).toBe(0));
    act(() => first.result.current.selectMany(["card-1", "card-2"]));
    await waitFor(() => {
      expect(window.localStorage.getItem("celego:workspace:v1:tarjetas:card-selection")).not.toBeNull();
    });
    first.unmount();

    const second = renderHook(() => useCardSelection());
    await waitFor(() => expect(second.result.current.count).toBe(2));
    expect(new Set(second.result.current.ids)).toEqual(new Set(["card-1", "card-2"]));
  });

  it("survives an unrelated re-render (a filter change cannot reset it — the hook holds no filter state)", async () => {
    const { result, rerender } = renderHook(() => useCardSelection());
    await waitFor(() => expect(result.current.count).toBe(0));
    act(() => result.current.selectMany(["card-1"]));

    rerender();

    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("card-1")).toBe(true);
  });
});
