import { describe, expect, it } from "vitest";
import { LIST_ROUTE_CONTRACTS } from "./helpers/route-contract";
import { buildGoldenEnvelope, resolvePagination } from "./helpers/envelope";

// Each case is a raw query string, exactly as it would arrive on the wire.
const QUERY_CASES = [
  "",
  "?page=1",
  "?pageSize=1",
  "?page=2&pageSize=10",
  "?page=0&pageSize=0",
  "?page=-5&pageSize=-5",
  "?page=abc&pageSize=abc",
  "?page=2.9&pageSize=10.9",
  "?page=99999&pageSize=99999",
] as const;

const TOTAL_CASES = [0, 1, 7, 250] as const;

describe("golden envelopes for the nine list routes", () => {
  it.each(LIST_ROUTE_CONTRACTS.map((contract) => [contract.key, contract] as const))(
    "%s pagination resolution is frozen",
    (key, contract) => {
      const rows = QUERY_CASES.map((query) => ({
        query: query || "(no params)",
        ...resolvePagination(contract, new URLSearchParams(query)),
      }));
      expect({ route: key, file: contract.file, rows }).toMatchSnapshot();
    },
  );

  it.each(LIST_ROUTE_CONTRACTS.map((contract) => [contract.key, contract] as const))(
    "%s envelope shape is frozen",
    (key, contract) => {
      const rows = TOTAL_CASES.map((total) => ({
        total,
        envelope: buildGoldenEnvelope(contract, new URLSearchParams("?page=2&pageSize=7"), total),
      }));
      expect({ route: key, rows }).toMatchSnapshot();
    },
  );

  it("keeps the verified per-route default/max pairs", () => {
    expect(
      Object.fromEntries(
        LIST_ROUTE_CONTRACTS.map((contract) => [
          contract.key,
          `${contract.defaultPageSize}/${contract.maxPageSize}`,
        ]),
      ),
    ).toEqual({
      tarjetas: "25/200",
      rutas: "20/100",
      mensajeros: "25/100",
      redacciones: "20/100",
      lotes: "20/100",
      "config-usuarios": "20/100",
      actividad: "25/100",
      "operativo-contacto": "25/100",
      bizcochitos: "15/50",
    });
  });

  it("clamps an over-max pageSize instead of erroring", () => {
    for (const contract of LIST_ROUTE_CONTRACTS) {
      const resolved = resolvePagination(contract, new URLSearchParams("?pageSize=100000"));
      expect(resolved.pageSize).toBe(contract.maxPageSize);
    }
  });

  it("never emits totalPages below 1", () => {
    for (const contract of LIST_ROUTE_CONTRACTS) {
      const envelope = buildGoldenEnvelope(contract, new URLSearchParams("?page=1"), 0) as {
        pagination: { totalPages: number };
      };
      expect(envelope.pagination.totalPages).toBe(1);
    }
  });
});
