import { DateTime } from "luxon";
import type { PatientMoodScore, PatientMoodWeekDay } from "@/modules/patient-mood/types";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  days: readonly PatientMoodWeekDay[];
  /** IANA TZ (как на главной). */
  timeZone: string;
  /** Среднее за воскресенье перед текущей неделей (для моста пн). */
  previousSundayScore?: PatientMoodScore | null;
  /** Последняя оценка на прошлой неделе (пн–вс) перед текущим понедельником. */
  lastScoreBeforeWeek?: PatientMoodScore | null;
  className?: string;
};

const CHART_WIDTH = 280;
const CHART_HEIGHT = 40;
const POINT_X_STEP = CHART_WIDTH / 6;
const GRAPH_LEFT_X = 0;
const DAY_HALF = POINT_X_STEP / 2;
const TOP_PAD = 2;
const BOTTOM_PAD = 2;
const DASHED_STROKE = "rgb(148 163 184)";

/** Цвета линии по шкале 1–5 (как fallback-иконки эмодзи на главной). */
const MOOD_STROKE: Record<PatientMoodScore, string> = {
  1: "#dc2626",
  2: "#ea580c",
  3: "#f59e0b",
  4: "#65a30d",
  5: "#16a34a",
};

function moodStroke(score: number): string {
  if (score >= 1 && score <= 5) return MOOD_STROKE[score as PatientMoodScore];
  return "#64748b";
}

function labelForDay(isoDate: string, timeZone: string): string {
  const dt = DateTime.fromISO(isoDate, { zone: timeZone });
  const weekdayRaw = dt.setLocale("ru").toFormat("ccc");
  return weekdayRaw ? weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1) : "";
}

function yForScore(score: number): number {
  const minY = TOP_PAD;
  const maxY = CHART_HEIGHT - BOTTOM_PAD;
  const normalized = (score - 1) / 4;
  return maxY - normalized * (maxY - minY);
}

function dayCenterX(dayIndex: number): number {
  return dayIndex * POINT_X_STEP + DAY_HALF;
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

type WeekDayCell = { iso: string | null; weekday: string; score: number | null };

type ChartPoint = { x: number; y: number };

type StripSegment = {
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

function buildWeekStripSegments(
  week: readonly WeekDayCell[],
  todayIso: string,
  previousSundayScore: PatientMoodScore | null,
  lastScoreBeforeWeek: PatientMoodScore | null,
): StripSegment[] {
  const scoredIndices: number[] = [];
  for (let d = 0; d < 7; d += 1) {
    const iso = week[d]!.iso;
    if (week[d]!.score == null) continue;
    if (iso != null && iso > todayIso) continue;
    scoredIndices.push(d);
  }
  if (scoredIndices.length === 0) return [];

  const pointAt = (dayIndex: number): ChartPoint => {
    const s = week[dayIndex]!.score!;
    return { x: dayCenterX(dayIndex), y: yForScore(s) };
  };

  const segments: StripSegment[] = [];
  const first = scoredIndices[0]!;
  const firstScore = week[first]!.score as PatientMoodScore;
  const yLeadStart =
    lastScoreBeforeWeek != null ? yForScore(lastScoreBeforeWeek) : yForScore(firstScore);
  const leadEnd = pointAt(first);
  const sunToMonSolid =
    previousSundayScore != null && first === 0 && week[0]!.score != null;

  segments.push({
    key: `lead-${first}`,
    path: buildSmoothSegmentPath([
      { x: GRAPH_LEFT_X, y: yLeadStart },
      leadEnd,
    ]),
    kind: sunToMonSolid ? "solid" : "dashed",
    x0: GRAPH_LEFT_X,
    y0: yLeadStart,
    x1: leadEnd.x,
    y1: leadEnd.y,
    s0: sunToMonSolid ? previousSundayScore! : undefined,
    s1: sunToMonSolid ? firstScore : undefined,
  });

  for (let k = 0; k < scoredIndices.length - 1; k += 1) {
    const i = scoredIndices[k]!;
    const j = scoredIndices[k + 1]!;
    const p0 = pointAt(i);
    const p1 = pointAt(j);
    const consecutive = j === i + 1;
    segments.push({
      key: `seg-${i}-${j}`,
      path: buildSmoothSegmentPath([p0, p1]),
      kind: consecutive ? "solid" : "dashed",
      x0: p0.x,
      y0: p0.y,
      x1: p1.x,
      y1: p1.y,
      s0: consecutive ? (week[i]!.score as PatientMoodScore) : undefined,
      s1: consecutive ? (week[j]!.score as PatientMoodScore) : undefined,
    });
  }

  return segments;
}

/** Неделя пн–вс: сплошные участки — градиент между цветами соседних оценок; пропуски — серый пунктир (не в будущее). */
export function PatientHomeWellbeingWeekStrip({
  days,
  timeZone,
  previousSundayScore = null,
  lastScoreBeforeWeek = null,
  className,
}: Props) {
  const byDate = new Map(days.map((d) => [d.date, d.score] as const));
  const today = DateTime.now().setZone(timeZone).startOf("day");
  /** Понедельник текущей недели (Luxon: weekday 1 = пн). */
  const monday = today.minus({ days: today.weekday - 1 });
  const todayIso = DateTime.now().setZone(timeZone).toISODate();
  if (!todayIso) return null;

  const week = Array.from({ length: 7 }, (_, i) => {
    const dt = monday.plus({ days: i });
    const iso = dt.toISODate();
    const score = iso ? byDate.get(iso) ?? null : null;
    return {
      iso,
      weekday: iso ? labelForDay(iso, timeZone) : "",
      score,
    };
  });

  const stripSegments = buildWeekStripSegments(week, todayIso, previousSundayScore, lastScoreBeforeWeek);

  const mondayIso = monday.toISODate() ?? "wk";
  const gradPrefix = `mood-wk-${mondayIso.replace(/-/g, "")}`;

  const solidSegments = stripSegments.filter(
    (s): s is StripSegment & { s0: PatientMoodScore; s1: PatientMoodScore } =>
      s.kind === "solid" && s.s0 != null && s.s1 != null,
  );
  const todayIdx = week.findIndex((d) => d.iso === todayIso);

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col px-0.5", className)}>
      <div className="relative min-h-[2rem] w-full flex-1">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="График самочувствия за неделю"
        >
          <defs>
            {solidSegments.map((seg) => (
                <linearGradient
                  key={seg.key}
                  id={`${gradPrefix}-${seg.key}`}
                  gradientUnits="userSpaceOnUse"
                  x1={seg.x0}
                  y1={seg.y0}
                  x2={seg.x1}
                  y2={seg.y1}
                >
                  <stop offset="0%" stopColor={moodStroke(seg.s0)} />
                  <stop offset="100%" stopColor={moodStroke(seg.s1)} />
                </linearGradient>
            ))}
          </defs>
          {stripSegments
            .filter((s) => s.kind === "dashed")
            .map((seg) => (
              <path
                key={seg.key}
                d={seg.path}
                fill="none"
                stroke={DASHED_STROKE}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="4 3"
              />
            ))}
          {solidSegments.map((seg) => (
            <path
              key={seg.key}
              d={seg.path}
              fill="none"
              stroke={`url(#${gradPrefix}-${seg.key})`}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {todayIdx >= 0 ?
            <line
              x1={todayIdx * POINT_X_STEP}
              y1={TOP_PAD}
              x2={todayIdx * POINT_X_STEP}
              y2={CHART_HEIGHT - BOTTOM_PAD}
              stroke="#93c5fd"
              strokeWidth={1}
              strokeLinecap="round"
            />
          : null}
        </svg>
      </div>

      <div
        className="mt-0.5 grid shrink-0 grid-cols-7 gap-0"
        role="list"
        aria-label="Дни недели (понедельник-воскресенье)"
      >
        {week.map((d) => (
          <span
            key={d.iso ?? d.weekday}
            role="listitem"
            className={cn(patientMutedTextClass, "min-w-0 truncate text-center text-[9px] leading-none")}
          >
            {d.weekday}
          </span>
        ))}
      </div>
    </div>
  );
}
