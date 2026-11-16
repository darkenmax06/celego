import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  messengerReport: { findUnique: vi.fn() },
  requireApiSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/api-session", () => ({ requireApiSession: db.requireApiSession }));

import { GET } from "@/app/api/mensajeros/reportes/[id]/imagen/route";

let storageDir: string;
const IMAGE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const imagePath = "messenger-reports/cmessenger00001/cperiod0000001.jpg";

async function get(id = "rep-1") {
  return (await GET(new Request(`http://localhost/api/mensajeros/reportes/${id}/imagen`), { params: Promise.resolve({ id }) })) as Response;
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: "rep-1",
    imagePath,
    fromDate: new Date("2026-10-01T00:00:00.000Z"),
    toDate: new Date("2026-10-15T00:00:00.000Z"),
    messenger: { nombre: "Ana Perez" },
    payrollPeriod: { label: "Quincena 1" },
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  storageDir = await mkdtemp(path.join(os.tmpdir(), "celego-report-route-"));
  process.env.APP_STORAGE_DIR = storageDir;
  db.requireApiSession.mockResolvedValue({ session: { user: { id: "user-1", role: "OPERADOR" } } });
});

afterEach(async () => {
  delete process.env.APP_STORAGE_DIR;
  await rm(storageDir, { recursive: true, force: true });
});

describe("GET /api/mensajeros/reportes/[id]/imagen", () => {
  it("uses the same roles as the report generator and stops on an auth error", async () => {
    db.requireApiSession.mockResolvedValue({ error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) });

    const response = await get();

    expect(db.requireApiSession).toHaveBeenCalledWith(["ADMIN", "OPERADOR", "FACTURACION"]);
    expect(response.status).toBe(403);
    expect(db.messengerReport.findUnique).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown report or one without a stored image", async () => {
    db.messengerReport.findUnique.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);

    db.messengerReport.findUnique.mockResolvedValueOnce(report({ imagePath: null }));
    expect((await get()).status).toBe(404);
  });

  it("answers 404 when the stored file is gone", async () => {
    db.messengerReport.findUnique.mockResolvedValue(report());

    const response = await get();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/ya no esta disponible/);
  });

  it("refuses an image path outside the storage dir", async () => {
    db.messengerReport.findUnique.mockResolvedValue(report({ imagePath: "../../etc/passwd" }));

    expect((await get()).status).toBe(404);
  });

  it("streams the stored JPEG as an attachment", async () => {
    db.messengerReport.findUnique.mockResolvedValue(report());
    await mkdir(path.dirname(path.join(storageDir, imagePath)), { recursive: true });
    await writeFile(path.join(storageDir, imagePath), IMAGE);

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="pago-Ana_Perez-Quincena_1.jpg"');
    expect(Buffer.from(await response.arrayBuffer()).equals(IMAGE)).toBe(true);
  });
});
