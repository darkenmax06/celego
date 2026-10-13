import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IssueSections, type IssueSection } from "@/components/importacion/card-import-panels";

afterEach(cleanup);

const section: IssueSection = {
  title: "Omitidas",
  visible: 3,
  lines: Array.from({ length: 8 }, (_, index) => `Fila ${index + 2}: ya existe`),
};

describe("IssueSections", () => {
  it("shows the first lines and expands to every case on demand", () => {
    render(<IssueSections sections={[section]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Omitidas (8):")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver los 5 restantes" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText("• Fila 9: ya existe")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver menos" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("offers no toggle when everything already fits", () => {
    render(<IssueSections sections={[{ ...section, visible: 12 }]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
