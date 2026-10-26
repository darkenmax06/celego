import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

import { Sidebar } from "@/components/layout/sidebar";

describe("Sidebar", () => {
  it("hides Flota and Piloto movil even when allowed", () => {
    render(
      <Sidebar
        allowedModules={["dashboard", "flota", "piloto_movil", "operativo"] as never}
        userName="Admin"
        roleLabel="ADMIN"
      />,
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Operativo")).toBeInTheDocument();
    expect(screen.queryByText("Flota")).not.toBeInTheDocument();
    expect(screen.queryByText("Piloto movil")).not.toBeInTheDocument();
  });
});
