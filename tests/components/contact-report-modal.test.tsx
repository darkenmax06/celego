import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildContactReportUrl, ContactReportModal } from "@/components/llamadas/contact-report-modal";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("buildContactReportUrl", () => {
  it("defaults to contacted cards and omits ALL canal / not-mine", () => {
    expect(
      buildContactReportUrl({
        from: "2026-10-01",
        to: "2026-10-15",
        resultado: "CONTACTADA",
        canal: "ALL",
        onlyMine: false,
        format: "xlsx",
      }),
    ).toBe("/api/llamadas/reporte-contactos?from=2026-10-01&to=2026-10-15&format=xlsx&resultado=CONTACTADA");
  });

  it("adds canal and asignado=ME", () => {
    const url = new URL(
      buildContactReportUrl({
        from: "2026-10-01",
        to: "2026-10-02",
        resultado: "ALL",
        canal: "WHATSAPP",
        onlyMine: true,
        format: "csv",
      }),
      "http://x",
    );
    expect(url.searchParams.get("resultado")).toBe("ALL");
    expect(url.searchParams.get("canal")).toBe("WHATSAPP");
    expect(url.searchParams.get("asignado")).toBe("ME");
    expect(url.searchParams.get("format")).toBe("csv");
  });
});

describe("ContactReportModal", () => {
  it("requests the report with the chosen filters", async () => {
    fetchMock.mockResolvedValue(new Response("a,b", { status: 200 }));
    render(<ContactReportModal onClose={vi.fn()} defaultOnlyMine />);

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Resultado" }), { target: { value: "ALL" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Canal" }), { target: { value: "LLAMADA_DIRECTA" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Formato" }), { target: { value: "csv" } });
    fireEvent.click(screen.getByRole("button", { name: "Descargar reporte" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/llamadas/reporte-contactos?from=2026-10-01&to=2026-10-03&format=csv&resultado=ALL&canal=LLAMADA_DIRECTA&asignado=ME",
    );
  });

  it("blocks an inverted date range", () => {
    render(<ContactReportModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-01" } });
    expect(screen.getByRole("button", { name: "Descargar reporte" })).toBeDisabled();
  });

  it("offers the daily ZIP only when a handler is given", () => {
    const onZip = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ContactReportModal onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Generar ZIP operativo" })).not.toBeInTheDocument();
    rerender(<ContactReportModal onClose={vi.fn()} onExportDailyZip={onZip} />);
    fireEvent.click(screen.getByRole("button", { name: "Generar ZIP operativo" }));
    expect(onZip).toHaveBeenCalledTimes(1);
  });
});
