import { describe, expect, it } from "vitest";
import { LIST_ROUTE_CONTRACTS } from "../golden/helpers/route-contract";
import { getListQueryDescriptor, LIST_QUERY_REGISTRY } from "../../lib/list-query/registry";

describe("list-query registry", () => {
  it("registers a descriptor for every frozen list route contract plus sla-vencidas", () => {
    const registered = Object.keys(LIST_QUERY_REGISTRY).sort();
    const expected = [...LIST_ROUTE_CONTRACTS.map((contract) => contract.key), "sla-vencidas"].sort();
    expect(registered).toEqual(expected);
  });

  it("reproduces each route's verified default and max page size exactly", () => {
    for (const contract of LIST_ROUTE_CONTRACTS) {
      const descriptor = getListQueryDescriptor(contract.key);
      expect({
        key: contract.key,
        defaultPageSize: descriptor.pagination.defaultPageSize,
        maxPageSize: descriptor.pagination.maxPageSize,
      }).toEqual({
        key: contract.key,
        defaultPageSize: contract.defaultPageSize,
        maxPageSize: contract.maxPageSize,
      });
    }
  });

  it("sets allowUnpaginated only where the frozen contract allows it", () => {
    for (const contract of LIST_ROUTE_CONTRACTS) {
      expect([contract.key, getListQueryDescriptor(contract.key).allowUnpaginated]).toEqual([
        contract.key,
        contract.allowUnpaginated,
      ]);
    }
  });

  it("gives every descriptor a fallback ordering so a bad sort key can never lose ordering", () => {
    for (const contract of LIST_ROUTE_CONTRACTS) {
      const descriptor = getListQueryDescriptor(contract.key);
      expect(descriptor.sort.fallbackOrderBy.length).toBeGreaterThan(0);
    }
  });

  it("keys each descriptor with its own registry key", () => {
    for (const [key, descriptor] of Object.entries(LIST_QUERY_REGISTRY)) {
      expect(descriptor.key).toBe(key);
    }
  });

  it("throws for an unknown resource key", () => {
    expect(() => getListQueryDescriptor("no-existe")).toThrow(/no-existe/);
  });
});
