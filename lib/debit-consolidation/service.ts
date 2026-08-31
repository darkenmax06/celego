import { Prisma, type CardStatus, type UserRole } from "@prisma/client";
import { writeAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { addBusinessDaysStrict } from "@/lib/sla";
import { normalizeText } from "@/lib/utils";
import { resolveZone } from "@/lib/zone-map";
import {
  reconcileDebitFiles,
  reconciliationDifferences,
  type ReconcileDebitFilesInput,
} from "./reconcile";
import { debitRowKey, type DebitIssue, type DebitPreviewResponse } from "./types";
import { dateKey, sha256, validationToken } from "./value";
import { buildUpdatedDebitWorkbook } from "./workbook";
import { parseConsolidatedWorkbook } from "./parser";

type UploadedWorkbook = { buffer: Buffer; name: string };

export type DebitPreviewInput = {
  base: UploadedWorkbook;
  dispatchDate: Date;
  newCards?: UploadedWorkbook | null;
  statusReport?: UploadedWorkbook | null;
  createdById: string;
  actorEmail?: string | null;
};

function jsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function dbBytes(value: Uint8Array) {
  return Uint8Array.from(value);
}

function planInputFromRun(run: {
  baseFile: Uint8Array;
  baseFileName: string;
  dispatchDate: Date;
  newCardsFile: Uint8Array | null;
  newCardsFileName: string | null;
  statusFile: Uint8Array | null;
  statusFileName: string | null;
}): ReconcileDebitFilesInput {
  return {
    base: { buffer: Buffer.from(run.baseFile), name: run.baseFileName },
    dispatchDate: run.dispatchDate,
    newCards: run.newCardsFile
      ? { buffer: Buffer.from(run.newCardsFile), name: run.newCardsFileName ?? "altas.xlsx" }
      : null,
    statusReport: run.statusFile
      ? { buffer: Buffer.from(run.statusFile), name: run.statusFileName ?? "estados.xlsx" }
      : null,
  };
}

function previewResponse(
  run: { id: string; validationToken: string; status: string },
  plan: ReturnType<typeof reconcileDebitFiles>,
  duplicateCompletedRunId: string | null,
): DebitPreviewResponse {
  return {
    runId: run.id,
    validationToken: run.validationToken,
    status: run.status,
    counts: plan.counts,
    issues: plan.issues,
    differences: reconciliationDifferences(plan),
    duplicateCompletedRunId,
    canApply: plan.counts.blocking === 0,
  };
}

export async function createDebitPreview(input: DebitPreviewInput) {
  if (!input.newCards && !input.statusReport) {
    throw new Error("DEBIT_SOURCE_FILE_REQUIRED");
  }
  const planInput: ReconcileDebitFilesInput = {
    base: input.base,
    dispatchDate: input.dispatchDate,
    newCards: input.newCards,
    statusReport: input.statusReport,
  };
  const plan = reconcileDebitFiles(planInput);
  const baseHash = sha256(input.base.buffer);
  const newHash = input.newCards ? sha256(input.newCards.buffer) : null;
  const statusHash = input.statusReport ? sha256(input.statusReport.buffer) : null;
  const completedCandidates = await prisma.debitConsolidationRun.findMany({
    where: {
      status: "COMPLETED",
      baseFileSha256: baseHash,
      dispatchDate: input.dispatchDate,
    },
    select: {
      id: true,
      newCardsFileSha256: true,
      statusFileSha256: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const duplicate =
    completedCandidates.find(
      (candidate) =>
        (candidate.newCardsFileSha256 ?? null) === newHash &&
        (candidate.statusFileSha256 ?? null) === statusHash,
    ) ?? null;
  if (duplicate) {
    plan.issues.push({
      sourceFile: input.base.name,
      severity: "WARNING",
      code: "EXACT_RUN_ALREADY_COMPLETED",
      message: `Estos mismos archivos ya fueron aplicados en el proceso ${duplicate.id}`,
    });
    plan.counts.warnings += 1;
  }

  const token = validationToken();
  const run = await prisma.debitConsolidationRun.create({
    data: {
      status: "READY",
      validationToken: token,
      dispatchDate: input.dispatchDate,
      baseFileName: input.base.name,
      baseFileSha256: baseHash,
      baseFile: dbBytes(input.base.buffer),
      newCardsFileName: input.newCards?.name ?? null,
      newCardsFileSha256: newHash,
      newCardsFile: input.newCards ? dbBytes(input.newCards.buffer) : null,
      statusFileName: input.statusReport?.name ?? null,
      statusFileSha256: statusHash,
      statusFile: input.statusReport ? dbBytes(input.statusReport.buffer) : null,
      counts: jsonValue(plan.counts),
      createdById: input.createdById,
      issues: {
        create: plan.issues.map((item) => ({
          sourceFile: item.sourceFile,
          sheet: item.sheet ?? null,
          rowNumber: item.rowNumber ?? null,
          requestNumber: item.requestNumber ?? null,
          severity: item.severity,
          code: item.code,
          message: item.message,
        })),
      },
    },
    select: { id: true, validationToken: true, status: true },
  });
  await writeAuditEvent({
    entity: "DEBIT_CONSOLIDATION",
    entityId: run.id,
    action: "PREVIEW",
    userId: input.createdById,
    actorEmail: input.actorEmail,
    details: jsonValue({ counts: plan.counts, duplicateCompletedRunId: duplicate?.id ?? null }),
  });
  return previewResponse(run, plan, duplicate?.id ?? null);
}

type ApplyDebitRunInput = {
  runId: string;
  validationToken: string;
  acknowledgeRowErrors: boolean;
  allowRepeat: boolean;
  userId: string;
  role: UserRole;
  actorEmail?: string | null;
};

function normalizeZone(province: string, configured: Map<string, string>) {
  return configured.get(normalizeText(province)) ?? resolveZone(province, "Metro");
}

async function syncDebitCards(
  tx: Prisma.TransactionClient,
  plan: ReturnType<typeof reconcileDebitFiles>,
  runId: string,
  userId: string,
) {
  const [slaConfig, extensions, provinceConfigs] = await Promise.all([
    tx.sLAConfig.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default", businessDays: 5 },
    }),
    tx.sLAExtension.findMany({ where: { active: true } }),
    tx.provinceConfig.findMany({ where: { active: true } }),
  ]);
  const provinceToZone = new Map(
    provinceConfigs.map((item) => [normalizeText(item.nombre), item.zona]),
  );
  const extensionDays = (cedula: string, reference: string) =>
    extensions
      .filter(
        (item) =>
          (item.type === "CEDULA" && item.matchValue === cedula) ||
          (item.type === "REFERENCIA" && reference && item.matchValue === reference),
      )
      .reduce((sum, item) => sum + item.extraDays, 0);
  const cards = new Map<string, string>();
  let created = 0;
  let updated = 0;

  for (const row of plan.effectiveRows) {
    const provincia = row.provincia || "Santo Domingo";
    const zona = normalizeZone(provincia, provinceToZone);
    const customer = await tx.customer.upsert({
      where: { cedula: row.cedula },
      update: {
        nombre: row.nombre || row.cedula,
        telefonosRaw: row.telefonos || null,
        direccionRaw: row.direccion || null,
        provincia,
        zona,
      },
      create: {
        cedula: row.cedula,
        nombre: row.nombre || row.cedula,
        telefonosRaw: row.telefonos || null,
        direccionRaw: row.direccion || null,
        provincia,
        zona,
      },
    });
    const extraDays = extensionDays(row.cedula, row.externalReference);
    const slaDays = Math.max(0, slaConfig.businessDays + extraDays);
    const slaDueDate = addBusinessDaysStrict(row.dispatchDate, slaDays);
    const metadata = jsonValue({
      source: "DEBIT_CONSOLIDATION",
      runId,
      debit: {
        workbookRow: row.workbookRow,
        deliveryDate: row.deliveryDate?.toISOString() ?? null,
        statusRaw: row.statusRaw,
        snapshot: row.sourceSnapshot,
      },
    });
    const existing = await tx.card.findFirst({
      where: {
        productType: "DEBITO",
        requestNumber: row.requestNumber,
        dispatchDate: row.dispatchDate,
      },
    });
    if (existing) {
      await tx.card.update({
        where: { id: existing.id },
        data: {
          customerId: customer.id,
          provincia,
          zona,
          externalReference: row.externalReference || null,
          status: row.cardStatus as CardStatus,
          returnReason: row.returnReason,
          slaDueDate,
          slaExtensionDays: Math.max(0, extraDays),
          metadata,
        },
      });
      if (existing.status !== row.cardStatus) {
        await tx.cardStatusLog.create({
          data: {
            cardId: existing.id,
            fromStatus: existing.status,
            toStatus: row.cardStatus as CardStatus,
            note: "Actualización por consolidado débito",
            byUserId: userId,
          },
        });
      }
      cards.set(debitRowKey(row), existing.id);
      updated += 1;
    } else {
      const card = await tx.card.create({
        data: {
          tc: "",
          requestNumber: row.requestNumber,
          productType: "DEBITO",
          customerId: customer.id,
          provincia,
          zona,
          dispatchDate: row.dispatchDate,
          externalReference: row.externalReference || null,
          status: row.cardStatus as CardStatus,
          returnReason: row.returnReason,
          urgent: false,
          slaDueDate,
          slaExtensionDays: Math.max(0, extraDays),
          metadata,
        },
      });
      await tx.cardStatusLog.create({
        data: {
          cardId: card.id,
          fromStatus: null,
          toStatus: row.cardStatus as CardStatus,
          note: "Creada por consolidado débito",
          byUserId: userId,
        },
      });
      cards.set(debitRowKey(row), card.id);
      created += 1;
    }
  }
  return { cards, created, updated };
}

export async function applyDebitConsolidation(input: ApplyDebitRunInput) {
  const run = await prisma.debitConsolidationRun.findUnique({ where: { id: input.runId } });
  if (!run) throw new Error("DEBIT_RUN_NOT_FOUND");
  if (run.validationToken !== input.validationToken) throw new Error("DEBIT_TOKEN_INVALID");
  if (run.status !== "READY") throw new Error("DEBIT_RUN_NOT_READY");
  const planInput = planInputFromRun(run);
  const plan = reconcileDebitFiles(planInput);
  if (plan.counts.blocking) throw new Error("DEBIT_BLOCKING_ISSUES");
  if (plan.counts.rowErrors && !input.acknowledgeRowErrors) {
    throw new Error("DEBIT_ROW_ERRORS_ACK_REQUIRED");
  }
  const duplicate = await prisma.debitConsolidationRun.findFirst({
    where: {
      id: { not: run.id },
      status: "COMPLETED",
      baseFileSha256: run.baseFileSha256,
      newCardsFileSha256: run.newCardsFileSha256,
      statusFileSha256: run.statusFileSha256,
      dispatchDate: run.dispatchDate,
    },
    select: { id: true },
  });
  if (duplicate && (!input.allowRepeat || input.role !== "ADMIN")) {
    throw new Error("DEBIT_REPEAT_ADMIN_REQUIRED");
  }
  const claimed = await prisma.debitConsolidationRun.updateMany({
    where: { id: run.id, status: "READY" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count !== 1) throw new Error("DEBIT_RUN_NOT_READY");

  try {
    const output = await buildUpdatedDebitWorkbook(Buffer.from(run.baseFile), plan);
    const verification = parseConsolidatedWorkbook(output, "resultado.xlsx");
    if (
      verification.issues.some((item) => item.severity === "BLOCKING") ||
      verification.rows.length !== plan.counts.projectedRows
    ) {
      throw new Error("DEBIT_OUTPUT_VALIDATION_FAILED");
    }
    const outputFileName = `${run.baseFileName.replace(/\.xlsx$/i, "")}-actualizado-${dateKey(new Date())}.xlsx`;
    const result = await prisma.$transaction(async (tx) => {
      const synced = await syncDebitCards(tx, plan, run.id, input.userId);
      if (plan.statusEvents.length) {
        await tx.debitStatusEvent.createMany({
          data: plan.statusEvents.map((event) => ({
            runId: run.id,
            cardId: event.matchedRowKey ? synced.cards.get(event.matchedRowKey) ?? null : null,
            requestNumber: event.requestNumber,
            trackingNumber: event.trackingNumber || null,
            externalStatus: event.externalStatus,
            movementAt: event.movementAt,
            operator: event.operator || null,
            notes: event.notes || null,
            resolution: jsonValue({
              aggregateStatus: event.aggregateStatus,
              selected: event.selected,
              matchedRowKey: event.matchedRowKey,
            }),
          })),
        });
      }
      const completed = await tx.debitConsolidationRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          outputFileName,
          outputFile: dbBytes(output),
          counts: jsonValue({ ...plan.counts, cardsCreated: synced.created, cardsUpdated: synced.updated }),
          appliedAt: new Date(),
          errorMessage: null,
        },
      });
      await writeAuditEvent(
        {
          entity: "DEBIT_CONSOLIDATION",
          entityId: run.id,
          action: "APPLY",
          userId: input.userId,
          actorEmail: input.actorEmail,
          details: jsonValue({
            counts: plan.counts,
            cardsCreated: synced.created,
            cardsUpdated: synced.updated,
            repeatedFromRunId: duplicate?.id ?? null,
          }),
        },
        tx,
      );
      return { completed, cardsCreated: synced.created, cardsUpdated: synced.updated };
    });
    return {
      runId: result.completed.id,
      status: result.completed.status,
      outputFileName,
      counts: plan.counts,
      cardsCreated: result.cardsCreated,
      cardsUpdated: result.cardsUpdated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await prisma.debitConsolidationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: message.slice(0, 2_000) },
    });
    throw error;
  }
}

export async function listDebitConsolidations(limit = 30) {
  return prisma.debitConsolidationRun.findMany({
    take: Math.min(Math.max(limit, 1), 100),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      dispatchDate: true,
      baseFileName: true,
      newCardsFileName: true,
      statusFileName: true,
      outputFileName: true,
      counts: true,
      errorMessage: true,
      appliedAt: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function issuesCsv(issues: DebitIssue[]) {
  const headers = [
    "severidad",
    "archivo",
    "hoja",
    "fila",
    "solicitud",
    "codigo",
    "mensaje",
  ];
  const rows = issues.map((item) => [
    item.severity,
    item.sourceFile,
    item.sheet,
    item.rowNumber,
    item.requestNumber,
    item.code,
    item.message,
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
