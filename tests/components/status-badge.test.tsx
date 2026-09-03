import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/ui/status-badge";

/**
 * SDD solicitudes-reclamaciones-urgentes — Phase 1, task 1.3/1.8.
 *
 * `EN_PROCESO_DE_RETORNO` gets its own label/colour case instead of falling
 * back to the default slate badge.
 */
describe("StatusBadge — EN_PROCESO_DE_RETORNO", () => {
  it("renders a human-readable label", () => {
    render(<StatusBadge value="EN_PROCESO_DE_RETORNO" />);
    expect(screen.getByText("EN PROCESO DE RETORNO")).toBeInTheDocument();
  });

  it("sets the title attribute to the same human-readable label", () => {
    render(<StatusBadge value="EN_PROCESO_DE_RETORNO" />);
    expect(screen.getByTitle("EN PROCESO DE RETORNO")).toBeInTheDocument();
  });
});
