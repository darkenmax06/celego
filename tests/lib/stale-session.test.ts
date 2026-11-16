import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } } }));

const getAuthSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuthSession: () => getAuthSession() }));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

import { resolveSessionUser } from "@/lib/session-user";
import { requireSession } from "@/lib/server-auth";
import { GET as logout } from "@/app/logout/route";

const session = (id: string, email = "ana@celego.local") =>
  ({ user: { id, email, role: "ADMIN" }, expires: "2099-01-01" }) as never;

beforeEach(() => {
  findUnique.mockReset();
  getAuthSession.mockReset();
  redirect.mockClear();
});

describe("resolveSessionUser", () => {
  it("returns the live user by id", async () => {
    findUnique.mockResolvedValueOnce({ id: "u1", role: "ADMIN", active: true });
    await expect(resolveSessionUser(session("u1"))).resolves.toEqual({ id: "u1", role: "ADMIN" });
  });

  it("recovers by email when the id no longer exists (DB restore)", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "u9", role: "OPERADOR", active: true });
    await expect(resolveSessionUser(session("old"))).resolves.toEqual({ id: "u9", role: "OPERADOR" });
  });

  it("returns null when the user is gone or inactive", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "u9", role: "ADMIN", active: false });
    await expect(resolveSessionUser(session("old"))).resolves.toBeNull();
  });
});

describe("requireSession", () => {
  it("redirects to /login without a session", async () => {
    getAuthSession.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /logout when the session user no longer exists", async () => {
    getAuthSession.mockResolvedValue(session("old"));
    findUnique.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("REDIRECT:/logout");
  });

  it("returns the session with the live id and role", async () => {
    getAuthSession.mockResolvedValue(session("old"));
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "u9", role: "OPERADOR", active: true });
    const result = await requireSession();
    expect(result.user.id).toBe("u9");
    expect(result.user.role).toBe("OPERADOR");
  });
});

describe("GET /logout", () => {
  it("clears next-auth cookies and redirects to the expired login", () => {
    const request = new NextRequest("http://localhost:3800/logout", {
      headers: { cookie: "next-auth.session-token=abc; next-auth.session-token.0=def; next-auth.csrf-token=x; other=keep" },
    });
    const response = logout(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3800/login?expired=1");
    const cleared = response.cookies.getAll().map((cookie) => cookie.name).sort();
    expect(cleared).toEqual(["next-auth.csrf-token", "next-auth.session-token", "next-auth.session-token.0"]);
    for (const cookie of response.cookies.getAll()) expect(cookie.value).toBe("");
  });
});
