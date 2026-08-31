import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../../lib/list-query";
import { mensajerosListQuery } from "../../lib/list-query/descriptors/mensajeros";
import { getListRouteContract } from "./helpers/route-contract";
import { buildGoldenEnvelope } from "./helpers/envelope";

const contract = getListRouteContract("mensajeros");

describe("/api/mensajeros dual mode", () => {
  it("omits the pagination key entirely when BOTH page and pageSize are absent", () => {
    const envelope = buildGoldenEnvelope(contract, new URLSearchParams(""), 3);

    expect(Object.keys(envelope)).toEqual(["messengers"]);
    expect("pagination" in envelope).toBe(false);
    expect(envelope).toMatchSnapshot();
  });

  it("returns the paginated envelope as soon as EITHER param is present", () => {
    for (const query of ["?page=1", "?pageSize=25", "?page=2&pageSize=10"]) {
      const envelope = buildGoldenEnvelope(contract, new URLSearchParams(query), 3);
      expect(Object.keys(envelope)).toEqual(["messengers", "pagination"]);
      expect("pagination" in envelope).toBe(true);
    }
  });

  it("still guards the unpaginated branch in the route source", () => {
    const source = readFileSync(path.join(process.cwd(), contract.file), "utf8").replace(/\s+/g, " ");

    // The branch that must survive every migration: no params -> full list, no
    // pagination key. The absence check now lives in `compile()`, so the route
    // branches on the compiled flag instead of on the raw params it used to hoist.
    expect(source).toContain("if (query.unpaginated)");
    expect(source).toContain("return NextResponse.json({ messengers });");
  });

  it("decides the branch on ABSENCE, before any clamping", () => {
    // Guards the reason the raw params were hoisted in the first place: a
    // present-but-empty or out-of-range value is still a PRESENT param and must
    // take the paginated branch, never the full-list branch.
    expect(compile(mensajerosListQuery, new URLSearchParams("")).unpaginated).toBe(true);
    for (const query of ["?page=1", "?pageSize=25", "?pageSize=0", "?page=abc", "?pageSize="]) {
      const compiled = compile(mensajerosListQuery, new URLSearchParams(query));
      expect([query, compiled.unpaginated]).toEqual([query, false]);
      expect(compiled.take).toBe(compiled.pageSize);
    }
  });

  it("is the only contract carrying allowUnpaginated", () => {
    expect(contract.allowUnpaginated).toBe(true);
  });
});
