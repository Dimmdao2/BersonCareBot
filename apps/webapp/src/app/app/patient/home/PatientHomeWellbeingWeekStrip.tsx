import { DateTime } from "luxon";
import type { PatientMoodScore, PatientMoodWeekDay } from "@/modules/patient-mood/types";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  days: readonly PatientMoodWeekDay[];
  /** IANA TZ (как на главной). */
  timeZone: string;
  className?: string;
};

const CHART_WIDTH = 280;
const CHART_HEIGHT = 40;
const POINT_X_STEP = CHART_WIDTH / 6;
const TOP_PAD = 2;
const BOTTOM_PAD = 2;

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

/** Интерполяция Y по дням без оценки (линейно между ближайшими реальными точками). */
function interpolatedYs(scores: Array<number | null>): number[] {
  const n = scores.length;
  const yKnown = scores.map((s) => (s == null ? null : yForScore(s)));
  const y: number[] = new Array(n);
  const neutral = yForScore(3);

  for (let i = 0; i < n; i += 1) {
    if (yKnown[i] != null) {
      y[i] = yKnown[i]!;
      continue;
    }
    let L = -1;
    let R = n;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (yKnown[j] != null) {
        L = j;
        break;
      }
    }
    for (let j = i + 1; j < n; j += 1) {
      if (yKnown[j] != null) {
        R = j;
        break;
      }
    }
    if (L >= 0 && R < n) {
      const t = (i - L) / (R - L);
      y[i] = yKnown[L]! + t * (yKnown[R]! - yKnown[L]!);
    } else if (L >= 0) {
      y[i] = yKnown[L]!;
    } else if (R < n) {
      y[i] = yKnown[R]!;
    } else {
      y[i] = neutral;
    }
  }
  return y;
}

type SolidEdge = {
  key: string;
  path: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  s0: PatientMoodScore;
  s1: PatientMoodScore;
};

/** Неделя пн–вс: сплошные участки — градиент между цветами соседних оценок; пропуски — серый пунктир (не в будущее). */
export function PatientHomeWellbeingWeekStrip({ days, timeZone, className }: Props) {
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

  const scores = week.map((w) => w.score);
  const ys = interpolatedYs(scores);
  const points = week.map((_, i) => ({ x: i * POINT_X_STEP, y: ys[i]! }));

  const solidEdges: SolidEdge[] = [];
  let i = 0;
  while (i < 6) {
    const both = week[i]!.score != null && week[i + 1]!.score != null;
    if (both) {
      let j = i;
      while (j < 6 && week[j]!.score != null && week[j + 1]!.score != null) {
        const p0 = points[j]!;
        const p1 = points[j + 1]!;
        const s0 = week[j]!.score!;
        const s1 = week[j + 1]!.score!;
        solidEdges.push({
          key: `e-${j}`,
          path: buildSmoothSegmentPath([p0, p1]),
          x0: p0.x,
          y0: p0.y,
          x1: p1.x,
          y1: p1.y,
          s0,
          s1,
        });
        j += 1;
      }
      i = j;
    } else {
      i += 1;
    }
  }

  const mondayIso = monday.toISODate() ?? "wk";
  const gradPrefix = `mood-wk-${mondayIso.replace(/-/g, "")}`;

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
            {solidEdges.map((e, idx) => (
              <linearGradient
                key={e.key}
                id={`${gradPrefix}-g${idx}`}
                gradientUnits="userSpaceOnUse"
                x1={e.x0}
                y1={e.y0}
                x2={e.x1}
                y2={e.y1}
              >
                <stop offset="0%" stopColor={moodStroke(e.s0)} />
                <stop offset="100%" stopColor={moodStroke(e.s1)} />
              </linearGradient>
            ))}
          </defs>
          {Array.from({ length: 6 }, (_, k) => {
            const x0 = points[k]!.x;
            const y0 = points[k]!.y;
            const x1 = points[k + 1]!.x;
            const y1 = points[k + 1]!.y;
            const solidSeg = week[k]!.score != null && week[k + 1]!.score != null;
            const endIso = week[k + 1]!.iso;
            const endsInFuture = endIso != null && endIso > todayIso;
            if (solidSeg || endsInFuture) return null;
            return (
              <line
                key={`bridge-${k}`}
                x1={x0}
                y1={y0}
                x2={x1}
                y2={y1}
                stroke="rgb(148 163 184)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeDasharray="4 3"
              />
            );
          })}
          {solidEdges.map((e, idx) => (
            <path
              key={e.key}
              d={e.path}
              fill="none"
              stroke={`url(#${gradPrefix}-g${idx})`}
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
