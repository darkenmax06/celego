import { differenceInCalendarDays } from "date-fns";
import { businessDaysBetween } from "@/lib/sla";

export type SlaSummaryTone = "danger" | "warning" | "neutral" | "muted";

export type SlaSummary = {
  /** Relative, human label ("Vence en 3 días", "Vence hoy", "Vencida hace 2 días"). */
  label: string;
  /** Absolute due date formatted for es-DO, or null when there is no SLA. */
  dateLabel: string | null;
  tone: SlaSummaryTone;
};

function days(count: number) {
  return count === 1 ? "1 día" : `${count} días`;
}

/**
 * Summarises an SLA due date relative to `now`.
 *
 * Distances are counted in business days (same rule as the SLA vencidas
 * module), but "today" is decided by calendar day so a weekend due date never
 * reads as "0 días". Closed/terminal cards only show the date, without urgency.
 */
export function slaSummary(
  dueDate: string | Date | null | undefined,
  now: Date,
  isClosed: boolean,
): SlaSummary {
  if (!dueDate) return { label: "Sin SLA", dateLabel: null, tone: "muted" };
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) return { label: "Sin SLA", dateLabel: null, tone: "muted" };

  const dateLabel = due.toLocaleDateString("es-DO");
  if (isClosed) return { label: dateLabel, dateLabel: null, tone: "muted" };

  const calendarDiff = differenceInCalendarDays(due, now);
  if (calendarDiff === 0) return { label: "Vence hoy", dateLabel, tone: "warning" };

  const distance = Math.max(1, Math.abs(businessDaysBetween(now, due)));
  if (calendarDiff < 0) {
    return { label: `Vencida hace ${days(distance)}`, dateLabel, tone: "danger" };
  }
  return {
    label: `Vence en ${days(distance)}`,
    dateLabel,
    tone: distance <= 1 ? "warning" : "neutral",
  };
}
