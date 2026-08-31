import { vi } from "vitest";

/**
 * Handler-level golden harness (task 16.5 — the originally planned 1.1).
 *
 * Phase 1 could not build this: route handlers import through `@/lib/...` and
 * the repository had no `vitest.config.*`, so the `@` alias did not resolve and
 * a route module could not be imported at all. With `vitest.config.ts` in place
 * the handlers are importable, so `where` / `include` / `select` / `orderBy` /
 * `skip` / `take` can be asserted from a REAL execution instead of from source.
 */

type AnyFn = ReturnType<typeof vi.fn>;

export type PrismaMock = Record<string, Record<string, AnyFn>> & {
  __reset(): void;
};

/**
 * Lazily materializes `prisma.<model>.<method>` as a `vi.fn()`.
 *
 * Every method defaults to resolving `undefined`; a test that reads the result
 * must set it explicitly, which keeps accidental implicit fixtures impossible.
 */
export function createPrismaMock(): PrismaMock {
  const models = new Map<string, Record<string, AnyFn>>();

  const model = (name: string) => {
    const existing = models.get(name);
    if (existing) return existing;
    const methods = new Map<string, AnyFn>();
    const proxy = new Proxy({} as Record<string, AnyFn>, {
      get(_target, method) {
        if (typeof method !== "string") return undefined;
        let fn = methods.get(method);
        if (!fn) {
          fn = vi.fn(async () => undefined);
          methods.set(method, fn);
        }
        return fn;
      },
      has: () => true,
    });
    models.set(name, proxy);
    return proxy;
  };

  return new Proxy({} as PrismaMock, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop === "__reset") return () => models.clear();
      return model(prop);
    },
    has: () => true,
  }) as PrismaMock;
}

/** A stored row. Only `id` is required; everything else is test-supplied. */
export type StoreRow = Record<string, unknown> & { id: string };

export type TransactionalPrismaMock = PrismaMock & {
  /** Puts a row into the backing store, replacing any row with the same id. */
  __seed(model: string, row: StoreRow): void;
  /** Reads a row back FROM THE STORE — never from a reference a handler held. */
  __row(model: string, id: string): StoreRow | undefined;
  __rows(model: string): StoreRow[];
};

/**
 * A `$transaction`-aware Prisma mock with real rollback semantics (task 16.6).
 *
 * `createPrismaMock()` above is stateless: every method is an isolated spy, so a
 * handler that wrote outside its transaction would look identical to one that
 * wrote inside it. This variant keeps a mutable row store and snapshots it
 * before entering `$transaction`; if the callback rejects, the store is restored
 * and the rejection is rethrown. A write that escaped the transaction therefore
 * survives the restore and the assertion catches it.
 *
 * Deliberately NOT a Prisma engine: `findMany` does not evaluate `where`. Tests
 * seed exactly the rows they mean to observe.
 */
export function createTransactionalPrismaMock(): TransactionalPrismaMock {
  let store = new Map<string, Map<string, StoreRow>>();

  const table = (name: string) => {
    let rows = store.get(name);
    if (!rows) {
      rows = new Map<string, StoreRow>();
      store.set(name, rows);
    }
    return rows;
  };

  const snapshot = () =>
    new Map(
      [...store].map(([name, rows]) => [
        name,
        new Map([...rows].map(([id, row]) => [id, structuredClone(row)])),
      ]),
    );

  const models = new Map<string, Record<string, AnyFn>>();
  let created = 0;

  const buildModel = (name: string): Record<string, AnyFn> => {
    const rowOf = (where: unknown) => {
      const id = (where as { id?: string } | undefined)?.id;
      return id === undefined ? undefined : table(name).get(id);
    };

    // Simple equality matcher for `updateMany` claim/where clauses (e.g. the
    // optimistic-lock claim pattern in `app/api/status-digitales/route.ts`).
    // Only supports scalar/Date/null equality — no `{ in: [...] }` or other
    // Prisma filter operators, since none of the current callers need them.
    const matchesWhere = (row: StoreRow, where: Record<string, unknown>): boolean =>
      Object.entries(where).every(([key, expected]) => {
        const actual = row[key];
        if (expected instanceof Date) {
          return actual instanceof Date ? actual.getTime() === expected.getTime() : actual === expected;
        }
        return actual === expected;
      });

    const defaults: Record<string, AnyFn> = {
      findUnique: vi.fn(async ({ where }: { where: unknown }) => rowOf(where) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: unknown }) => {
        const row = rowOf(where);
        if (!row) throw new Error(`${name}.findUniqueOrThrow: no row for ${JSON.stringify(where)}`);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: unknown }) => rowOf(where) ?? null),
      findMany: vi.fn(async () => [...table(name).values()]),
      count: vi.fn(async () => table(name).size),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created += 1;
        const row = { id: String(data.id ?? `${name}-${created}`), ...data } as StoreRow;
        table(name).set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
        const row = rowOf(where);
        if (!row) throw new Error(`${name}.update: no row for ${JSON.stringify(where)}`);
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const rows = [...table(name).values()].filter((row) => matchesWhere(row, where));
          for (const row of rows) Object.assign(row, data);
          return { count: rows.length };
        },
      ),
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        for (const entry of data) {
          created += 1;
          const row = { id: String(entry.id ?? `${name}-${created}`), ...entry } as StoreRow;
          table(name).set(row.id, row);
        }
        return { count: data.length };
      }),
      delete: vi.fn(async ({ where }: { where: unknown }) => {
        const row = rowOf(where);
        if (row) table(name).delete(row.id);
        return row ?? null;
      }),
    };

    const extra = new Map<string, AnyFn>();
    return new Proxy(defaults, {
      get(target, method) {
        if (typeof method !== "string") return undefined;
        if (method in target) return target[method];
        let fn = extra.get(method);
        if (!fn) {
          fn = vi.fn(async () => undefined);
          extra.set(method, fn);
        }
        return fn;
      },
      has: () => true,
    });
  };

  const model = (name: string) => {
    const existing = models.get(name);
    if (existing) return existing;
    const built = buildModel(name);
    models.set(name, built);
    return built;
  };

  const transaction = vi.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const before = snapshot();
    try {
      return await (arg as (tx: unknown) => Promise<unknown>)(client);
    } catch (error) {
      store = before;
      throw error;
    }
  });

  const client = new Proxy({} as TransactionalPrismaMock, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      switch (prop) {
        case "$transaction":
          return transaction;
        case "__reset":
          return () => {
            store = new Map();
            models.clear();
            created = 0;
          };
        case "__seed":
          return (name: string, row: StoreRow) => table(name).set(row.id, row);
        case "__row":
          return (name: string, id: string) => table(name).get(id);
        case "__rows":
          return (name: string) => [...table(name).values()];
        default:
          return model(prop);
      }
    },
    has: () => true,
  }) as TransactionalPrismaMock;

  return client;
}

export type SessionMock = AnyFn;

/** Mirrors `requireApiSession`'s success shape: no `error` key, a `session`. */
export function createSessionMock(userId = "user-session-1"): SessionMock {
  return vi.fn(async () => ({
    session: { user: { id: userId, name: "Tester", email: "tester@example.com", role: "ADMIN" } },
    user: { id: userId, role: "ADMIN", active: true },
  }));
}

/** Reads a `NextResponse` body without depending on the route's return type. */
export async function readJson(response: unknown): Promise<Record<string, unknown>> {
  return (await (response as Response).json()) as Record<string, unknown>;
}

/** The single `findMany` argument object a handler actually passed to Prisma. */
export function firstCallArg(fn: AnyFn): Record<string, unknown> {
  const call = fn.mock.calls[0];
  if (!call) throw new Error("expected the handler to call this Prisma method");
  return call[0] as Record<string, unknown>;
}
