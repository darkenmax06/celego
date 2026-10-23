import { describe, expect, it } from "vitest";
import { buildAsignadoWhere, toAsignadoA } from "@/lib/call-assignment";

describe("buildAsignadoWhere", () => {
  it("returns no constraint for empty / ALL", () => {
    expect(buildAsignadoWhere(null, "u1")).toBeUndefined();
    expect(buildAsignadoWhere("", "u1")).toBeUndefined();
    expect(buildAsignadoWhere("ALL", "u1")).toBeUndefined();
  });

  it("ME resolves to the session user", () => {
    expect(buildAsignadoWhere("ME", "u1")).toEqual({ callAssignment: { is: { assignedToId: "u1" } } });
  });

  it("SIN_ASIGNAR selects cards without assignment", () => {
    expect(buildAsignadoWhere("SIN_ASIGNAR", "u1")).toEqual({ callAssignment: { is: null } });
  });

  it("any other value is treated as a user id", () => {
    expect(buildAsignadoWhere(" u2 ", "u1")).toEqual({ callAssignment: { is: { assignedToId: "u2" } } });
  });
});

describe("toAsignadoA", () => {
  it("projects the assignee or null", () => {
    expect(toAsignadoA(null)).toBeNull();
    expect(toAsignadoA({ assignedTo: { id: "u1", name: "Ana" } })).toEqual({ id: "u1", name: "Ana" });
  });
});
