import { DateTime } from "luxon";
import type { PatientMoodScore, PatientMoodWeekMark } from "@/modules/patient-mood/types";

export const HOME_WELLBEING_STRIP_CHART_WIDTH = 280;
export const HOME_WELLBEING_STRIP_CHART_HEIGHT = 40;
/** Скользящее окно на главной «Сегодня»: последние N календарных дней включая сегодня. */
export const HOME_WELLBEING_STRIP_DAY_COUNT = 3;
const TOP_PAD = 2;
const BOTTOM_PAD = 2;

type StripPoint = { x: number; y: number; score: PatientMoodScore };

export type HomeWellbeingStripSegment = {
  key: string;
  path: string;
  kind: "solid" | "dashed";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  s0?: PatientMoodScore;
  s1?: PatientMoodScore;
};

export type BuildHomeWellbeingStripChartInput = {
  marks: readonly PatientMoodWeekMark[];
  timeZone: string;
  todayIso: string;
  /** Локальная дата первого дня окна (включительно). */
  windowStartIso: string;
  nowMs: number;
  /** Были instant-отметки в календарный день непосредственно перед окном. */
  anchorDayBeforeWindowHadMarks: boolean;
  /** Последняя оценка в этот день (сплошной мост от левого края). */
  anchorDayBeforeWindowLastScore: PatientMoodScore | null;
  /** Последняя instant-оценка строго до начала окна. */
  lastScoreBeforeWindow: PatientMoodScore | null;
};

export function yForWellbeingStripScore(score: number): number {
  const minY = TOP_PAD;
  const maxY = HOME_WELLBEING_STRIP_CHART_HEIGHT - BOTTOM_PAD;
  const normalized = (score - 1) / 4;
  return maxY - normalized * (maxY - minY);
}

export function weekStripTimeToX(ms: number, windowStartMs: number, windowEndMs: number): number {
  if (windowEndMs <= windowStartMs) return 0;
  const clamped = Math.max(windowStartMs, Math.min(ms, windowEndMs));
  const t = (clamped - windowStartMs) / (windowEndMs - windowStartMs);
  return t * HOME_WELLBEING_STRIP_CHART_WIDTH;
}

function buildSmoothSegmentPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const cx = prev.x + (curr.x - prev.x) / 2;
    path += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return path;
}

function clipPointsAtX(points: StripPoint[], maxX: number): StripPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const out: StripPoint[] = [];
  for (const p of sorted) {
    if (p.x <= maxX) {
      out.push(p);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && prev.x < maxX) {
      const span = p.x - prev.x;
      const u = span === 0 ? 0 : (maxX - prev.x) / span;
      out.push({ x: maxX, y: prev.y + u * (p.y - prev.y), score: prev.score });
    }
    break;
  }
  return out;
}

function segmentBetween(
  key: string,
  a: StripPoint,
  b: StripPoint,
  kind: "solid" | "dashed",
): HomeWellbeingStripSegment {
  return {
    key,
    path: buildSmoothSegmentPath([a, b]),
    kind,
    x0: a.x,
    y0: a.y,
    x1: b.x,
    y1: b.y,
    s0: kind === "solid" ? a.score : undefined,
    s1: kind === "solid" ? b.score : undefined,
  };
}

/**
 * Линия по instant-отметкам; всегда обрезается по вертикали «Сейчас» (nowX).
 * Ось X — скользящее окно [windowStart, конец сегодня]; nowX показывает текущий момент внутри сегодня.
 * Пунктир только: lead без якорного дня; хвост до nowX, если сегодня нет оценки.
 * Если сегодня была оценка — сплошной хвост от последней сегодняшней точки до nowX.
 */
export function buildPatientHomeWellbeingWeekStripChart(
  input: BuildHomeWellbeingStripChartInput,
): { segments: HomeWellbeingStripSegment[]; nowX: number } {
  const {
    marks,
    timeZone,
    todayIso,
    windowStartIso,
    nowMs,
    anchorDayBeforeWindowHadMarks,
    anchorDayBeforeWindowLastScore,
    lastScoreBeforeWindow,
  } = input;

  const windowStartMs = DateTime.fromISO(windowStartIso, { zone: timeZone }).startOf("day").toMillis();
  const windowEndMs = DateTime.fromISO(todayIso, { zone: timeZone }).plus({ days: 1 }).startOf("day").toMillis();
  const nowX = weekStripTimeToX(nowMs, windowStartMs, windowEndMs);

  const markPoints: StripPoint[] = marks
    .map((m) => ({
      x: weekStripTimeToX(new Date(m.recordedAt).getTime(), windowStartMs, windowEndMs),
      y: yForWellbeingStripScore(m.score),
      score: m.score,
    }))
    .filter((p) => p.x <= nowX + 1e-6)
    .sort((a, b) => a.x - b.x);

  const clippedMarks = clipPointsAtX(markPoints, nowX);
  const hasMarkToday = marks.some(
    (m) => DateTime.fromISO(m.recordedAt, { zone: "utc" }).setZone(timeZone).toISODate() === todayIso,
  );

  const segments: HomeWellbeingStripSegment[] = [];
  if (clippedMarks.length === 0) {
    return { segments, nowX };
  }

  const first = clippedMarks[0]!;

  if (!anchorDayBeforeWindowHadMarks) {
    const yLead =
      lastScoreBeforeWindow != null ? yForWellbeingStripScore(lastScoreBeforeWindow) : first.y;
    const leadScore = lastScoreBeforeWindow ?? first.score;
    segments.push(
      segmentBetween("lead", { x: 0, y: yLead, score: leadScore }, first, "dashed"),
    );
  } else if (anchorDayBeforeWindowLastScore != null) {
    const anchor: StripPoint = {
      x: 0,
      y: yForWellbeingStripScore(anchorDayBeforeWindowLastScore),
      score: anchorDayBeforeWindowLastScore,
    };
    segments.push(segmentBetween("window-anchor", anchor, first, "solid"));
  }

  const solidLoopStart = anchorDayBeforeWindowHadMarks ? 1 : 0;
  for (let i = solidLoopStart; i < clippedMarks.length - 1; i += 1) {
    segments.push(
      segmentBetween(`solid-${i}`, clippedMarks[i]!, clippedMarks[i + 1]!, "solid"),
    );
  }

  const sortedMarks = [...marks].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  const lastMarkPointForDay = (dayIso: string): StripPoint | null => {
    for (let i = sortedMarks.length - 1; i >= 0; i -= 1) {
      const m = sortedMarks[i]!;
      const localD = DateTime.fromISO(m.recordedAt, { zone: "utc" }).setZone(timeZone).toISODate();
      if (localD === dayIso) {
        return {
          x: weekStripTimeToX(new Date(m.recordedAt).getTime(), windowStartMs, windowEndMs),
          y: yForWellbeingStripScore(m.score),
          score: m.score,
        };
      }
    }
    return null;
  };

  const appendTailToNow = (tailFrom: StripPoint, kind: "solid" | "dashed") => {
    if (tailFrom.x >= nowX - 1e-6) return;
    segments.push(
      segmentBetween(
        "tail-now",
        tailFrom,
        { x: nowX, y: tailFrom.y, score: tailFrom.score },
        kind,
      ),
    );
  };

  if (!hasMarkToday) {
    const yesterdayIso = DateTime.fromISO(todayIso, { zone: timeZone }).minus({ days: 1 }).toISODate();
    const tailFrom = lastMarkPointForDay(yesterdayIso ?? "") ?? clippedMarks[clippedMarks.length - 1]!;
    appendTailToNow(tailFrom, "dashed");
  } else {
    const tailFrom = lastMarkPointForDay(todayIso) ?? clippedMarks[clippedMarks.length - 1]!;
    appendTailToNow(tailFrom, "solid");
  }

  return { segments, nowX };
}
