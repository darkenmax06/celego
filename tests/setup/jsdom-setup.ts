import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// First jsdom/component test landed in Slice 2 (route-progress-panel).
// React Testing Library's cleanup isn't wired automatically without
// `test.globals`, so every jsdom test gets it via this setup file instead of
// repeating an `afterEach(cleanup)` per test file.
afterEach(cleanup);
