import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { formatCurrencyDOP } from "@/lib/money";
import { countedBetween } from "@/lib/payroll/counting";
import { PayrollError, openPayment } from "@/lib/payroll/payments";
import { buildMessengerReportSvg, dateLabel } from "@/lib/payroll/report-image";

/** Subfolder of the app storage dir that holds the period report images. */
export const MESSENGER_REPORTS_DIR = "messenger-reports";

/**
 * Root of the app's persistent files. In Docker the app runs in /app and
 * `./storage` is mounted at /app/storage; APP_STORAGE_DIR overrides it.
 */
export function appStorageDir() {
  return path.resolve(process.env.APP_STORAGE_DIR || path.join(process.cwd(), "storage"));
}

const SAFE_ID = /^[a-z0-9]+$/i;

/** Storage-relative path (always with forward slashes) of a period report image. */
export function periodReportRelativePath(messengerId: string, periodId: string) {
  if (!SAFE_ID.test(messengerId) || !SAFE_ID.test(periodId)) {
    throw new PayrollError("INVALIDO", "Identificador de reporte invalido", 422);
  }
  return `${MESSENGER_REPORTS_DIR}/${messengerId}/${periodId}.jpg`;
}

/** Absolute path of a stored report image, or null if `imagePath` would escape the storage dir. */
export function resolveStoredReportPath(imagePath: string) {
  const root = appStorageDir();
  const absolute = path.resolve(root, imagePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

export async function svgToJpeg(svg: string) {
  return sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/** Download file name of a period payment image. */
export function periodReportFileName(messengerName: string, periodLabel: string) {
  return `pago-${`${messengerName}-${periodLabel}`.replace(/[^\w.-]+/g, "_")}.jpg`;
}

/**
 * Payment image of one period: the days that count for it (including what was
 * delivered after the previous cut), the loan installments taken off and the net.
 */
export async function renderPeriodReport(messengerId: string, periodId: string) {
  const [messenger, period] = await Promise.all([
    prisma.messenger.findUnique({ where: { id: messengerId } }),
    prisma.payrollPeriod.findUnique({ where: { id: periodId } }),
  ]);
  if (!messenger) throw new PayrollError("NO_ENCONTRADO", "Mensajero no encontrado", 404);
  if (!period || (period.messengerId && period.messengerId !== messengerId)) {
    throw new PayrollError("NO_ENCONTRADO", "Periodo no encontrado para este mensajero", 404);
  }

  const [payment, rows] = await Promise.all([
    prisma.$transaction((tx) => openPayment(tx, messengerId, periodId)),
    prisma.messengerDailyRecord.findMany({
      where: { messengerId, ...countedBetween(period.fromDate, period.toDate) },
      orderBy: [{ fecha: "asc" }, { siguienteCorte: "asc" }],
    }),
  ]);

  const svg = buildMessengerReportSvg({
    messengerName: messenger.nombre,
    title: `Pago ${period.label}`,
    from: dateLabel(period.fromDate),
    to: dateLabel(period.toDate),
    payment: {
      netCents: payment.netCents,
      deductions: payment.installments
        .filter((item) => item.status !== "OMITIDA")
        .map((item) => ({
          label: `Prestamo ${formatCurrencyDOP(item.loan.principalCents)} - cuota ${item.number}/${item.loan.installmentCount}${item.loan.note ? ` (${item.loan.note})` : ""}`,
          cents: item.appliedCents ?? item.plannedCents,
        })),
    },
    rows: rows.map((row) => ({
      fecha: row.fecha.toISOString(),
      note: row.siguienteCorte ? "restantes tras el corte" : undefined,
      entregasNormales: row.entregasNormales,
      entregasRemotas: row.entregasRemotas,
      recogidasBanco: row.recogidasBanco,
      mandados: row.mandados,
      totalCents: row.totalCents,
    })),
  });

  return {
    jpeg: await svgToJpeg(svg),
    messenger,
    period,
    netCents: payment.netCents,
    fileName: periodReportFileName(messenger.nombre, period.label),
  };
}

/** Writes through a temp file, so a reader never sees a half-written image. */
async function writeFileAtomic(target: string, data: Buffer) {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, data);
  await rename(temp, target);
}

/**
 * Renders the period payment image, stores it and records it as the report of
 * that messenger and period. Locking the same period again replaces both the
 * file and the row, so a period never has two reports.
 */
export async function storePeriodReport(input: { messengerId: string; periodId: string; userId?: string | null }) {
  const { messengerId, periodId } = input;
  const imagePath = periodReportRelativePath(messengerId, periodId);
  const rendered = await renderPeriodReport(messengerId, periodId);
  const absolute = resolveStoredReportPath(imagePath);
  if (!absolute) throw new PayrollError("INVALIDO", "Ruta de reporte invalida", 422);
  await writeFileAtomic(absolute, rendered.jpeg);

  const data = {
    fromDate: rendered.period.fromDate,
    toDate: rendered.period.toDate,
    totalCents: rendered.netCents,
    imagePath,
    generatedById: input.userId ?? null,
  };
  return prisma.messengerReport.upsert({
    where: { messengerId_payrollPeriodId: { messengerId, payrollPeriodId: periodId } },
    create: { messengerId, payrollPeriodId: periodId, ...data },
    update: { ...data, generatedAt: new Date(), anulada: false },
  });
}

/** Contents of a stored report image, or null when the file is gone. */
export async function readStoredReport(imagePath: string) {
  const absolute = resolveStoredReportPath(imagePath);
  if (!absolute) return null;
  try {
    return await readFile(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
