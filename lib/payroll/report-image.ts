import { formatCurrencyDOP } from "@/lib/money";

const FONT_FAMILY = "DejaVu Sans, Noto Sans, Liberation Sans, sans-serif";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function dateLabel(value: Date | string) {
  // Days are stored as midnight UTC of the payroll date; read them in UTC so they never slip a day.
  return new Date(value).toLocaleDateString("es-DO", { timeZone: "UTC" });
}

export function buildMessengerReportSvg(input: {
  messengerName: string;
  from: string;
  to: string;
  title?: string;
  /** Payment of a period: loan installments taken off and what is left to pay. */
  payment?: { deductions: Array<{ label: string; cents: number }>; netCents: number };
  rows: Array<{
    fecha: string;
    note?: string;
    entregasNormales: number;
    entregasRemotas: number;
    recogidasBanco: number;
    mandados: number;
    totalCents: number;
  }>;
}) {
  const bodyRows = input.rows.slice(0, 28);
  const totalCents = input.rows.reduce((sum, row) => sum + row.totalCents, 0);
  const totals = input.rows.reduce(
    (acc, row) => ({
      entregasNormales: acc.entregasNormales + row.entregasNormales,
      entregasRemotas: acc.entregasRemotas + row.entregasRemotas,
      recogidasBanco: acc.recogidasBanco + row.recogidasBanco,
      mandados: acc.mandados + row.mandados,
    }),
    { entregasNormales: 0, entregasRemotas: 0, recogidasBanco: 0, mandados: 0 },
  );
  const deductionsHeight = input.payment ? 46 + Math.max(1, input.payment.deductions.length) * 22 : 0;
  const height = 396 + bodyRows.length * 28 + deductionsHeight;

  let y = 175;
  const rowSvg = bodyRows
    .map((row) => {
      const current = y;
      y += 28;
      return `
      <text x="60" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${escapeXml(dateLabel(row.fecha))}</text>
      ${row.note ? `<text x="800" y="${current}" font-size="9" font-family="${FONT_FAMILY}" fill="#b45309">${escapeXml(row.note)}</text>` : ""}
      <text x="220" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${row.entregasNormales}</text>
      <text x="330" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${row.entregasRemotas}</text>
      <text x="450" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${row.recogidasBanco}</text>
      <text x="580" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155">${row.mandados}</text>
      <text x="700" y="${current}" font-size="12" font-family="${FONT_FAMILY}" fill="#0f172a">${escapeXml(formatCurrencyDOP(row.totalCents))}</text>
      <line x1="50" y1="${current + 10}" x2="960" y2="${current + 10}" stroke="#e2e8f0" />
      `;
    })
    .join("");

  const deductionsSvg = input.payment
    ? `
  <rect x="52" y="${y + 6}" width="896" height="${deductionsHeight - 16}" rx="10" fill="#fff7ed" stroke="#fed7aa"/>
  <text x="66" y="${y + 28}" font-size="12" font-family="${FONT_FAMILY}" fill="#9a3412" font-weight="700">DESCUENTO DE PRESTAMOS</text>
  ${
    input.payment.deductions.length
      ? input.payment.deductions
          .map(
            (item, index) => `
  <text x="66" y="${y + 52 + index * 22}" font-size="12" font-family="${FONT_FAMILY}" fill="#7c2d12">${escapeXml(item.label)}</text>
  <text x="934" y="${y + 52 + index * 22}" text-anchor="end" font-size="12" font-family="${FONT_FAMILY}" fill="#b91c1c" font-weight="700">- ${escapeXml(formatCurrencyDOP(item.cents))}</text>`,
          )
          .join("")
      : `<text x="66" y="${y + 52}" font-size="12" font-family="${FONT_FAMILY}" fill="#7c2d12">Sin cuotas en este pago</text>`
  }`
    : "";
  const payable = input.payment ? input.payment.netCents : totalCents;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}">
  <rect x="0" y="0" width="1000" height="${height}" fill="#f1f5f9"/>
  <rect x="24" y="24" width="952" height="${height - 48}" rx="16" fill="#ffffff"/>
  <text x="52" y="72" font-size="28" font-family="${FONT_FAMILY}" fill="#0f2544" font-weight="700">${escapeXml(input.messengerName)}</text>
  <text x="52" y="100" font-size="14" font-family="${FONT_FAMILY}" fill="#64748b">${escapeXml(input.title ?? "Reporte de gestion")} del ${escapeXml(input.from)} al ${escapeXml(input.to)}</text>
  <rect x="52" y="116" width="896" height="44" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="60" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Fecha</text>
  <text x="220" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Normales</text>
  <text x="330" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Remotas</text>
  <text x="450" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Recogidas</text>
  <text x="580" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Mandados</text>
  <text x="700" y="144" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Total</text>
  ${rowSvg}
  ${deductionsSvg}
  <rect x="52" y="${height - 172}" width="896" height="72" rx="10" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="66" y="${height - 150}" font-size="12" font-family="${FONT_FAMILY}" fill="#334155" font-weight="700">TOTAL ENTREGAS POR TIPO</text>
  <text x="66" y="${height - 128}" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Normales</text>
  <text x="220" y="${height - 128}" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Remotas</text>
  <text x="360" y="${height - 128}" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Recogidas</text>
  <text x="520" y="${height - 128}" font-size="11" font-family="${FONT_FAMILY}" fill="#64748b">Mandados</text>
  <text x="66" y="${height - 108}" font-size="18" font-family="${FONT_FAMILY}" fill="#0f172a" font-weight="700">${totals.entregasNormales}</text>
  <text x="220" y="${height - 108}" font-size="18" font-family="${FONT_FAMILY}" fill="#0f172a" font-weight="700">${totals.entregasRemotas}</text>
  <text x="360" y="${height - 108}" font-size="18" font-family="${FONT_FAMILY}" fill="#0f172a" font-weight="700">${totals.recogidasBanco}</text>
  <text x="520" y="${height - 108}" font-size="18" font-family="${FONT_FAMILY}" fill="#0f172a" font-weight="700">${totals.mandados}</text>
  <rect x="52" y="${height - 92}" width="896" height="48" rx="10" fill="#0f172a"/>
  <text x="66" y="${height - 63}" font-size="12" font-family="${FONT_FAMILY}" fill="#cbd5e1">${input.payment ? `A PAGAR (ganado ${escapeXml(formatCurrencyDOP(totalCents))} menos cuotas)` : "TOTAL DEL PERIODO"}</text>
  <text x="860" y="${height - 60}" text-anchor="end" font-size="24" font-family="${FONT_FAMILY}" fill="${payable < 0 ? "#f87171" : "#22c55e"}" font-weight="700">${escapeXml(formatCurrencyDOP(payable))}</text>
</svg>`;
}
