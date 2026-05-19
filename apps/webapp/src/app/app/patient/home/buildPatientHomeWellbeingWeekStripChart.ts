import { DateTime } from "luxon";
import type { PatientMoodScore, PatientMoodWeekMark } from "@/modules/patient-mood/types";

export const HOME_WELLBEING_STRIP_CHART_WIDTH = 280;
export const HOME_WELLBEING_STRIP_CHART_HEIGHT = 40;
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
  weekMondayIso: string;
  nowMs: number;
  previousSundayHadMarks: boolean;
  previousSundayLastScore: PatientMoodScore | null;
  lastScoreBeforeWeek: PatientMoodScore | null;
};

export function yForWellbeingStripScore(score: number): number {
  const minY = TOP_PAD;
  const maxY = HOME_WELLBEING_STRIP_CHART_HEIGHT - BOTTOM_PAD;
  const normalized = (score - 1) / 4;
  return maxY - normalized * (maxY - minY);
}

export function weekStripTimeToX(ms: number, weekStartMs: number, weekEndMs: number): number {
  if (weekEndMs <= weekStartMs) return 0;
  const clamped = Math.max(weekStartMs, Math.min(ms, weekEndMs));
  const t = (clamped - weekStartMs) / (weekEndMs - weekStartMs);
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
 * Линия по всем instant-отметкам; обрезка по «Сейчас»; пунктир только:
 * - от левого края до первой отметки, если в прошлое воскресенье не было отметок;
 * - от последней вчерашней точки до отсечки «Сейчас», если сегодня ещё нет оценки.
 */
export function buildPatientHomeWellbeingWeekStripChart(
  input: BuildHomeWellbeingStripChartInput,
): { segments: HomeWellbeingStripSegment[]; nowX: number } {
  const {
    marks,
    timeZone,
    todayIso,
    weekMondayIso,
    nowMs,
    previousSundayHadMarks,
    previousSundayLastScore,
    lastScoreBeforeWeek,
  } = input;

  const weekStartMs = DateTime.fromISO(weekMondayIso, { zone: timeZone }).startOf("day").toMillis();
  const weekEndMs = DateTime.fromISO(weekMondayIso, { zone: timeZone }).plus({ days: 7 }).startOf("day").toMillis();
  const nowX = weekStripTimeToX(nowMs, weekStartMs, weekEndMs);

  const markPoints: StripPoint[] = marks
    .map((m) => ({
      x: weekStripTimeToX(new Date(m.recordedAt).getTime(), weekStartMs, weekEndMs),
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

  if (!previousSundayHadMarks) {
    const yLead =
      lastScoreBeforeWeek != null ? yForWellbeingStripScore(lastScoreBeforeWeek) : first.y;
    const leadScore = lastScoreBeforeWeek ?? first.score;
    segments.push(
      segmentBetween("lead", { x: 0, y: yLead, score: leadScore }, first, "dashed"),
    );
  } else if (previousSundayLastScore != null) {
    const anchor: StripPoint = {
      x: 0,
      y: yForWellbeingStripScore(previousSundayLastScore),
      score: previousSundayLastScore,
    };
    segments.push(segmentBetween("sun-mon", anchor, first, "solid"));
  }

  const solidLoopStart = previousSundayHadMarks ? 1 : 0;
  for (let i = solidLoopStart; i < clippedMarks.length - 1; i += 1) {
    segments.push(
      segmentBetween(`solid-${i}`, clippedMarks[i]!, clippedMarks[i + 1]!, "solid"),
    );
  }

  if (!hasMarkToday) {
    const yesterdayIso = DateTime.fromISO(todayIso, { zone: timeZone }).minus({ days: 1 }).toISODate();
    let tailFrom: StripPoint | null = null;
    const sortedMarks = [...marks].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    for (let i = sortedMarks.length - 1; i >= 0; i -= 1) {
      const m = sortedMarks[i]!;
      const localD = DateTime.fromISO(m.recordedAt, { zone: "utc" }).setZone(timeZone).toISODate();
      if (localD === yesterdayIso) {
        tailFrom = {
          x: weekStripTimeToX(new Date(m.recordedAt).getTime(), weekStartMs, weekEndMs),
          y: yForWellbeingStripScore(m.score),
          score: m.score,
        };
        break;
      }
    }
    if (!tailFrom) {
      tailFrom = clippedMarks[clippedMarks.length - 1]!;
    }
    if (tailFrom.x < nowX - 1e-6) {
      segments.push(
        segmentBetween("tail-now", tailFrom, { x: nowX, y: tailFrom.y, score: tailFrom.score }, "dashed"),
      );
    }
  }

  return { segments, nowX };
}
