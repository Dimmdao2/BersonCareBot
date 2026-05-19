import { DateTime } from "luxon";
import type { PatientMoodScore, PatientMoodWeekMark } from "@/modules/patient-mood/types";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";
import {
  buildPatientHomeWellbeingWeekStripChart,
  HOME_WELLBEING_STRIP_CHART_HEIGHT,
  HOME_WELLBEING_STRIP_CHART_WIDTH,
} from "./buildPatientHomeWellbeingWeekStripChart";

type Props = {
  marks: readonly PatientMoodWeekMark[];
  /** IANA TZ (как на главной). */
  timeZone: string;
  previousSundayHadMarks?: boolean;
  previousSundayLastScore?: PatientMoodScore | null;
  /** Последняя оценка на прошлой неделе (пн–вс) перед текущим понедельником. */
  lastScoreBeforeWeek?: PatientMoodScore | null;
  className?: string;
};

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

/** Неделя пн–вс: линия по всем instant-отметкам до «Сейчас»; пунктир — только lead без вс и хвост без оценки сегодня. */
export function PatientHomeWellbeingWeekStrip({
  marks,
  timeZone,
  previousSundayHadMarks = false,
  previousSundayLastScore = null,
  lastScoreBeforeWeek = null,
  className,
}: Props) {
  const today = DateTime.now().setZone(timeZone).startOf("day");
  const monday = today.minus({ days: today.weekday - 1 });
  const todayIso = DateTime.now().setZone(timeZone).toISODate();
  if (!todayIso) return null;

  const weekMondayIso = monday.toISODate();
  if (!weekMondayIso) return null;

  const week = Array.from({ length: 7 }, (_, i) => {
    const dt = monday.plus({ days: i });
    const iso = dt.toISODate();
    return {
      iso,
      weekday: iso ? labelForDay(iso, timeZone) : "",
    };
  });

  const { segments: stripSegments, nowX } = buildPatientHomeWellbeingWeekStripChart({
    marks,
    timeZone,
    todayIso,
    weekMondayIso,
    nowMs: Date.now(),
    previousSundayHadMarks,
    previousSundayLastScore,
    lastScoreBeforeWeek,
  });

  const gradPrefix = `mood-wk-${weekMondayIso.replace(/-/g, "")}`;

  const solidSegments = stripSegments.filter(
    (s): s is (typeof stripSegments)[number] & { s0: PatientMoodScore; s1: PatientMoodScore } =>
      s.kind === "solid" && s.s0 != null && s.s1 != null,
  );

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col px-0.5", className)}>
      <div className="relative min-h-[2rem] w-full flex-1">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${HOME_WELLBEING_STRIP_CHART_WIDTH} ${HOME_WELLBEING_STRIP_CHART_HEIGHT}`}
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
          <line
            x1={nowX}
            y1={2}
            x2={nowX}
            y2={HOME_WELLBEING_STRIP_CHART_HEIGHT - 2}
            stroke="#93c5fd"
            strokeWidth={1}
            strokeLinecap="round"
          />
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
