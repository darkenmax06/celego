import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OperativeContactWizard,
  type OperativeWizardCard,
  type WizardSavePayload,
  type WizardSaveResult,
} from "@/components/operativo/operative-contact-wizard";
import {
  CONTACTED_CALL_CHANNEL_REQUIRED_MESSAGE,
  CONTACTED_CALL_PHONE_REQUIRED_MESSAGE,
} from "@/lib/contact-call-shared";

const copyMock = vi.hoisted(() => vi.fn<(text: string) => Promise<boolean>>());
vi.mock("@/lib/clipboard", () => ({ copyTextToClipboard: copyMock }));

function buildCard(overrides: Partial<OperativeWizardCard> = {}): OperativeWizardCard {
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
    direcciones: ["Calle 1"],
    refs: [],
    mensajero: "Sin asignar",
    telefonos: [
      { num: "8095551111", principal: true, funciona: false, comentario: "", estado: "" },
      { num: "5551234", principal: false, funciona: false, comentario: "", estado: "" },
    ],
    ...overrides,
  } as OperativeWizardCard;
}

type SaveFn = (payload: WizardSavePayload) => Promise<WizardSaveResult>;

function renderWizard(card = buildCard(), onSave = vi.fn<SaveFn>(async () => null)) {
  render(
    <OperativeContactWizard
      card={card}
      index={0}
      total={1}
      onClose={vi.fn()}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
}

const WA_TEMPLATE = "Hola {{name}} & familia";
const SPEECH_TEMPLATE = "SPEECH para {{name}}";

beforeEach(() => {
  copyMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ config: { scriptText: SPEECH_TEMPLATE, whatsappText: WA_TEMPLATE } }),
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

async function openWhatsAppTab() {
  await screen.findByText(/SPEECH para Ana Pérez/);
  const tab = screen
    .getAllByRole("button", { name: "WhatsApp" })
    .find((button) => !button.hasAttribute("aria-pressed"))!;
  fireEvent.click(tab);
}

describe("OperativeContactWizard calls UX", () => {
  it("lists client phones formatted in the first column", () => {
    renderWizard();
    const block = screen.getByTestId("client-phones");
    expect(within(block).getByText("809-555-1111")).toBeInTheDocument();
    expect(within(block).getByText("5551234")).toBeInTheDocument();
  });

  it("updates the phone list from live edits", () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText("Número 2"), { target: { value: "8295559999" } });
    expect(within(screen.getByTestId("client-phones")).getByText("829-555-9999")).toBeInTheDocument();
  });

  it("disables Marcar Contactada with a phone hint, then a channel hint", () => {
    renderWizard();
    const button = screen.getByRole("button", { name: /Marcar Contactada/ });
    expect(button).toBeDisabled();
    expect(screen.getByText(CONTACTED_CALL_PHONE_REQUIRED_MESSAGE)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(button).toBeDisabled();
    expect(screen.getByText(CONTACTED_CALL_CHANNEL_REQUIRED_MESSAGE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "WhatsApp", pressed: false }));
    expect(button).toBeEnabled();
    expect(screen.queryByText(CONTACTED_CALL_CHANNEL_REQUIRED_MESSAGE)).not.toBeInTheDocument();
  });

  it("does not accept a working phone with fewer than 7 digits", () => {
    renderWizard(buildCard({ telefonos: [{ num: "123", principal: true, funciona: true }] }));
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp", pressed: false }));
    expect(screen.getByRole("button", { name: /Marcar Contactada/ })).toBeDisabled();
  });

  it("deselects the channel when the active button is clicked again", () => {
    renderWizard();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    const whatsapp = screen.getByRole("button", { name: "WhatsApp", pressed: false });
    fireEvent.click(whatsapp);
    expect(whatsapp).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(whatsapp);
    expect(whatsapp).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Marcar Contactada/ })).toBeDisabled();
  });

  it("copies the message and shows success feedback", async () => {
    copyMock.mockResolvedValue(true);
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /Copiar mensaje/ }));
    expect(await screen.findByText("Copiado!")).toBeInTheDocument();
    expect(copyMock).toHaveBeenCalledTimes(1);
  });

  it("shows failure feedback when the copy fails", async () => {
    copyMock.mockResolvedValue(false);
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /Copiar mensaje/ }));
    expect(await screen.findByText("No se pudo copiar el mensaje")).toBeInTheDocument();
  });

  it("builds wa.me links from the WhatsApp template while on the WhatsApp tab", async () => {
    renderWizard();
    await openWhatsAppTab();
    const links = await screen.findAllByRole("link", { name: /Contactar/ });
    expect(links).toHaveLength(1);
    const href = links[0].getAttribute("href")!;
    expect(href.startsWith("https://wa.me/18095551111?text=")).toBe(true);
    expect(decodeURIComponent(href.split("?text=")[1])).toBe("Hola Ana Pérez & familia");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a disabled button with a visible reason for non-convertible numbers", async () => {
    renderWizard();
    await openWhatsAppTab();
    const disabled = await screen.findByRole("button", { name: /Contactar/ });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute("title", "Falta el código de área");
    expect(screen.getByText("Falta el código de área")).toBeInTheDocument();
  });

  it("sends the save once the rule passes", async () => {
    const onSave = renderWizard();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp", pressed: false }));
    fireEvent.click(screen.getByRole("button", { name: /Marcar Contactada/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ contactado: true, canalContacto: "WHATSAPP" });
  });
});
