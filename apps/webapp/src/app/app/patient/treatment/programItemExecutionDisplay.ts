import { DateTime } from "luxon";
import {
  calendarDaysFromUtcIsoToNowInZone,
  formatRelativePatientCalendarDayRu,
} from "@/modules/treatment-program/stage-semantics";

export const MAX_PROGRAM_ITEM_TODAY_DOTS = 24;

export type ProgramItemExecutionDotsVariant = "green" | "gray";

export function resolveProgramItemExecutionDots(params: {
  lastIso: string | null | undefined;
  todayCount: number;
  zone: string;
  now?: DateTime;
}): { variant: ProgramItemExecutionDotsVariant; dotCount: number; dotOverflow: number } {
  const { lastIso, todayCount, zone, now } = params;
  if (!lastIso?.trim()) {
    return { variant: "gray", dotCount: 1, dotOverflow: 0 };
  }
  const calendarDays = calendarDaysFromUtcIsoToNowInZone(lastIso, zone, now);
  if (calendarDays === 0) {
    const capped = Math.min(Math.max(todayCount, 0), MAX_PROGRAM_ITEM_TODAY_DOTS);
    const dotCount = capped > 0 ? capped : 1;
    const dotOverflow = todayCount > MAX_PROGRAM_ITEM_TODAY_DOTS ? todayCount - MAX_PROGRAM_ITEM_TODAY_DOTS : 0;
    return { variant: "green", dotCount, dotOverflow };
  }
  return { variant: "gray", dotCount: 1, dotOverflow: 0 };
}

/** Patient-facing «Выполнялось: …» without duplicate «Сегодня N раз». */
export function formatProgramItemExecutionLabel(params: {
  lastIso: string | null | undefined;
  zone: string;
  now?: DateTime;
}): string {
  const { lastIso, zone, now } = params;
  if (!lastIso?.trim()) return "Выполнялось: никогда";
  const rel = formatRelativePatientCalendarDayRu(lastIso, zone, now);
  if (rel === "Сегодня") return "Выполнялось: сегодня";
  if (rel === "Вчера") return "Выполнялось: вчера";
  return `Выполнялось: ${rel}`;
}

export type ProgramItemLastDoneSummary = {
  reps: number | null;
  sets?: number | null;
  weightKg: number | null;
};

export function formatProgramItemLastDoneSummaryText(
  summary: ProgramItemLastDoneSummary | null | undefined,
): string | null {
  if (!summary) return null;
  const { reps, sets, weightKg } = summary;
  const repsSetsText = reps != null && sets != null ? `${reps} × ${sets}` : reps != null ? String(reps) : null;
  if (repsSetsText && weightKg != null) {
    return `сделано ${repsSetsText} с весом ${weightKg} кг`;
  }
  if (repsSetsText) {
    return `сделано ${repsSetsText}`;
  }
  if (weightKg != null) {
    return `сделано с весом ${weightKg} кг`;
  }
  return null;
}
