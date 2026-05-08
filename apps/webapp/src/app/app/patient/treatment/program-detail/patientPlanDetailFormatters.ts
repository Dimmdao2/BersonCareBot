import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { resolvePatientProgramProgressDaysForPatientUi } from "@/modules/treatment-program/stage-semantics";
import { DateTime } from "luxon";
import { formatBookingDateLongRu } from "@/shared/lib/formatBusinessDateTime";

/** Человекочитаемое представление «сырого» результата теста (detail payload). */
export function formatPatientTestResultRawValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return String(raw);
  }
  const o = raw as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.score === "number" && !Number.isNaN(o.score)) parts.push(`Балл: ${o.score}`);
  if (typeof o.note === "string" && o.note.trim()) parts.push(`Комментарий: ${o.note.trim()}`);
  if (typeof o.value === "string" && o.value.trim()) parts.push(`Значение: ${o.value.trim()}`);
  if (parts.length > 0) return parts.join(" · ");
  const keys = Object.keys(o);
  if (keys.length === 0) return "Без деталей";
  return keys.map((k) => `${k}: ${JSON.stringify(o[k])}`).join("; ");
}

export function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

export function ruDaysWordN(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  const mod10 = n % 10;
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

export function buildProgressTabProgramDaysLabel(
  detail: TreatmentProgramInstanceDetail,
  patientCalendarDayIana: string,
  appDisplayTimeZone: string,
): string {
  const n = resolvePatientProgramProgressDaysForPatientUi(
    detail,
    DateTime.now(),
    patientCalendarDayIana,
    appDisplayTimeZone,
  );
  if (n == null) return "—";
  return `${n} ${ruDaysWordN(n)}`;
}

export function ruPassedStagesWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "этапов";
  const mod10 = n % 10;
  if (mod10 === 1) return "этап";
  if (mod10 >= 2 && mod10 <= 4) return "этапа";
  return "этапов";
}

export function buildProgramHistoryNarrative(detail: TreatmentProgramInstanceDetail, tz: string): string[] {
  const lines: string[] = [];
  lines.push(`Назначена — ${formatBookingDateLongRu(detail.createdAt, tz)}`);
  const pipelineStages = detail.stages.filter((s) => s.sortOrder > 0);
  const startedInstants = pipelineStages
    .map((s) => s.startedAt)
    .filter((x): x is string => x != null && String(x).trim() !== "");
  const minStarted =
    startedInstants.length === 0 ? null : startedInstants.reduce((a, b) => (a < b ? a : b));
  if (minStarted) {
    lines.push(`Старт выполнения — ${formatBookingDateLongRu(minStarted, tz)}`);
  } else {
    lines.push("Старт выполнения — пока не было");
  }
  const stagesByStart = [...pipelineStages]
    .filter((s) => s.startedAt != null && String(s.startedAt).trim() !== "")
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  for (const s of stagesByStart) {
    lines.push(`Открыт этап ${s.sortOrder} — ${formatBookingDateLongRu(String(s.startedAt), tz)}`);
  }
  if (detail.status === "completed") {
    lines.push(`Завершена — ${formatBookingDateLongRu(detail.updatedAt, tz)}`);
  }
  return lines;
}

export function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
