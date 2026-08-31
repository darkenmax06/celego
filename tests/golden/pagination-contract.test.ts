import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LIST_ROUTE_CONTRACTS } from "./helpers/route-contract";
import { getListQueryDescriptor } from "../../lib/list-query/registry";

const repoRoot = process.cwd();

function readRoute(file: string): string {
  return readFileSync(path.join(repoRoot, file), "utf8");
}

// Collapses newlines/indentation so a multi-line ternary matches the same anchor
// as its single-line twin. The literals themselves are never normalized away.
function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

const legacy = LIST_ROUTE_CONTRACTS.filter((contract) => !contract.migrated);
const migrated = LIST_ROUTE_CONTRACTS.filter((contract) => contract.migrated);

describe("frozen pagination contract of the nine list routes", () => {
  /**
   * The default/max VALUES in `LIST_ROUTE_CONTRACTS` were transcribed from the
   * pre-migration route sources and are the independent anchor. This assertion
   * is what keeps the suite from degenerating into a tautology once a route no
   * longer carries its literals inline: the numbers still have to match a table
   * written before `lib/list-query` existed.
   */
  it.each(LIST_ROUTE_CONTRACTS.map((contract) => [contract.key, contract] as const))(
    "%s descriptor reproduces the page sizes transcribed from the original route",
    (_key, contract) => {
      const descriptor = getListQueryDescriptor(contract.key);
      expect(descriptor.pagination).toEqual({
        defaultPageSize: contract.defaultPageSize,
        maxPageSize: contract.maxPageSize,
      });
    },
  );

  it("has no route left on the legacy inline pagination form", () => {
    // Tasks 10.1 and 10.7 closed the last two. Kept as an explicit assertion so
    // the loop below can never pass by iterating over nothing.
    expect(legacy.map((contract) => contract.key)).toEqual([]);
  });

  it.each(legacy.map((contract) => [contract.key, contract] as const))(
    "%s (not yet migrated) still reads its page/pageSize params exactly as recorded",
    (_key, contract) => {
      const source = normalize(readRoute(contract.file));

      expect(source).toContain(`searchParams.get("page") ?? "1"`);
      expect(source).toContain(`searchParams.get("pageSize") ?? "${contract.defaultPageSize}"`);
      expect(source).toContain(
        "Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1",
      );
      expect(source).toContain(
        `Number.isFinite(pageSizeRaw) ? Math.min(${contract.maxPageSize}, Math.max(1, Math.trunc(pageSizeRaw))) : ${contract.defaultPageSize}`,
      );
      expect(source).toContain("Math.max(1, Math.ceil(total / pageSize))");
      expect(source).toContain("skip: (page - 1) * pageSize");
      expect(source).toContain("take: pageSize");
    },
  );

  it.each(migrated.map((contract) => [contract.key, contract] as const))(
    "%s (migrated) derives pagination from its descriptor and keeps no inline literals",
    (_key, contract) => {
      const source = normalize(readRoute(contract.file));

      expect(source).toContain(contract.descriptorSymbol);
      expect(source).toContain(`compile(${contract.descriptorSymbol}`);
      expect(source).toContain("buildListEnvelope(");
      // Drift guard: a migrated route must not quietly grow its own clamp again.
      expect(source).not.toContain("Math.trunc(pageSizeRaw)");
      expect(source).not.toContain("Math.ceil(total / pageSize)");
      expect(source).not.toContain("skip: (page - 1) * pageSize");
      // Strengthened in lockstep with tasks 10.1 / 10.7: with every route now
      // migrated the legacy loop above no longer covers anything, so the exact
      // literals it used to anchor are asserted ABSENT here instead.
      expect(source).not.toContain(`searchParams.get("page") ?? "1"`);
      expect(source).not.toContain(
        `Number.isFinite(pageSizeRaw) ? Math.min(${contract.maxPageSize}, Math.max(1, Math.trunc(pageSizeRaw))) : ${contract.defaultPageSize}`,
      );
    },
  );

  it.each(migrated.map((contract) => [contract.key, contract] as const))(
    "%s slices its page in the database unless it merges sources",
    (_key, contract) => {
      const source = normalize(readRoute(contract.file));
      const inMemorySlice = "rows.slice((page - 1) * pageSize, page * pageSize)";

      if (contract.mergePaginatesInMemory) {
        // operativo/contacto's `urgentes` tab merges cards with unresolved
        // urgent cases. Replacing this slice with a Prisma skip/take would
        // change WHICH rows come back, so it must survive the migration.
        expect(source).toContain(inMemorySlice);
      } else {
        expect(source).not.toContain(inMemorySlice);
      }
    },
  );

  it.each(LIST_ROUTE_CONTRACTS.map((contract) => [contract.key, contract] as const))(
    "%s still returns its recorded envelope keys",
    (_key, contract) => {
      const source = normalize(readRoute(contract.file));
      for (const key of contract.envelopeKeys.filter((key) => key !== "pagination")) {
        expect(source).toMatch(new RegExp(`\\b${key}[,:]`));
      }
      expect(source).toContain("pagination");
    },
  );

  it("covers exactly the nine list routes named in the change scope", () => {
    expect(LIST_ROUTE_CONTRACTS.map((contract) => contract.key)).toEqual([
      "tarjetas",
      "rutas",
      "mensajeros",
      "redacciones",
      "lotes",
      "config-usuarios",
      "actividad",
      "operativo-contacto",
      "bizcochitos",
    ]);
  });

  it("records every one of the nine routes as migrated", () => {
    expect(migrated.map((contract) => contract.key)).toHaveLength(9);
  });

  it("records operativo-contacto as the only route paginating a merge in memory", () => {
    expect(
      LIST_ROUTE_CONTRACTS.filter((contract) => contract.mergePaginatesInMemory).map((c) => c.key),
    ).toEqual(["operativo-contacto"]);
  });

  it("records mensajeros as the only route hoisting its raw params", () => {
    expect(
      LIST_ROUTE_CONTRACTS.filter((contract) => contract.hoistsRawParams).map((c) => c.key),
    ).toEqual(["mensajeros"]);
  });

  it("records mensajeros as the only route allowed to answer unpaginated", () => {
    const unpaginated = LIST_ROUTE_CONTRACTS.filter((contract) => contract.allowUnpaginated);
    expect(unpaginated.map((contract) => contract.key)).toEqual(["mensajeros"]);
  });
});
