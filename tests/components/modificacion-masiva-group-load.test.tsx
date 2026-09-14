import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationalCard } from "@/components/cards/operational-card-picker";

/**
 * SDD card-groups — Stage D.
 *
 * `/modificacion-masiva` is a scan workbench, not a list screen. Stage D adds
 * "load a whole group into the scan table" so the operator does not have to
 * scan a known group card by card.
 *
 * The invariants under test: loaded rows are shape-identical to scanned ones
 * (so the existing `selectedCardIds` / `Aplicar cambios` / batch-status POST
 * path keeps working untouched), a card already in the table is never added
 * twice and is reported as already present, and an over-cap group states the
 * real total rather than silently truncating.
 */
let scanFixture: OperationalCard;

vi.mock("@/components/cards/operational-card-picker", () => ({
  OperationalCardPicker: (props: { onCardSelected: (card: OperationalCard) => void }) => (
    <button type="button" onClick={() => props.onCardSelected(scanFixture)}>
      pistolear-fixture
    </button>
  ),
}));

import ModificacionMasivaClient from "@/app/(protected)/modificacion-masiva/modificacion-masiva-client";

const GROUPS = [
  { id: "group-1", name: "Grupo A", _count: { members: 2 } },
  { id: "group-2", name: "Grupo B", _count: { members: 0 } },
];

function buildCard(index: number) {
  return {
    id: `card-${index}`,
    tc: `400000000000${String(index).padStart(4, "0")}`,
    provincia: "SANTIAGO",
    zona: "Norte",
    isRemote: false,
    status: "EN_RUTA",
    customer: { nombre: `Cliente ${index}`, cedula: `001-0000000-${index}` },
  };
}

type GroupPayload = {
  cards: ReturnType<typeof buildCard>[];
  total: number;
  cap: number;
  truncated: boolean;
};

let groupPayload: GroupPayload;
const batchCalls: unknown[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("/api/config/motivos-retorno")) {
    return { ok: true, json: async () => ({ motivos: [] }) } as Response;
  }
  if (url.startsWith("/api/config/provincias")) {
    return { ok: true, json: async () => ({ provincias: [] }) } as Response;
  }
  if (url.startsWith("/api/workflow-drafts")) {
    return { ok: true, json: async () => ({ draft: null }) } as Response;
  }
  if (url.startsWith("/api/card-groups/")) {
    return { ok: true, json: async () => groupPayload } as Response;
  }
  if (url.startsWith("/api/card-groups")) {
    return { ok: true, json: async () => ({ groups: GROUPS }) } as Response;
  }
  if (url.startsWith("/api/tarjetas/lote/estado")) {
    batchCalls.push(JSON.parse(String(init?.body)));
    return { ok: true, json: async () => ({ updated: 1 }) } as Response;
  }
  return { ok: false, json: async () => ({ error: "unexpected" }) } as Response;
});

async function loadGroup(name = "Grupo A") {
  const picker = await screen.findByRole("combobox", { name: "Grupo" });
  await waitFor(() =>
    expect(screen.getByRole("option", { name: new RegExp(name) })).toBeInTheDocument(),
  );
  fireEvent.change(picker, {
    target: { value: GROUPS.find((group) => group.name === name)!.id },
  });
  fireEvent.click(screen.getByRole("button", { name: "Agregar grupo a la tabla" }));
}

beforeEach(() => {
  scanFixture = {
    id: "card-1",
    tc: "4000000000000001",
    status: "EN_RUTA",
    dispatchDate: null,
    createdAt: null,
    returnReason: null,
    customer: { nombre: "Cliente 1", cedula: "001-0000000-1" },
    externalReference: null,
    dispatchOrigin: null,
    isRemote: false,
    zona: "Norte",
    provincia: "SANTIAGO",
  };
  groupPayload = { cards: [buildCard(1), buildCard(2)], total: 2, cap: 500, truncated: false };
  batchCalls.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

describe("/modificacion-masiva — load a group into the scan table", () => {
  it("adds every card of the chosen group to the table", async () => {
    render(<ModificacionMasivaClient />);
    await loadGroup();

    await waitFor(() => expect(screen.getByText("4000000000000001")).toBeInTheDocument());
    expect(screen.getByText("4000000000000002")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar cambios (2)" })).toBeInTheDocument();
    expect(
      await screen.findByText(/Se agregaron 2 tarjetas del grupo "Grupo A"/i),
    ).toBeInTheDocument();
  });

  it("appends to the current scanned set instead of replacing it", async () => {
    render(<ModificacionMasivaClient />);
    fireEvent.click(screen.getByRole("button", { name: "pistolear-fixture" }));
    await waitFor(() => expect(screen.getByText("4000000000000001")).toBeInTheDocument());

    groupPayload = { cards: [buildCard(9)], total: 1, cap: 500, truncated: false };
    await loadGroup();

    await waitFor(() => expect(screen.getByText("4000000000000009")).toBeInTheDocument());
    expect(screen.getByText("4000000000000001")).toBeInTheDocument();
  });

  it("does not add a card twice and reports how many were already in the table", async () => {
    render(<ModificacionMasivaClient />);
    fireEvent.click(screen.getByRole("button", { name: "pistolear-fixture" }));
    await waitFor(() => expect(screen.getByText("4000000000000001")).toBeInTheDocument());

    await loadGroup();

    expect(
      await screen.findByText(/Se agrego 1 tarjeta del grupo "Grupo A"\. 1 ya estaba en la tabla\./i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("4000000000000001")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Aplicar cambios (2)" })).toBeInTheDocument();
  });

  it("states the real total when the group exceeds the cap instead of truncating silently", async () => {
    groupPayload = {
      cards: [buildCard(1), buildCard(2)],
      total: 1200,
      cap: 2,
      truncated: true,
    };
    render(<ModificacionMasivaClient />);
    await loadGroup();

    const notice = await screen.findByText(
      /El grupo tiene 1200 tarjetas y solo se cargaron las primeras 2\. Las 1198 restantes no se cargaron\./i,
    );
    expect(notice).toBeInTheDocument();
  });

  it("reports an empty group without changing the table", async () => {
    groupPayload = { cards: [], total: 0, cap: 500, truncated: false };
    render(<ModificacionMasivaClient />);
    await loadGroup("Grupo B");

    expect(await screen.findByText(/El grupo "Grupo B" no tiene tarjetas/i)).toBeInTheDocument();
    expect(screen.getByText("No hay tarjetas pistoleadas.")).toBeInTheDocument();
  });

  it("asks for a group before fetching when none is chosen", async () => {
    render(<ModificacionMasivaClient />);
    await screen.findByRole("combobox", { name: "Grupo" });
    fireEvent.click(screen.getByRole("button", { name: "Agregar grupo a la tabla" }));

    expect(await screen.findByText(/Selecciona un grupo para cargar/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/card-groups/")),
    ).toHaveLength(0);
  });

  it("keeps the existing scan, select and apply flow working after a group load", async () => {
    render(<ModificacionMasivaClient />);
    await loadGroup();
    await waitFor(() => expect(screen.getByText("4000000000000002")).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("Estado: sin cambio"), {
      target: { value: "ENTREGADA" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cambios (2)" }));

    await waitFor(() => expect(batchCalls).toHaveLength(1));
    expect(batchCalls[0]).toMatchObject({
      cardIds: ["card-1", "card-2"],
      status: "ENTREGADA",
    });
  });

  it("makes the append semantics explicit in the UI copy", async () => {
    render(<ModificacionMasivaClient />);
    await screen.findByRole("combobox", { name: "Grupo" });
    expect(
      screen.getByText(/Las tarjetas del grupo se agregan a las ya pistoleadas/i),
    ).toBeInTheDocument();
  });
});
