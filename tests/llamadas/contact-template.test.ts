import { describe, expect, it } from "vitest";
import {
  buildContactTemplateContext,
  CONTACT_TEMPLATE_VARIABLES,
  DEFAULT_SCRIPT_TEXT,
  renderContactTemplate,
} from "@/lib/contact-template";

describe("renderContactTemplate", () => {
  it("keeps every legacy variable in the catalog", () => {
    const keys = CONTACT_TEMPLATE_VARIABLES.map((v) => v.key as string);
    for (const legacy of [
      "{{name}}",
      "{{cedula}}",
      "{{tc}}",
      "{{provincia}}",
      "{{zona}}",
      "{{direccion}}",
      "{{mensajero}}",
      "{{solicitud}}",
      "{{telefono_principal}}",
    ]) {
      expect(keys).toContain(legacy);
    }
  });

  it("replaces all occurrences and leaves unknown placeholders untouched", () => {
    expect(renderContactTemplate("{{name}} / {{name}} {{desconocido}}", { name: "Ana" })).toBe(
      "Ana / Ana {{desconocido}}",
    );
  });

  it("uses Spanish fallbacks for empty values", () => {
    expect(renderContactTemplate("{{fecha_entrega}} | {{mensajero}} | {{direccion}}", {})).toBe(
      "Sin fecha específica | Sin asignar | No especificada",
    );
  });

  it("renders the full context built from card data", () => {
    const ctx = buildContactTemplateContext({
      nombre: "María José Pérez",
      cedula: "001-0000000-1",
      tc: "1234",
      provincia: "Santiago",
      zona: "Norte",
      direccion: "Calle 1",
      nuevaDireccion: "Calle Nueva 5",
      mensajero: "Pedro",
      mensajeroTelefono: "8095550000",
      telefonos: ["8095551111", "8295552222"],
      operador: "Operador Uno",
      canalContacto: "WHATSAPP",
      fechaPreferenciaEntrega: "2026-10-20",
      slaDueDate: "2026-10-25T00:00:00.000Z",
      productType: "DEBITO",
      grupos: ["Lote A"],
      today: new Date(2026, 9, 15),
    });
    const text = renderContactTemplate(
      "{{nombre_corto}}|{{direccion}}|{{nueva_direccion}}|{{tipo_tarjeta}}|{{canal}}|{{fecha_entrega}}|{{fecha_sla}}|{{fecha_hoy}}|{{telefonos}}|{{telefono_principal}}|{{operador}}|{{mensajero_telefono}}|{{grupo}}",
      ctx,
    );
    expect(text).toBe(
      "María|Calle Nueva 5|Calle Nueva 5|Débito|WhatsApp|20/10/2026|25/10/2026|15/10/2026|8095551111, 8295552222|8095551111|Operador Uno|8095550000|Lote A",
    );
  });

  it("renders the default script without leftover known placeholders", () => {
    const rendered = renderContactTemplate(DEFAULT_SCRIPT_TEXT, {
      name: "Ana",
      tc: "1",
      cedula: "2",
      provincia: "P",
    });
    expect(rendered).not.toMatch(/\{\{(name|tc|cedula|provincia|direccion)\}\}/);
  });
});
