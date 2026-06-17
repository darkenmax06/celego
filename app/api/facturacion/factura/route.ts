import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { CardStatus } from "@prisma/client";
import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-session";
import { dedupeBillingCardsByCustomerAndDispatchDate } from "@/lib/billing";
import { resolveBillableZone } from "@/lib/delivery-location";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

const schema = z.object({
  from: z.string(),
  to: z.string(),
  fxRate: z.coerce.number().positive(),
  invoiceNumber: z.string().min(1),
  ncf: z.string().min(1),
  issueDate: z.string().optional(),
  clientName: z.string().optional(),
  rnc: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  purchaseOrder: z.string().optional(),
  representative: z.string().optional(),
  fob: z.string().optional(),
  paymentTerms: z.string().optional(),
});

type TariffRange = { minQty: number; maxQty: number | null; centsPerCard: number };

type DrawTextInput = {
  x: number;
  y: number;
  width: number;
  text: string;
  size?: number;
  align?: "left" | "right";
  bold?: boolean;
};

type DrawRightTextInput = {
  right: number;
  y: number;
  text: string;
  size?: number;
  bold?: boolean;
};

function resolveCentsPerCard(
  count: number,
  baseCents: number,
  ranges: TariffRange[],
) {
  const match = ranges.find(
    (range) => count >= range.minQty && (range.maxQty == null || count <= range.maxQty),
  );
  return match?.centsPerCard ?? baseCents;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInvoiceDate(raw: string | undefined) {
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function drawField(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  input: DrawTextInput,
) {
  const font = input.bold ? fonts.bold : fonts.regular;
  const size = input.size ?? 8.264325;
  const text = input.text ?? "";

  const textWidth = font.widthOfTextAtSize(text, size);
  const x =
    input.align === "right"
      ? Math.max(input.x, input.x + input.width - textWidth)
      : input.x;

  page.drawText(text, {
    x,
    y: input.y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawRightField(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  input: DrawRightTextInput,
) {
  const font = input.bold ? fonts.bold : fonts.regular;
  const size = input.size ?? 8.264325;
  const text = input.text ?? "";
  const textWidth = font.widthOfTextAtSize(text, size);

  page.drawText(text, {
    x: input.right - textWidth,
    y: input.y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["ADMIN", "FACTURACION", "OPERADOR"]);
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido para factura" }, { status: 400 });
  }

  const fromDate = new Date(parsed.data.from);
  const toDate = new Date(parsed.data.to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Rango de fechas invalido" }, { status: 400 });
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: "La fecha inicial no puede ser mayor que la final" }, { status: 400 });
  }
  toDate.setHours(23, 59, 59, 999);

  const [cards, tariffs] = await Promise.all([
    prisma.card.findMany({
      where: {
        status: CardStatus.ENTREGADA,
        dispatchDate: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        zona: true,
        provincia: true,
        reassignedProvince: true,
        reassignedZone: true,
        isRemote: true,
        dispatchDate: true,
        customer: {
          select: {
            cedula: true,
          },
        },
      },
      take: 5000,
    }),
    prisma.zoneTariff.findMany({ where: { active: true }, include: { ranges: true } }),
  ]);

  const billableCards = dedupeBillingCardsByCustomerAndDispatchDate(
    cards.map((card) => ({
      id: card.id,
      zona: resolveBillableZone(card),
      isRemote: card.isRemote,
      dispatchDate: card.dispatchDate,
      customerCedula: card.customer.cedula,
    })),
  );

  if (!billableCards.length) {
    return NextResponse.json({ error: "No hay entregas en el periodo seleccionado" }, { status: 404 });
  }

  const grouped = new Map<string, number>();
  for (const card of billableCards) {
    grouped.set(card.zona, (grouped.get(card.zona) ?? 0) + 1);
  }

  const tariffMap = new Map(tariffs.map((item) => [item.zona, item]));
  const zonesOrder = ["Metro", "Este", "Norte", "Sur"];
  const items = Array.from(grouped.entries())
    .sort(([a], [b]) => {
      const ai = zonesOrder.indexOf(a);
      const bi = zonesOrder.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    })
    .map(([zona, qty]) => {
      const tariff = tariffMap.get(zona);
      const unitUsdCents = resolveCentsPerCard(qty, tariff?.baseCents ?? 0, tariff?.ranges ?? []);
      return {
        zona,
        qty,
        isRemoteSurcharge: false,
        unitUsdCents,
        totalUsdCents: unitUsdCents * qty,
      };
    });

  const remoteCount = billableCards.filter((card) => card.isRemote).length;
  if (remoteCount > 0) {
    const remoteTariff = tariffMap.get("REMOTA");
    const remoteSurchargeCents = resolveCentsPerCard(
      remoteCount,
      remoteTariff?.baseCents ?? 0,
      remoteTariff?.ranges ?? [],
    );
    items.push({
      zona: "REMOTA",
      qty: remoteCount,
      isRemoteSurcharge: true,
      unitUsdCents: remoteSurchargeCents,
      totalUsdCents: remoteSurchargeCents * remoteCount,
    });
  }

  if (items.length > 18) {
    return NextResponse.json(
      { error: "La factura excede el espacio de la plantilla. Reduce el periodo o genera varias facturas." },
      { status: 400 },
    );
  }

  const totalUsdCents = items.reduce((acc, row) => acc + row.totalUsdCents, 0);
  const totalDopCents = Math.round(totalUsdCents * parsed.data.fxRate);

  const templatePath = path.join(process.cwd(), "docs", "excels", "Factura Template Blank.pdf");
  let templateBytes: Buffer;
  try {
    templateBytes = await fs.readFile(templatePath);
  } catch {
    return NextResponse.json(
      { error: "No se encontro la plantilla de factura en el servidor" },
      { status: 500 },
    );
  }
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPage(0);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  drawField(page, { regular, bold }, {
    x: 464.8,
    y: 630.34,
    width: 86,
    text: parsed.data.invoiceNumber,
    size: 8.264325,
    bold: true,
  });

  drawField(page, { regular, bold }, {
    x: 111.5,
    y: 555.58,
    width: 250,
    text: parsed.data.clientName?.trim() || "BANCO POPULAR DOMINICANO S.A",
    bold: true,
  });
  drawField(page, { regular, bold }, {
    x: 464.8,
    y: 555.58,
    width: 120,
    text: formatInvoiceDate(parsed.data.issueDate),
  });
  drawField(page, { regular, bold }, {
    x: 111.5,
    y: 545.35,
    width: 170,
    text: parsed.data.rnc?.trim() || "",
  });
  drawField(page, { regular, bold }, {
    x: 464.8,
    y: 545.35,
    width: 120,
    text: parsed.data.purchaseOrder?.trim() || "",
  });
  drawField(page, { regular, bold }, {
    x: 111.5,
    y: 535.15,
    width: 80,
    text: parsed.data.city?.trim() || "Santo Domingo",
  });
  drawField(page, { regular, bold }, {
    x: 231.15,
    y: 535.15,
    width: 130,
    text: parsed.data.state?.trim() || "D.N.",
  });
  drawField(page, { regular, bold }, {
    x: 420,
    y: 535.15,
    width: 145,
    text: parsed.data.representative?.trim() || "",
  });
  drawField(page, { regular, bold }, {
    x: 111.5,
    y: 524.95,
    width: 235,
    text: parsed.data.ncf,
    bold: true,
  });
  drawField(page, { regular, bold }, {
    x: 443,
    y: 524.95,
    width: 122,
    text: parsed.data.fob?.trim() || "",
  });

  const rowStartY = 494.35;
  const rowStep = 10.2;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const y = rowStartY - index * rowStep;
    drawField(page, { regular, bold }, {
      x: 70.5,
      y,
      width: 36,
      text: String(item.qty),
      align: "right",
    });
    drawField(page, { regular, bold }, {
      x: 111.6,
      y,
      width: 245,
      text: `Transporte tarjetas masivas zona ${item.isRemoteSurcharge ? "remota" : item.zona}`,
    });
    drawField(page, { regular, bold }, {
      x: 420,
      y,
      width: 42,
      text: `${formatAmount(item.unitUsdCents / 100)} $`,
      align: "right",
    });
    drawField(page, { regular, bold }, {
      x: 492,
      y,
      width: 58,
      text: `${formatAmount(item.totalUsdCents / 100)} $`,
      align: "right",
    });
  }

  drawField(page, { regular, bold }, {
    x: 419.28,
    y: 234.12,
    width: 75,
    text: "Total Usd$",
  });
  drawField(page, { regular, bold }, {
    x: 415.68,
    y: 222.12,
    width: 75,
    text: "Tasa dolar$",
  });
  drawField(page, { regular, bold }, {
    x: 440.76,
    y: 211.44,
    width: 45,
    text: "ITBIS",
  });
  drawField(page, { regular, bold }, {
    x: 525.96,
    y: 211.44,
    width: 45,
    text: "exento",
  });
  drawField(page, { regular, bold }, {
    x: 411,
    y: 201.24,
    width: 70,
    text: "Total en RD$",
  });

  drawField(page, { regular, bold }, {
    x: 111.5,
    y: 201.24,
    width: 170,
    text: parsed.data.paymentTerms?.trim() || "Credito 30 dias.",
  });

  const totalsRightEdge = 550.6;
  drawRightField(page, { regular, bold }, {
    right: totalsRightEdge,
    y: 234.12,
    text: formatAmount(totalUsdCents / 100),
    size: 9.94,
    bold: true,
  });
  drawRightField(page, { regular, bold }, {
    right: totalsRightEdge,
    y: 222.12,
    text: formatAmount(parsed.data.fxRate),
    size: 9.94,
    bold: true,
  });
  drawRightField(page, { regular, bold }, {
    right: totalsRightEdge,
    y: 201.24,
    text: formatAmount(totalDopCents / 100),
    bold: true,
  });

  const pdfBytes = await pdf.save();
  const safeInvoice = parsed.data.invoiceNumber.replace(/[^\w.-]+/g, "_");
  await writeAuditEvent({
    entity: "BILLING_EXPORT",
    entityId: parsed.data.invoiceNumber,
    action: "EXPORT_INVOICE",
    userId: auth.session.user.id,
    details: {
      from: parsed.data.from,
      to: parsed.data.to,
      invoiceNumber: parsed.data.invoiceNumber,
      billableCards: billableCards.length,
      totalUsdCents,
      totalDopCents,
    },
    request,
  });
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="factura-${safeInvoice}.pdf"`,
    },
  });
}
