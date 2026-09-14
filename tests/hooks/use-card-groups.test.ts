import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SDD card-groups — Work Unit E, Task 13. RED against the missing
 * `@/lib/use-card-groups` module.
 *
 * Fetches `GET /api/card-groups` on mount; `reload()` refetches. No SWR layer
 * exists in this codebase (design decision) — freshness after a mutation is
 * the caller's responsibility via explicit `reload()`.
 */
import { useCardGroups } from "@/lib/use-card-groups";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ groups: [{ id: "group-1", name: "Grupo A", _count: { members: 3 } }] }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("useCardGroups", () => {
  it("fetches groups on mount", async () => {
    const { result } = renderHook(() => useCardGroups());

    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    expect(result.current.groups[0].name).toBe("Grupo A");
    expect(fetchMock).toHaveBeenCalledWith("/api/card-groups");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reload() refetches", async () => {
    const { result } = renderHook(() => useCardGroups());
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        groups: [
          { id: "group-1", name: "Grupo A", _count: { members: 3 } },
          { id: "group-2", name: "Grupo B", _count: { members: 0 } },
        ],
      }),
    });

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.groups).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
