import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "@/lib/clipboard";

function stubDocument(execCommand: () => boolean) {
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    select: vi.fn(),
  };
  const body = { appendChild: vi.fn(), removeChild: vi.fn() };
  vi.stubGlobal("document", {
    createElement: vi.fn(() => textarea),
    body,
    execCommand: vi.fn(execCommand),
  });
  return { textarea, body, doc: (globalThis as unknown as { document: { execCommand: unknown } }).document };
}

describe("copyTextToClipboard", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the async clipboard API when available", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyTextToClipboard("hola")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hola");
  });

  it("falls back to execCommand when the API rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    const { body } = stubDocument(() => true);
    await expect(copyTextToClipboard("hola")).resolves.toBe(true);
    expect(body.removeChild).toHaveBeenCalledTimes(1);
  });

  it("falls back to execCommand when the API is absent", async () => {
    const { textarea, body } = stubDocument(() => true);
    await expect(copyTextToClipboard("hola")).resolves.toBe(true);
    expect(textarea.value).toBe("hola");
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });

  it("returns false and removes the textarea when execCommand returns false", async () => {
    const { body } = stubDocument(() => false);
    await expect(copyTextToClipboard("hola")).resolves.toBe(false);
    expect(body.removeChild).toHaveBeenCalledTimes(1);
  });

  it("returns false without throwing when execCommand throws", async () => {
    const { body } = stubDocument(() => {
      throw new Error("boom");
    });
    await expect(copyTextToClipboard("hola")).resolves.toBe(false);
    expect(body.removeChild).toHaveBeenCalledTimes(1);
  });
});
