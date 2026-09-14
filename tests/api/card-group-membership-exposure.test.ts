import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Card group membership exposure on the three card list endpoints.
 *
 * `/tarjetas`, `/sla-vencidas` and `/operativo/contacto` must all return the
 * group ids a card belongs to, shaped exactly like the shipped precedent in
 * `app/api/urgentes/route.ts` (`groupMemberships: { select: { groupId: true } }`),
 * and surface them on every response row under the single field name
 * `groupIds`. `/operativo/contacto` builds three independent `include` blocks
 * — one per tab family — so each one is asserted separately: a client that can
 * group by "Grupo" on one tab and not another is the defect these guard.
 */
const { capturedFindManyArgs, prismaMock, cardFixtures } = vi.hoisted(() => {
  const capturedFindManyArgs: Array<Record<string, unknown>> = [];

  const cardFixtures: Array<Record<string, unknown>> = [];

  const prismaMock = {
    card: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        capturedFindManyArgs.push(args);
        return cardFixtures;
      }),
      count: vi.fn(async () => cardFixtures.length),
    },
    urgentCase: {
      findMany: vi.fn(async () => []),
    },
    messenger: {
      findMany: vi.fn(async () => []),
    },
  };
  return { capturedFindManyArgs, prismaMock, cardFixtures };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    session: { user: { id: "user-1", role: "ADMIN" } },
  })),
}));
vi.mock("@/lib/urgent-alerts", () => ({
  emitDueUrgentNotifications: vi.fn(async () => undefined),
  clampUrgencyLevel: (value: unknown) => value,
  urgencyIntervalMinutes: () => 60,
  urgencyLevelLabel: () => "",
}));

import { GET as tarjetasRoute } from "@/app/api/tarjetas/route";
import { GET as slaRoute } from "@/app/api/sla-vencidas/route";
import { GET as operativoRoute } from "@/app/api/operativo/contacto/route";

/** The route handlers, narrowed to the `Response` they actually always return. */
type ListHandler = (request: never) => Promise<Response>;
const tarjetasGET = tarjetasRoute as ListHandler;
const slaGET = slaRoute as ListHandler;
const operativoGET = operativoRoute as ListHandler;

/** Minimal `NextRequest` stand-in: the handlers only read `nextUrl.searchParams`. */
function req(path: string, query = "") {
  const url = new URL(`http://localhost${path}${query ? `?${query}` : ""}`);
  return { nextUrl: url, url: url.toString() } as never;
}

/** The exact selection shape every card list endpoint must request. */
const GROUP_MEMBERSHIP_SELECTION = { select: { groupId: true } };

function cardFixture(groupIds: string[]): Record<string, unknown> {
  return {
    id: "card-1",
    tc: "4111",
    requestNumber: null,
    externalReference: null,
    provincia: "SANTO DOMINGO",
    zona: "Z1",
    status: "EN_RUTA",
    urgent: false,
    isRemote: false,
    isAdditional: false,
    additionalIndex: 0,
    dispatchOrigin: "TORRE_POPULAR",
    dispatchDate: null,
    deliveryType: null,
    emissionType: null,
    slaDueDate: null,
    // `contactado` keeps the fixture visible on the operativo "contactadas"
    // tab, which filters the mapped rows in memory.
    metadata: { operativo: { contactado: true } },
    customer: {
      nombre: "Ada Lovelace",
      cedula: "001",
      direccionRaw: null,
      telefonosRaw: null,
    },
    currentMessenger: null,
    contacts: [],
    urgentCases: [],
    groupMemberships: groupIds.map((groupId) => ({ groupId })),
  };
}

function setFixtures(groupIds: string[]) {
  cardFixtures.length = 0;
  cardFixtures.push(cardFixture(groupIds));
}

/** Every `groupMemberships` node requested anywhere in a findMany argument. */
function collectMembershipSelections(node: unknown, found: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) collectMembershipSelections(item, found);
    return found;
  }
  const record = node as Record<string, unknown>;
  if ("groupMemberships" in record) found.push(record.groupMemberships);
  for (const value of Object.values(record)) collectMembershipSelections(value, found);
  return found;
}

beforeEach(() => {
  capturedFindManyArgs.length = 0;
  vi.clearAllMocks();
  setFixtures(["g1", "g2"]);
});

describe("GET /api/tarjetas exposes card group membership", () => {
  it("requests the bare group ids with the shipped selection shape", async () => {
    await tarjetasGET(req("/api/tarjetas"));

    const include = capturedFindManyArgs[0]?.include as Record<string, unknown>;
    expect(include.groupMemberships).toEqual(GROUP_MEMBERSHIP_SELECTION);
  });

  it("surfaces the ids on each row as groupIds and drops the raw relation", async () => {
    const response = await tarjetasGET(req("/api/tarjetas"));
    const body = await response.json();

    expect(body.cards[0].groupIds).toEqual(["g1", "g2"]);
    expect(body.cards[0]).not.toHaveProperty("groupMemberships");
  });

  it("returns an empty array for a card that belongs to no group", async () => {
    setFixtures([]);
    const response = await tarjetasGET(req("/api/tarjetas"));
    const body = await response.json();

    expect(body.cards[0].groupIds).toEqual([]);
  });
});

describe("GET /api/sla-vencidas exposes card group membership", () => {
  it("adds the relation explicitly to its select", async () => {
    await slaGET(req("/api/sla-vencidas"));

    const cardCall = capturedFindManyArgs.find((args) => "select" in args);
    const select = cardCall?.select as Record<string, unknown>;
    expect(select.groupMemberships).toEqual(GROUP_MEMBERSHIP_SELECTION);
  });

  it("surfaces the ids on each row as groupIds", async () => {
    const response = await slaGET(req("/api/sla-vencidas"));
    const body = await response.json();

    expect(body.rows[0].groupIds).toEqual(["g1", "g2"]);
  });
});

describe("GET /api/operativo/contacto exposes card group membership on every tab", () => {
  const tabs = ["activos", "contactadas", "urgentes"] as const;

  it.each(tabs)("requests the group ids on the %s tab", async (tab) => {
    await operativoGET(req("/api/operativo/contacto", `tab=${tab}`));

    const selections = capturedFindManyArgs.flatMap((args) =>
      collectMembershipSelections(args.include),
    );
    expect(selections).toContainEqual(GROUP_MEMBERSHIP_SELECTION);
  });

  it.each(tabs)("surfaces the ids as groupIds on the %s tab rows", async (tab) => {
    const response = await operativoGET(req("/api/operativo/contacto", `tab=${tab}`));
    const body = await response.json();

    expect(body.cards.length).toBeGreaterThan(0);
    for (const row of body.cards) {
      expect(row.groupIds).toEqual(["g1", "g2"]);
    }
  });
});
