import { describe, expect, it } from "vitest";
import { peelFileTags } from "@/lib/contract-image";

/**
 * SDD contrato-tarjetas-pistoleo — Phase 1, task 1.2/6.1.
 * `peelFileTags` is a pure trailing-tag peeler shared by `status-digitales`
 * batch parsing and the pending-contract upload wizard. It must recognize
 * `(zr)`, `(C)`, `(adicional N)`, and `(N)` trailing tags in any order,
 * repeatedly consuming them from the end of the filename until stable.
 */
describe("peelFileTags", () => {
  it("returns the base name untouched when no tags are present", () => {
    expect(peelFileTags("Juan Perez.jpg")).toEqual({
      base: "Juan Perez",
      isRemote: false,
      additionalIndex: 0,
      isContract: false,
    });
  });

  it("recognizes a trailing (C) contract tag", () => {
    expect(peelFileTags("Juan Perez (C).jpg")).toEqual({
      base: "Juan Perez",
      isRemote: false,
      additionalIndex: 0,
      isContract: true,
    });
  });

  it("peels (adicional N) then (C) regardless of order — adicional first", () => {
    expect(peelFileTags("Juan Perez (adicional 2) (C).jpg")).toEqual({
      base: "Juan Perez",
      isRemote: false,
      additionalIndex: 2,
      isContract: true,
    });
  });

  it("peels (C) then (adicional N) — contract tag first", () => {
    expect(peelFileTags("Juan Perez (C) (adicional 2).jpg")).toEqual({
      base: "Juan Perez",
      isRemote: false,
      additionalIndex: 2,
      isContract: true,
    });
  });

  it("does not confuse a digit-only copy suffix (N) with the non-numeric (C) tag", () => {
    expect(peelFileTags("Juan Perez (C) (1).jpg")).toEqual({
      base: "Juan Perez",
      isRemote: false,
      additionalIndex: 0,
      isContract: true,
    });
  });

  it("peels a remote (zr) tag alongside (C)", () => {
    expect(peelFileTags("Juan Perez (zr) (C).jpg")).toEqual({
      base: "Juan Perez",
      isRemote: true,
      additionalIndex: 0,
      isContract: true,
    });
  });

  it("is case-insensitive on the (C) marker", () => {
    expect(peelFileTags("Juan Perez (c).jpg")).toEqual({
      base: "Juan Perez",
      isRemote: false,
      additionalIndex: 0,
      isContract: true,
    });
  });
});
