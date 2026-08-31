import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SDD change `rutas-lotes-redesign` — Slice 4b (task 4.7).
 *
 * `app/(protected)/rutas/rutas-client.tsx` is a large client component with
 * heavy SWR/session/workflow-draft wiring; rendering it fully via RTL to
 * exercise `requestReturnReason`'s async call sites is out of proportion for
 * this batch's scope (Slice 7a is where the modal itself gets extracted and
 * becomes independently testable). Instead this is a static, source-level
 * guard: it proves every invocation of `requestReturnReason(...)` /
 * `onRequireReturnReason(...)` (excluding the definition, prop-type
 * declarations, and pass-down wiring) is preceded by `await`. This is the
 * single most common bug class for a sync->async conversion — forgetting an
 * `await` at one of several call sites — and this test fails loudly if it
 * happens.
 *
 * Complementary to (not a replacement for) `npx tsc --noEmit`: once
 * `requestReturnReason` returns `Promise<string | null>`, a genuinely
 * un-awaited call site also fails to type-check (the resulting `Promise` is
 * not assignable to the `string | undefined` `comentario` parameter) — this
 * test additionally documents which lines that compile-time proof covers.
 */

const SOURCE_PATH = path.join(
  process.cwd(),
  "app",
  "(protected)",
  "rutas",
  "rutas-client.tsx",
);

const source = readFileSync(SOURCE_PATH, "utf-8");
const lines = source.split("\n");

describe("rutas-client.tsx — onRequireReturnReason/requestReturnReason async call sites", () => {
  it("calls window.prompt exactly once (code, not comments), inside requestReturnReason's interim Promise.resolve wrap", () => {
    const promptCallLines = lines.filter(
      (line) => /window\.prompt\(/.test(line) && !line.trim().startsWith("//"),
    );
    expect(promptCallLines).toHaveLength(1);

    const wrapStart = lines.findIndex((line) => /const promptValue = await Promise\.resolve\(/.test(line));
    expect(wrapStart).toBeGreaterThanOrEqual(0);
    expect(lines[wrapStart + 1]).toMatch(/window\.prompt\(/);
  });

  it("declares requestReturnReason as an async function returning Promise<string | null>", () => {
    const definitionLine = lines.find((line) => /function requestReturnReason\(/.test(line));
    expect(definitionLine).toBeDefined();
    expect(definitionLine).toMatch(/^\s*async function requestReturnReason\(/);
  });

  it("every direct requestReturnReason(...) invocation (excluding its own definition) is awaited", () => {
    const invocationLines = lines.filter((line) => {
      if (!/requestReturnReason\(/.test(line)) return false;
      if (/function requestReturnReason\(/.test(line)) return false; // definition itself
      if (/onRequireReturnReason=\{requestReturnReason\}/.test(line)) return false; // prop pass-down, not a call
      return true;
    });

    expect(invocationLines.length).toBeGreaterThanOrEqual(1);
    for (const line of invocationLines) {
      expect(line).toMatch(/await requestReturnReason\(/);
    }
  });

  it("every onRequireReturnReason(...) invocation inside the modals is awaited", () => {
    const invocationLines = lines.filter((line) => {
      if (!/onRequireReturnReason\(/.test(line)) return false;
      if (/onRequireReturnReason=\{/.test(line)) return false; // prop pass-down
      if (/onRequireReturnReason:/.test(line)) return false; // prop destructure / type decl
      return true;
    });

    expect(invocationLines.length).toBeGreaterThanOrEqual(1);
    for (const line of invocationLines) {
      expect(line).toMatch(/await onRequireReturnReason\(/);
    }
  });

  it("declares the onRequireReturnReason prop type as returning Promise<string | null> on both modals", () => {
    const typeLines = lines.filter((line) => /onRequireReturnReason:\s*\(/.test(line));
    expect(typeLines).toHaveLength(2);
    for (const line of typeLines) {
      expect(line).toMatch(/=>\s*Promise<string \| null>/);
    }
  });
});
