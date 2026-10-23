// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationalCardPicker } from "../../components/cards/operational-card-picker";

afterEach(() => vi.restoreAllMocks());

describe("OperationalCardPicker", () => {
  it("restores scanner focus after resolving a card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { kind: "NO_ENCONTRADA" } }),
    }));
    let value = "123";
    render(
      <OperationalCardPicker value={value} onValueChange={(next) => { value = next; }} onCardSelected={() => undefined} />,
    );
    const input = screen.getByRole("textbox", { name: "Buscar tarjeta operativa" });
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).toBe(input));
  });
});
