import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OperativeContactWizard,
  type OperativeWizardCard,
  type WizardSavePayload,
  type WizardSaveResult,
} from "@/components/operativo/operative-contact-wizard";

function buildCard(): OperativeWizardCard {
  return {
    id: "card-1",
    cardId: "card-1",
    tc: "4000000000000001",
    requestNumber: null,
    nombre: "Ana Pérez",
    cedula: "001-0000000-1",
    provincia: "SANTIAGO",
    zona: "Norte",
    status: "EN_RUTA",
    urgent: false,
    direcciones: ["Calle 1"],
    refs: [],
    mensajero: "Sin asignar",
    telefonos: [
      { num: "8095551111", principal: true, funciona: false, comentario: "", estado: "APAGADO" },
      { num: "8095552222", principal: false, funciona: false, comentario: "", estado: "" },
    ],
  } as OperativeWizardCard;
}

type SaveFn = (payload: WizardSavePayload) => Promise<WizardSaveResult>;

function renderWizard(onSave = vi.fn<SaveFn>(async () => null)) {
  render(
    <OperativeContactWizard
      card={buildCard()}
      index={0}
      total={3}
      operatorName="Operador Uno"
      onClose={vi.fn()}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  );
});

describe("OperativeContactWizard — no contact confirmation", () => {
  it("shows 'n de total' in the header", () => {
    renderWizard();
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
  });

  it("lists phones missing estado/nota and blocks the confirmation until complete", async () => {
    const onSave = renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Marcar No Contactada" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(/Falta estado o nota en: 8095552222/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Confirmar no contactada" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Nota del número 8095552222" }), {
      target: { value: "Suena ocupado" },
    });
    fireEvent.change(within(dialog).getByLabelText("Comentario adicional"), {
      target: { value: "Intentado dos veces" },
    });

    expect(within(dialog).queryByText(/Falta estado o nota/)).not.toBeInTheDocument();
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.contactado).toBe(false);
    expect(payload.motivoNoContacto).toBe("Intentado dos veces");
    expect(payload.telefonosDetalle).toEqual([
      { numero: "8095551111", estado: "APAGADO", nota: null },
      { numero: "8095552222", estado: null, nota: "Suena ocupado" },
    ]);
  });

  it("keeps the confirmation open and shows the API error", async () => {
    renderWizard(vi.fn<SaveFn>(async () => "Todos los números deben tener un estado o nota"));

    fireEvent.click(screen.getByRole("button", { name: "Marcar No Contactada" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Estado del número 8095552222" }), {
      target: { value: "NO_CONTESTA" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar no contactada" }));

    expect(await within(dialog).findByText("Todos los números deben tener un estado o nota")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sends telefonosDetalle when marking as contacted", async () => {
    const onSave = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /Marcar Contactada/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      contactado: true,
      telefonosDetalle: [
        { numero: "8095551111", estado: "APAGADO", nota: null },
        { numero: "8095552222", estado: null, nota: null },
      ],
    });
  });
});
