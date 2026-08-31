import { NextRequest, NextResponse } from "next/server";
import {
  CardProductType,
  CardStatus,
  Prisma,
  RedactionStatus,
  RedactionType,
} from "@prisma/client";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireApiSession } from "@/lib/api-session";
import {
  resolveAssignedMessengerName,
  type ReassignmentEvidence,
  type RouteAssignmentEvidence,
} from "@/lib/assigned-messenger";
import { dedupeBillingCardsByCustomerAndDispatchDate } from "@/lib/billing";
import { getCardIdentifier } from "@/lib/card-identifier";
import { formatDateEs } from "@/lib/date";
import { resolveBillableZone } from "@/lib/delivery-location";
import { fromCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { exportRowsToCsv, exportRowsToPdf, exportRowsToXlsx } from "@/lib/reports/export";
import { normalizeText } from "@/lib/utils";

function fileHeaders(filename: string, contentType: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename=\"${filename}\"`,
  };
}

function utcDateKey(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveCentsPerCard(
  count: number,
  baseCents: number,
  ranges: Array<{ minQty: number; maxQty: number | null; centsPerCard: number }>,
) {
  const match = ranges.find(
    (range) => count >= range.minQty && (range.maxQty == null || count <= range.maxQty),
  );
  return match?.centsPerCard ?? baseCents;
}

function parseFxRate(raw: string | null) {
  if (!raw) return 1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

function parseProductType(raw: string | null) {
  if (raw === CardProductType.CREDITO || raw === CardProductType.DEBITO) {
    return raw;
  }
  return null;
}

function productFields(card: {
  productType: CardProductType;
  tc: string | null;
  requestNumber: string | null;
}) {
  const numeroTarjeta = card.tc ?? "";
  const numeroSolicitud = card.requestNumber ?? "";
  return {
    producto: card.productType,
    numeroTarjeta,
    numeroSolicitud,
    identificador: getCardIdentifier(card),
  };
}

type AssignmentHistory = {
  routeAssignments: RouteAssignmentEvidence[];
  reassignments: ReassignmentEvidence[];
};

type CardWithMessengerEvidence = {
  id: string;
  lastAssignedMessenger?: { id: string; nombre: string } | null;
  currentMessenger?: { id: string; nombre: string } | null;
  reassignedMessenger?: { id: string; nombre: string } | null;
  reassignedAt?: Date | null;
};

async function getAssignmentHistoryByCard(cardIds: string[]) {
  const uniqueCardIds = [...new Set(cardIds.filter(Boolean))];
  const history = new Map<string, AssignmentHistory>();
  if (!uniqueCardIds.length) return history;

  const [routeItems, reassignments] = await Promise.all([
    prisma.routeItem.findMany({
      where: { cardId: { in: uniqueCardIds } },
      select: {
        cardId: true,
        route: {
          select: {
            id: true,
            createdAt: true,
            messenger: { select: { id: true, nombre: true } },
          },
        },
      },
    }),
    prisma.cardDeliveryReassignment.findMany({
      where: { cardId: { in: uniqueCardIds } },
      select: {
        id: true,
        cardId: true,
        createdAt: true,
        toMessengerId: true,
        toMessengerName: true,
      },
    }),
  ]);

  for (const item of routeItems) {
    const current = history.get(item.cardId) ?? {
      routeAssignments: [],
      reassignments: [],
    };
    current.routeAssignments.push({
      id: item.route.id,
      assignedAt: item.route.createdAt,
      messenger: item.route.messenger,
    });
    history.set(item.cardId, current);
  }

  for (const item of reassignments) {
    const current = history.get(item.cardId) ?? {
      routeAssignments: [],
      reassignments: [],
    };
    current.reassignments.push({
      id: item.id,
      assignedAt: item.createdAt,
      messenger: { id: item.toMessengerId, nombre: item.toMessengerName },
    });
    history.set(item.cardId, current);
  }

  return history;
}

function assignedMessengerName(
  card: CardWithMessengerEvidence,
  historyByCard: Map<string, AssignmentHistory>,
) {
  const history = historyByCard.get(card.id);
  return resolveAssignedMessengerName({
    lastAssignedMessenger: card.lastAssignedMessenger,
    currentMessenger: card.currentMessenger,
    reassignedMessenger: card.reassignedMessenger,
    reassignedAt: card.reassignedAt,
    routeAssignments: history?.routeAssignments,
    reassignments: history?.reassignments,
  });
}

type LifecycleDates = {
  deliveryDate: Date | null;
  returnDate: Date | null;
};

async function getLifecycleDatesByCard(cardIds: string[]) {
  const uniqueCardIds = [...new Set(cardIds.filter(Boolean))];
  const byCard = new Map<string, LifecycleDates>();
  if (!uniqueCardIds.length) return byCard;

  const logs = await prisma.cardStatusLog.findMany({
    where: {
      cardId: { in: uniqueCardIds },
      toStatus: {
        in: [
          CardStatus.ENTREGADA,
          CardStatus.ENTREGA_DIGITAL,
          CardStatus.RETORNADA,
          CardStatus.DEVUELTA_TIENDA,
        ],
      },
    },
    select: {
      cardId: true,
      toStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  for (const log of logs) {
    const current = byCard.get(log.cardId) ?? { deliveryDate: null, returnDate: null };
    if (
      (log.toStatus === CardStatus.ENTREGADA || log.toStatus === CardStatus.ENTREGA_DIGITAL) &&
      !current.deliveryDate
    ) {
      current.deliveryDate = log.createdAt;
    }
    if (
      (log.toStatus === CardStatus.RETORNADA || log.toStatus === CardStatus.DEVUELTA_TIENDA) &&
      !current.returnDate
    ) {
      current.returnDate = log.createdAt;
    }
    byCard.set(log.cardId, current);
  }

  return byCard;
}

type RedactionExportRows = {
  retornadas: Array<{
    no: number;
    producto: string;
    numeroTc: string;
    numeroTarjeta: string;
    numeroSolicitud: string;
    identificador: string;
    nombre: string;
    cedula: string;
    adicional: string;
    adicionalNumero: number;
    fecha: string;
    comentario: string;
    provinciaReasignacion: string;
    mensajeroReasignado: string;
    mensajero: string;
  }>;
  entregadas: Array<{
    no: number;
    producto: string;
    numeroTc: string;
    numeroTarjeta: string;
    numeroSolicitud: string;
    identificador: string;
    nombre: string;
    cedula: string;
    adicional: string;
    adicionalNumero: number;
    fecha: string;
    estatus: string;
    provinciaReasignacion: string;
    mensajeroReasignado: string;
    mensajero: string;
  }>;
  zona: string;
  fecha: string;
};

async function buildRedactionExportRows(request: NextRequest): Promise<RedactionExportRows> {
  const redactionIdsRaw = request.nextUrl.searchParams.get("redactionIds");
  const redactionIds = redactionIdsRaw
    ? redactionIdsRaw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const zona = request.nextUrl.searchParams.get("zona");
  const date = request.nextUrl.searchParams.get("date");
  const productType = parseProductType(
    request.nextUrl.searchParams.get("producto") ??
      request.nextUrl.searchParams.get("productType"),
  );

  const where: Record<string, unknown> = {};
  where.status = RedactionStatus.APROBADA;
  if (redactionIds.length) {
    where.id = { in: redactionIds };
  } else {
    if (zona && zona !== "ALL") where.zona = { equals: zona, mode: "insensitive" };
    if (date) {
      const start = new Date(date);
      start.setHours(start.getHours() - 12);
      const end = new Date(start);
      end.setDate(end.getDate() + 2);
      where.fecha = { gte: start, lt: end };
    }
  }

  const redactions = await prisma.redaction.findMany({
    where,
    include: {
      items: {
        include: {
          card: {
            include: {
              customer: true,
              currentMessenger: true,
              lastAssignedMessenger: true,
              reassignedMessenger: true,
            },
          },
        },
        orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    take: 500,
  });

  const filteredByDate = date
    ? redactions.filter((red) => {
        return utcDateKey(red.fecha) === date;
      })
    : redactions;

  const filteredRedactions = zona && zona !== "ALL"
    ? filteredByDate.filter((red) => normalizeText(red.zona) === normalizeText(zona))
    : filteredByDate;

  const source = filteredRedactions.length ? filteredRedactions : redactions;
  const historyByCard = await getAssignmentHistoryByCard(
    source.flatMap((redaction) => redaction.items.map((item) => item.cardId)),
  );

  const retornadas = source
    .filter((red) => red.tipo === RedactionType.RETORNO)
    .flatMap((red) =>
      red.items
        .filter((item) => !productType || item.card.productType === productType)
        .map((item) => ({ red, item })),
    )
    .map(({ red, item }, index) => ({
      no: index + 1,
      ...productFields(item.card),
      numeroTc: item.card.tc ?? "",
      nombre: item.card.customer.nombre,
      cedula: item.card.customer.cedula,
      adicional: item.card.isAdditional ? "SI" : "NO",
      adicionalNumero: item.card.additionalIndex,
      fecha: formatDateEs(item.card.dispatchDate ?? red.fecha),
      comentario: item.comentario ?? "",
      provinciaReasignacion: item.card.reassignedProvince ?? "",
      mensajeroReasignado: item.card.reassignedMessenger?.nombre ?? "",
      mensajero: assignedMessengerName(item.card, historyByCard),
    }));

  const entregadas = source
    .filter((red) => red.tipo === RedactionType.ENTREGA)
    .flatMap((red) =>
      red.items
        .filter((item) => !productType || item.card.productType === productType)
        .map((item) => ({ red, item })),
    )
    .map(({ red, item }, index) => ({
      no: index + 1,
      ...productFields(item.card),
      numeroTc: item.card.tc ?? "",
      nombre: item.card.customer.nombre,
      cedula: item.card.customer.cedula,
      adicional: item.card.isAdditional ? "SI" : "NO",
      adicionalNumero: item.card.additionalIndex,
      fecha: formatDateEs(item.card.dispatchDate ?? red.fecha),
      estatus: "ENTREGADA",
      provinciaReasignacion: item.card.reassignedProvince ?? "",
      mensajeroReasignado: item.card.reassignedMessenger?.nombre ?? "",
      mensajero: assignedMessengerName(item.card, historyByCard),
    }));

  return {
    retornadas,
    entregadas,
    zona: zona && zona !== "ALL" ? zona : source[0]?.zona ?? "TODAS",
    fecha: date ?? formatDateEs(source[0]?.fecha ?? new Date()),
  };
}

async function exportRedactionToXlsx(rows: RedactionExportRows) {
  const workbook = new ExcelJS.Workbook();
  const baseColumns = [
    { header: "NO", key: "no", width: 8 },
    { header: "NUMERO TC", key: "numeroTc", width: 24 },
    { header: "NOMBRE", key: "nombre", width: 40 },
    { header: "CEDULA", key: "cedula", width: 18 },
    { header: "ADICIONAL", key: "adicional", width: 14 },
    { header: "NO ADICIONAL", key: "adicionalNumero", width: 16 },
    { header: "FECHA", key: "fecha", width: 14 },
  ] as const;

  const retornadas = workbook.addWorksheet("RETORNADAS");
  retornadas.addRow(["TARJETAS RETORNADAS"]);
  retornadas.addRow(["", "FECHA:", rows.fecha, "", "ZONA:", rows.zona]);
  retornadas.columns = [
    ...baseColumns.map((column) => ({ key: column.key, width: column.width })),
    { key: "comentario", width: 30 },
    { key: "provinciaReasignacion", width: 24 },
    { key: "mensajeroReasignado", width: 28 },
    { key: "producto", width: 14 },
    { key: "numeroSolicitud", width: 24 },
    { key: "identificador", width: 24 },
    { key: "mensajero", width: 28 },
  ];
  retornadas.getRow(3).values = [
    "NO",
    "NUMERO TC",
    "NOMBRE",
    "CEDULA",
    "ADICIONAL",
    "NO ADICIONAL",
    "FECHA",
    "COMENTARIO",
    "PROVINCIA REASIGNACION",
    "MENSAJERO REASIGNADO",
    "PRODUCTO",
    "NUMERO SOLICITUD",
    "IDENTIFICADOR",
    "MENSAJERO ASIGNADO",
  ];
  for (const row of rows.retornadas) {
    retornadas.addRow(row);
  }

  const entregadas = workbook.addWorksheet("ENTREGADAS");
  entregadas.addRow(["TARJETAS ENTREGADAS"]);
  entregadas.addRow(["", "FECHA:", rows.fecha, "ZONA:", rows.zona, ""]);
  entregadas.columns = [
    ...baseColumns.map((column) => ({ key: column.key, width: column.width })),
    { key: "estatus", width: 18 },
    { key: "provinciaReasignacion", width: 24 },
    { key: "mensajeroReasignado", width: 28 },
    { key: "producto", width: 14 },
    { key: "numeroSolicitud", width: 24 },
    { key: "identificador", width: 24 },
    { key: "mensajero", width: 28 },
  ];
  entregadas.getRow(3).values = [
    "NO",
    "NUMERO TC",
    "NOMBRE",
    "CEDULA",
    "ADICIONAL",
    "NO ADICIONAL",
    "FECHA",
    "ESTATUS",
    "PROVINCIA REASIGNACION",
    "MENSAJERO REASIGNADO",
    "PRODUCTO",
    "NUMERO SOLICITUD",
    "IDENTIFICADOR",
    "MENSAJERO ASIGNADO",
  ];
  for (const row of rows.entregadas) {
    entregadas.addRow(row);
  }

  [retornadas, entregadas].forEach((sheet) => {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(3).font = { bold: true };
  });

  return workbook.xlsx.writeBuffer();
}

async function exportRedactionToPdf(rows: RedactionExportRows) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const drawSection = (input: {
    title: string;
    headers: string[];
    dataRows: string[][];
  }) => {
    const rowsPerPage = 41;
    const pageCount = Math.max(1, Math.ceil(input.dataRows.length / rowsPerPage));
    const cols = [18, 35, 88, 184, 244, 273, 296, 339, 410, 469, 532, 565, 640, 710];
    const maxLengths = [3, 8, 14, 10, 3, 2, 8, 10, 8, 8, 5, 11, 11, 9];

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const page = pdf.addPage([792, 612]);
      const pageRows = input.dataRows.slice(
        pageIndex * rowsPerPage,
        (pageIndex + 1) * rowsPerPage,
      );
      page.drawText(input.title, {
        x: 28,
        y: 580,
        size: 16,
        font: bold,
        color: rgb(0.06, 0.12, 0.24),
      });
      page.drawText(`Fecha: ${rows.fecha}`, { x: 28, y: 562, size: 9, font: regular });
      page.drawText(`Zona: ${rows.zona}`, { x: 180, y: 562, size: 9, font: regular });
      page.drawText(`Pagina ${pageIndex + 1} de ${pageCount}`, {
        x: 690,
        y: 562,
        size: 8,
        font: regular,
      });

      let y = 540;
      input.headers.forEach((header, idx) => {
        page.drawText(header, {
          x: cols[idx],
          y,
          size: 5.5,
          font: bold,
          color: rgb(0.35, 0.35, 0.35),
        });
      });
      y -= 11;

      if (!pageRows.length) {
        page.drawText("Sin registros para esta redaccion.", {
          x: 28,
          y,
          size: 9,
          font: regular,
          color: rgb(0.35, 0.35, 0.35),
        });
        continue;
      }

      for (const row of pageRows) {
        row.forEach((cell, idx) => {
          page.drawText((cell ?? "").slice(0, maxLengths[idx] ?? 18), {
            x: cols[idx],
            y,
            size: 5.5,
            font: regular,
            color: rgb(0.2, 0.2, 0.2),
          });
        });
        y -= 12;
      }
    }
  };

  const retornosRows = rows.retornadas.map((row) => [
    String(row.no),
    row.numeroTc,
    row.nombre,
    row.cedula,
    row.adicional,
    String(row.adicionalNumero),
    row.fecha,
    row.comentario || "-",
    row.provinciaReasignacion || "-",
    row.mensajeroReasignado || "-",
    row.producto,
    row.numeroSolicitud || "-",
    row.identificador,
    row.mensajero,
  ]);
  const entregasRows = rows.entregadas.map((row) => [
    String(row.no),
    row.numeroTc,
    row.nombre,
    row.cedula,
    row.adicional,
    String(row.adicionalNumero),
    row.fecha,
    row.estatus,
    row.provinciaReasignacion || "-",
    row.mensajeroReasignado || "-",
    row.producto,
    row.numeroSolicitud || "-",
    row.identificador,
    row.mensajero,
  ]);

  drawSection({
    title: "TARJETAS RETORNADAS",
    headers: [
      "NO",
      "TC",
      "NOMBRE",
      "CEDULA",
      "ADIC.",
      "NO.",
      "FECHA",
      "COMENT.",
      "PROV.",
      "M. REASIG.",
      "PROD.",
      "SOLICITUD",
      "IDENT.",
      "M. ASIG.",
    ],
    dataRows: retornosRows,
  });

  drawSection({
    title: "TARJETAS ENTREGADAS",
    headers: [
      "NO",
      "TC",
      "NOMBRE",
      "CEDULA",
      "ADIC.",
      "NO.",
      "FECHA",
      "ESTATUS",
      "PROV.",
      "M. REASIG.",
      "PROD.",
      "SOLICITUD",
      "IDENT.",
      "M. ASIG.",
    ],
    dataRows: entregasRows,
  });

  return pdf.save();
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "OPERADOR", "FACTURACION"]);
  if ("error" in auth) return auth.error;

  const type = request.nextUrl.searchParams.get("type") ?? "tarjetas";
  const format = (request.nextUrl.searchParams.get("format") ?? "xlsx").toLowerCase();
  const productType = parseProductType(
    request.nextUrl.searchParams.get("producto") ??
      request.nextUrl.searchParams.get("productType"),
  );

  let rows: Record<string, unknown>[] = [];
  let title = "Reporte";

  if (type === "tarjetas") {
    title = "Reporte de tarjetas";
    const status = request.nextUrl.searchParams.get("status");
    const zone = request.nextUrl.searchParams.get("zona");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const dispatchRange =
      from || to
        ? {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to
              ? (() => {
                  const end = new Date(to);
                  end.setHours(23, 59, 59, 999);
                  return { lte: end };
                })()
              : {}),
          }
        : null;

    const cardWhere: Prisma.CardWhereInput = {
      ...(productType ? { productType } : {}),
      ...(status && status !== "ALL" ? { status: status as CardStatus } : {}),
      ...(zone && zone !== "ALL"
        ? {
            OR: [
              { reassignedZone: zone },
              { reassignedZone: null, zona: zone },
            ],
          }
        : {}),
      ...(dispatchRange ? { dispatchDate: dispatchRange } : {}),
    };
    const cards = await prisma.card.findMany({
      where: cardWhere,
      include: {
        customer: true,
        currentMessenger: true,
        lastAssignedMessenger: true,
        reassignedMessenger: true,
      },
      take: 5000,
      orderBy: { updatedAt: "desc" },
    });

    const lifecycleByCard = await getLifecycleDatesByCard(cards.map((card) => card.id));
    const historyByCard = await getAssignmentHistoryByCard(cards.map((card) => card.id));

    rows = cards.map((card) => ({
      ...productFields(card),
      fechaEntrega: formatDateEs(lifecycleByCard.get(card.id)?.deliveryDate),
      fechaRetorno: formatDateEs(lifecycleByCard.get(card.id)?.returnDate),
      cliente: card.customer.nombre,
      cedula: card.customer.cedula,
      zonaOriginal: card.zona,
      provinciaOriginal: card.provincia,
      zonaFacturable: resolveBillableZone(card),
      provinciaReasignacion: card.reassignedProvince ?? "",
      mensajeroReasignado: card.reassignedMessenger?.nombre ?? "",
      tipoTarjeta: card.isAdditional ? "ADICIONAL" : "PRINCIPAL",
      adicional: card.isAdditional ? "SI" : "NO",
      adicionalNumero: card.additionalIndex,
      remota: card.isRemote ? "SI" : "NO",
      estado: card.status,
      urgente: card.urgent ? "SI" : "NO",
      mensajero: assignedMessengerName(card, historyByCard),
      fechaDespacho: formatDateEs(card.dispatchDate),
      slaVence: formatDateEs(card.slaDueDate),
      comentarioRetorno: card.returnReason ?? "",
    }));
  } else if (type === "contactos") {
    title = "Reporte de contactos";
    const provincia = request.nextUrl.searchParams.get("provincia");
    const where: Prisma.ContactLogWhereInput = {
      ...(productType || (provincia && provincia !== "ALL")
        ? {
            card: {
              ...(productType ? { productType } : {}),
              ...(provincia && provincia !== "ALL" ? { provincia } : {}),
            },
          }
        : {}),
    };

    const contacts = await prisma.contactLog.findMany({
      where,
      include: {
        card: {
          include: {
            customer: true,
            currentMessenger: true,
            lastAssignedMessenger: true,
            reassignedMessenger: true,
          },
        },
        user: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const lifecycleByCard = await getLifecycleDatesByCard(contacts.map((contact) => contact.card.id));
    const historyByCard = await getAssignmentHistoryByCard(
      contacts.map((contact) => contact.card.id),
    );

    rows = contacts.map((contact) => ({
      ...productFields(contact.card),
      fecha: formatDateEs(contact.createdAt),
      fechaEntrega: formatDateEs(lifecycleByCard.get(contact.card.id)?.deliveryDate),
      fechaRetorno: formatDateEs(lifecycleByCard.get(contact.card.id)?.returnDate),
      cliente: contact.card.customer.nombre,
      cedula: contact.card.customer.cedula,
      tc: contact.card.tc ?? "",
      provinciaOriginal: contact.card.provincia,
      zonaOriginal: contact.card.zona,
      zonaFacturable: resolveBillableZone(contact.card),
      provinciaReasignacion: contact.card.reassignedProvince ?? "",
      mensajeroReasignado: contact.card.reassignedMessenger?.nombre ?? "",
      mensajero: assignedMessengerName(contact.card, historyByCard),
      tipoTarjeta: contact.card.isAdditional ? "ADICIONAL" : "PRINCIPAL",
      adicional: contact.card.isAdditional ? "SI" : "NO",
      adicionalNumero: contact.card.additionalIndex,
      telefonosUsados: contact.telefonosUsados ?? "",
      comentario: contact.comentario ?? "",
      contactado: contact.contactado ? "SI" : "NO",
      operador: contact.user?.name ?? "",
    }));
  } else if (type === "facturacion") {
    title = "Reporte de facturacion";
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const zone = request.nextUrl.searchParams.get("zona");
    const fxRate = parseFxRate(request.nextUrl.searchParams.get("fxRate"));
    const dispatchDate =
      from || to
        ? {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to
              ? (() => {
                  const end = new Date(to);
                  end.setHours(23, 59, 59, 999);
                  return { lte: end };
                })()
              : {}),
          }
        : undefined;

    const [cards, tariffs] = await Promise.all([
      prisma.card.findMany({
      where: {
        status: CardStatus.ENTREGADA,
        productType: CardProductType.CREDITO,
        ...(zone && zone !== "ALL"
          ? {
              OR: [
                { reassignedZone: zone },
                { reassignedZone: null, zona: zone },
              ],
            }
          : {}),
        ...(dispatchDate ? { dispatchDate } : {}),
      },
      select: {
        id: true,
        zona: true,
        provincia: true,
        reassignedProvince: true,
        reassignedZone: true,
        isRemote: true,
        isAdditional: true,
        dispatchDate: true,
        customer: {
          select: {
            cedula: true,
          },
        },
      },
      take: 5000,
      orderBy: { dispatchDate: "desc" },
      }),
      prisma.zoneTariff.findMany({ include: { ranges: true } }),
    ]);

    const billableCards = dedupeBillingCardsByCustomerAndDispatchDate(
      cards.map((card) => ({
        id: card.id,
        zona: resolveBillableZone(card),
        isRemote: card.isRemote,
        isAdditional: card.isAdditional,
        dispatchDate: card.dispatchDate,
        customerCedula: card.customer.cedula,
      })),
    );

    const grouped = new Map<string, number>();
    billableCards.forEach((card) => {
      grouped.set(card.zona, (grouped.get(card.zona) ?? 0) + 1);
    });
    const additionalByZone = new Map<string, number>();
    cards.forEach((card) => {
      if (!card.isAdditional) return;
      const billableZone = resolveBillableZone(card);
      additionalByZone.set(billableZone, (additionalByZone.get(billableZone) ?? 0) + 1);
    });

    const tariffMap = new Map(tariffs.map((tariff) => [tariff.zona, tariff]));

    rows = Array.from(grouped.entries()).map(([zona, count]) => {
      const tariff = tariffMap.get(zona);
      const centsPerCard = resolveCentsPerCard(
        count,
        tariff?.baseCents ?? 0,
        tariff?.ranges ?? [],
      );
      const totalUsdCents = centsPerCard * count;
      const totalDopCents = Math.round(totalUsdCents * fxRate);
      return {
        zona,
        entregas: count,
        adicionalesExcluidas: additionalByZone.get(zona) ?? 0,
        tasaDolar: fxRate.toFixed(4),
        tarifaPorTarjetaUSD: fromCents(centsPerCard),
        totalUSD: fromCents(totalUsdCents),
        totalDOP: fromCents(totalDopCents),
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
      const totalUsdCents = remoteSurchargeCents * remoteCount;
      const totalDopCents = Math.round(totalUsdCents * fxRate);
      rows.push({
        zona: "REMOTA",
        entregas: remoteCount,
        adicionalesExcluidas: cards.filter((card) => card.isAdditional && card.isRemote).length,
        tasaDolar: fxRate.toFixed(4),
        tarifaPorTarjetaUSD: fromCents(remoteSurchargeCents),
        totalUSD: fromCents(totalUsdCents),
        totalDOP: fromCents(totalDopCents),
      });
    }
  } else if (type === "redaccion") {
    title = "Entregas y retornos";
    const redactionRows = await buildRedactionExportRows(request);

    if (!redactionRows.retornadas.length && !redactionRows.entregadas.length) {
      return NextResponse.json(
        { error: "No hay datos de redaccion para los filtros seleccionados" },
        { status: 404 },
      );
    }

    if (format === "xlsx") {
      const xlsx = await exportRedactionToXlsx(redactionRows);
      return new NextResponse(Buffer.from(xlsx), {
        headers: fileHeaders(
          `redaccion-${new Date().toISOString().slice(0, 10)}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      });
    }

    if (format === "pdf") {
      const pdfBytes = await exportRedactionToPdf(redactionRows);
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: fileHeaders(
          `redaccion-${new Date().toISOString().slice(0, 10)}.pdf`,
          "application/pdf",
        ),
      });
    }

    rows = [
      ...redactionRows.retornadas.map((row) => ({
        tipo: "RETORNADA",
        no: row.no,
        producto: row.producto,
        numeroTc: row.numeroTc,
        numeroSolicitud: row.numeroSolicitud,
        identificador: row.identificador,
        nombre: row.nombre,
        cedula: row.cedula,
        adicional: row.adicional,
        adicionalNumero: row.adicionalNumero,
        fecha: row.fecha,
        comentario: row.comentario,
        provinciaReasignacion: row.provinciaReasignacion,
        mensajeroReasignado: row.mensajeroReasignado,
        mensajero: row.mensajero,
      })),
      ...redactionRows.entregadas.map((row) => ({
        tipo: "ENTREGADA",
        no: row.no,
        producto: row.producto,
        numeroTc: row.numeroTc,
        numeroSolicitud: row.numeroSolicitud,
        identificador: row.identificador,
        nombre: row.nombre,
        cedula: row.cedula,
        adicional: row.adicional,
        adicionalNumero: row.adicionalNumero,
        fecha: row.fecha,
        comentario: row.estatus,
        provinciaReasignacion: row.provinciaReasignacion,
        mensajeroReasignado: row.mensajeroReasignado,
        mensajero: row.mensajero,
      })),
    ];
  } else {
    return NextResponse.json({ error: "Tipo de reporte no soportado" }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json(
      { error: "No hay datos para exportar con los filtros seleccionados" },
      { status: 404 },
    );
  }

  if (format === "csv") {
    const csv = exportRowsToCsv(rows);
    return new NextResponse(csv, {
      headers: fileHeaders(`${type}.csv`, "text/csv; charset=utf-8"),
    });
  }

  if (format === "pdf") {
    const pdfBytes = await exportRowsToPdf(title, rows);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: fileHeaders(`${type}.pdf`, "application/pdf"),
    });
  }

  const xlsx = await exportRowsToXlsx(rows, "Reporte");
  return new NextResponse(Buffer.from(xlsx), {
    headers: fileHeaders(`${type}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  });
}
