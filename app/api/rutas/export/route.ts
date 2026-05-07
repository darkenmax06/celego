import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireApiSession } from "@/lib/api-session";
import { addBusinessDaysStrict } from "@/lib/sla";
import { prisma } from "@/lib/prisma";

function parsePhones(raw: string | null | undefined) {
  if (!raw) return "";
  const phones = raw.match(/\d{7,}/g) ?? [];
  return [...new Set(phones)].join(" / ");
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-DO");
}

function fileHeaders(filename: string, contentType: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const routeId = request.nextUrl.searchParams.get("routeId");
  const format = (request.nextUrl.searchParams.get("format") ?? "pdf").toLowerCase();

  if (!routeId) {
    return NextResponse.json({ error: "routeId es requerido" }, { status: 400 });
  }

  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: {
      messenger: true,
      items: {
        include: {
          card: {
            include: { customer: true },
          },
        },
        orderBy: { sequence: "asc" },
      },
    },
  });

  if (!route) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }

  const slaConfig = await prisma.sLAConfig.findUnique({ where: { id: "default" } });
  const baseSlaDays = slaConfig?.businessDays ?? 5;

  const lotLabel = route.id.slice(-6).toUpperCase();
  const returnDate = route.items.length
    ? route.items.reduce((max, item) => {
        const due = item.card.slaDueDate ?? addBusinessDaysStrict(item.card.dispatchDate ?? route.fecha, baseSlaDays);
        return due > max ? due : max;
      }, new Date(0))
    : addBusinessDaysStrict(route.fecha, baseSlaDays);
  const returnDateForMessenger = new Date(returnDate);
  returnDateForMessenger.setDate(returnDateForMessenger.getDate() - 1);

  const rows = route.items.map((item, index) => ({
    no: index + 1,
    tc: item.card.tc,
    nombre: item.card.customer.nombre,
    cedula: item.card.customer.cedula,
    telefonos: parsePhones(item.card.customer.telefonosRaw),
    devuelta: "\u2610",
  }));

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("LOTE");

    sheet.addRow([`LOTE ${lotLabel}`]);
    sheet.addRow([`Mensajero: ${route.messenger.nombre}`]);
    sheet.addRow([`Fecha ruta: ${formatDate(route.fecha)}`]);
    sheet.addRow([]);
    sheet.addRow(["NO", "NUMERO TC", "NOMBRE", "CEDULA", "TELEFONOS", "DEVUELTA"]);

    rows.forEach((row) => {
      sheet.addRow([row.no, row.tc, row.nombre, row.cedula, row.telefonos, row.devuelta]);
    });

    sheet.addRow([]);
    sheet.addRow([`Fecha limite de devolucion del lote: ${formatDate(returnDateForMessenger)}`]);

    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.getRow(2).font = { bold: true };
    sheet.getRow(5).font = { bold: true };
    sheet.columns = [
      { width: 8 },
      { width: 24 },
      { width: 32 },
      { width: 18 },
      { width: 24 },
      { width: 14 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buffer), {
      headers: fileHeaders(
        `ruta-lote-${lotLabel}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    });
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText(`LOTE ${lotLabel}`, {
    x: 40,
    y: 760,
    size: 18,
    font: bold,
    color: rgb(0.1, 0.15, 0.3),
  });
  page.drawText(`Mensajero: ${route.messenger.nombre}`, { x: 40, y: 740, size: 10, font });
  page.drawText(`Fecha ruta: ${formatDate(route.fecha)}`, { x: 40, y: 726, size: 10, font });

  const headers = ["NO", "TC", "NOMBRE", "CEDULA", "TELEFONOS", "DEVUELTA"];
  const x = [40, 66, 156, 306, 394, 540];

  let y = 700;
  headers.forEach((header, index) => {
    page.drawText(header, { x: x[index], y, size: 8, font: bold, color: rgb(0.25, 0.25, 0.25) });
  });

  y -= 12;
  for (const row of rows.slice(0, 42)) {
    page.drawText(String(row.no), { x: x[0], y, size: 8, font });
    page.drawText(row.tc.slice(0, 16), { x: x[1], y, size: 8, font });
    page.drawText(row.nombre.slice(0, 24), { x: x[2], y, size: 8, font });
    page.drawText(row.cedula.slice(0, 13), { x: x[3], y, size: 8, font });
    page.drawText(row.telefonos.slice(0, 20), { x: x[4], y, size: 8, font });
    page.drawRectangle({
      x: x[5] + 6,
      y: y + 1,
      width: 7,
      height: 7,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.7,
    });
    y -= 12;
    if (y < 80) break;
  }

  page.drawText(`Fecha limite de devolucion del lote: ${formatDate(returnDateForMessenger)}`, {
    x: 40,
    y: 48,
    size: 11,
    font: bold,
    color: rgb(0.2, 0.2, 0.2),
  });

  const pdfBytes = await pdf.save();
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: fileHeaders(`ruta-lote-${lotLabel}.pdf`, "application/pdf"),
  });
}
