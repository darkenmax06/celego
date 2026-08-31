import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 3, tasks 3.1/3.9.
 *
 * Proves the spec's idempotency scenario: "Re-imported row for same
 * tc+cedula updates the open case, not duplicated" — the second import for
 * the same tc+cedula must call `urgentCase.update`, never `.create` again.
 */
const { urgentCaseStore, cardStore, prismaMock } = vi.hoisted(() => {
  const urgentCaseStore = new Map<string, Record<string, unknown>>();
  const cardStore = new Map<string, Record<string, unknown>>();

  const prismaMock = {
    card: {
      findMany: vi.fn(async () => [...cardStore.values()]),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const card = cardStore.get(where.id)!;
        Object.assign(card, data);
        return card;
      }),
    },
    urgentCase: {
      findFirst: vi.fn(async ({ where }: { where: { cardId: string; caseType: string; resolvedAt: null } }) => {
        for (const row of urgentCaseStore.values()) {
          if (row.cardId === where.cardId && row.caseType === where.caseType && row.resolvedAt === null) {
            return row;
          }
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `case-${urgentCaseStore.size + 1}`;
        const row = { id, ...data };
        urgentCaseStore.set(id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = urgentCaseStore.get(where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    cardStatusLog: {
      create: vi.fn(async () => undefined),
    },
  };

  return { urgentCaseStore, cardStore, prismaMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/api-session", () => ({
  requireApiSession: vi.fn(async () => ({
    session: { user: { id: "user-1" } },
  })),
}));

import { POST } from "@/app/api/importaciones/solicitudes/route";

function buildMbeFile(row: (string | number)[]) {
  const headers = [
    "NUMERO TC",
    "CEDULA",
    "NOMBRE",
    "TICKET",
    "ETAPA",
    "ANALISTA",
    "DESTINO",
    "PROVINCIA",
    "NUMERO",
    "DIRECCION",
    "LOG ACTUAL",
    "CANTIDAD DIAS",
    "FECHA A SUPLIDOR",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, row]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MBE");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new File([buffer], "solicitudes.xlsx");
}

function buildRequest(file: File) {
  const form = new FormData();
  form.set("file", file);
  return { formData: async () => form } as unknown as Request;
}

beforeEach(() => {
  urgentCaseStore.clear();
  cardStore.clear();
  vi.clearAllMocks();
});

describe("POST /api/importaciones/solicitudes — idempotency", () => {
  it("creates a SOLICITUD case on first import, then updates the same case in place on re-import", async () => {
    cardStore.set("card-1", {
      id: "card-1",
      tc: "4000000000000001",
      status: "EN_RUTA",
      urgent: false,
      dispatchDate: null,
      createdAt: new Date(),
      returnReason: null,
      customer: { cedula: "001-0000001-1" },
    });

    const row = [
      "4000000000000001",
      "001-0000001-1",
      "JUAN PEREZ",
      "T-1001",
      "EN PROCESO",
      "MARIA GOMEZ",
      "SANTO DOMINGO",
      "DISTRITO NACIONAL",
      "8091234567",
      "Calle 1",
      "PENDIENTE",
      "2",
      "",
    ];

    const firstResponse = await POST(buildRequest(buildMbeFile(row)));
    const firstBody = await firstResponse.json();
    expect(firstBody.linked).toBe(1);
    expect(prismaMock.urgentCase.create).toHaveBeenCalledTimes(1);
    expect(urgentCaseStore.size).toBe(1);

    const secondResponse = await POST(buildRequest(buildMbeFile(row)));
    const secondBody = await secondResponse.json();
    expect(secondBody.linked).toBe(1);
    expect(prismaMock.urgentCase.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.urgentCase.create).toHaveBeenCalledTimes(1);
    expect(urgentCaseStore.size).toBe(1);

    expect(cardStore.get("card-1")).toMatchObject({ urgent: true, hadSolicitud: true });
  });
});
