import { describe, expect, it } from "vitest";
import {
  buildBulkEditPayload,
  describeBulkEditChanges,
  INITIAL_BULK_EDIT_VALUES,
  type BulkEditCard,
} from "@/components/modificacion-masiva/bulk-edit-wizard-modal";

const card: BulkEditCard = {
  id: "c1",
  tc: "4111",
  provincia: "Santiago",
  zona: "Norte",
  isRemote: false,
  status: "EN_RUTA",
  customer: { nombre: "Ana", cedula: "001" },
  currentMessenger: { id: "m-ana", nombre: "Ana M" },
};

describe("bulk edit wizard helpers", () => {
  it("keeps every field by default: no changes and an empty payload", () => {
    expect(describeBulkEditChanges(card, INITIAL_BULK_EDIT_VALUES, {})).toEqual([]);
    expect(buildBulkEditPayload(["c1"], INITIAL_BULK_EDIT_VALUES)).toEqual({
      cardIds: ["c1"],
      note: "Cambio masivo por pistoleo",
    });
  });

  it("lists only fields whose value actually changes, with current and new values", () => {
    const values = {
      ...INITIAL_BULK_EDIT_VALUES,
      status: "RETORNADA",
      returnReason: "Cliente rechazo",
      provincia: "Santiago",
      remote: "YES",
      messengerId: "m-luis",
    };
    expect(describeBulkEditChanges(card, values, { "m-luis": "Luis" })).toEqual([
      { label: "Estado", from: "EN_RUTA", to: "RETORNADA" },
      { label: "Remota", from: "NO", to: "SI" },
      { label: "Motivo de devolución", from: "-", to: "Cliente rechazo" },
      { label: "Mensajero", from: "Ana M", to: "Luis" },
    ]);
    expect(buildBulkEditPayload(["c1"], values)).toEqual({
      cardIds: ["c1"],
      note: "Cambio masivo por pistoleo",
      status: "RETORNADA",
      provincia: "Santiago",
      isRemote: true,
      returnReason: "Cliente rechazo",
      messengerId: "m-luis",
    });
  });

  it("sends a null messenger when the assignment is removed", () => {
    const values = { ...INITIAL_BULK_EDIT_VALUES, messengerId: "NONE" };
    expect(buildBulkEditPayload(["c1"], values)).toMatchObject({ messengerId: null });
    expect(describeBulkEditChanges(card, values, {})).toEqual([
      { label: "Mensajero", from: "Ana M", to: "Sin mensajero" },
    ]);
  });
});
