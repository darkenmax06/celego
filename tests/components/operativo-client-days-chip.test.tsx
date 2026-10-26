import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `days` SLA horizon (default "3") is only applied by the activos branch of
 * GET /api/operativo/contacto. On the other tabs it is ignored server-side, so
 * its chip must not show there (it used to render the raw "days: 3").
 */

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => navigation,
  usePathname: () => "/operativo",
}));

vi.mock("@/components/operativo/operative-contact-wizard", () => ({
  OperativeContactWizard: () => null,
}));

vi.mock("@/components/operativo/sla-extension-requests-table", () => ({
  SLAExtensionRequestsTable: () => null,
}));

import OperativoClient from "@/app/(protected)/operativo/operativo-client";

const fetchMock = vi.fn(async (url: string) => {
  if (url.startsWith("/api/card-groups")) return { ok: true, json: async () => ({ groups: [] }) };
  if (url.startsWith("/api/config/provincias")) return { ok: true, json: async () => ({ provincias: [] }) };
  if (url.startsWith("/api/operativo/urgencias")) return { ok: true, json: async () => ({ notifications: [] }) };
  return {
    ok: true,
    json: async () => ({ cards: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 }, filters: [], values: [] }),
  };
});

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

describe("OperativoClient — SLA days chip", () => {
  it("labels the days chip as 'Días SLA: 3' on the activos tab", async () => {
    render(<OperativoClient role="ADMIN" />);
    expect(await screen.findByText("Días SLA: 3")).toBeInTheDocument();
    expect(screen.queryByText(/^days/)).not.toBeInTheDocument();
  });

  it("hides the days chip on tabs where the server ignores it", async () => {
    render(<OperativoClient role="ADMIN" />);
    await screen.findByText("Días SLA: 3");
    fireEvent.click(screen.getByTitle("Abrir menú de filtros, agrupaciones y favoritos"));
    fireEvent.click(screen.getByRole("button", { name: "Contactadas" }));
    await waitFor(() => expect(screen.getByText("Vista: Contactadas")).toBeInTheDocument());
    expect(screen.queryByText(/^days/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Días SLA/)).not.toBeInTheDocument();
  });
});
