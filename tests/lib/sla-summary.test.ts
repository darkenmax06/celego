import { describe, expect, it } from "vitest";
import { slaSummary } from "@/lib/sla-summary";

// Friday 13 Nov 2026, mid-morning local time.
const NOW = new Date(2026, 10, 13, 10, 0, 0);

function local(day: number) {
  return new Date(2026, 10, day, 0, 0, 0);
}

describe("slaSummary", () => {
  it("counts future due dates in business days", () => {
    const due = local(18); // Wednesday: Mon 16, Tue 17, Wed 18
    expect(slaSummary(due, NOW, false)).toEqual({
      label: "Vence en 3 días",
      dateLabel: due.toLocaleDateString("es-DO"),
      tone: "neutral",
    });
  });

  it("flags the next business day as a warning, never as 0 days", () => {
    expect(slaSummary(local(16), NOW, false)).toMatchObject({ label: "Vence en 1 día", tone: "warning" });
    // Saturday due date: zero business days away but not today.
    expect(slaSummary(local(14), NOW, false)).toMatchObject({ label: "Vence en 1 día", tone: "warning" });
  });

  it("reports a due date of today", () => {
    expect(slaSummary(local(13), NOW, false)).toMatchObject({ label: "Vence hoy", tone: "warning" });
  });

  it("reports overdue cards in the danger tone", () => {
    const due = local(11); // Wednesday: Thu 12, Wed 11
    expect(slaSummary(due, NOW, false)).toEqual({
      label: "Vencida hace 2 días",
      dateLabel: due.toLocaleDateString("es-DO"),
      tone: "danger",
    });
  });

  it("shows only the date for closed cards, without urgency", () => {
    const due = local(11);
    expect(slaSummary(due, NOW, true)).toEqual({
      label: due.toLocaleDateString("es-DO"),
      dateLabel: null,
      tone: "muted",
    });
  });

  it("accepts ISO strings and handles missing or invalid dates", () => {
    expect(slaSummary(local(18).toISOString(), NOW, false).label).toBe("Vence en 3 días");
    expect(slaSummary(null, NOW, false)).toEqual({ label: "Sin SLA", dateLabel: null, tone: "muted" });
    expect(slaSummary("not-a-date", NOW, false).label).toBe("Sin SLA");
  });
});
