"use client";

/**
 * PatientTabOverview — Wave 3: full «Обзор» UI.
 * Two columns 50/50:
 *   LEFT  — KPIs · Сигналы · Актуальные симптомы · Динамика симптомов · Выполнение упражнений
 *   RIGHT — Заметки · Задачи · Программа и комментарии · Сообщения
 *
 * All data is MOCK inline; mark TODO(backend) where real sources are needed.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorSectionItemClass,
  doctorStatCardShellClass,
  doctorMetricValueClass,
  doctorMetricLabelClass,
} from "@/shared/ui/doctor/doctorVisual";

// ---------------------------------------------------------------------------
// Types (mock data shapes)
// ---------------------------------------------------------------------------

type Signal = { id: string; text: string; link: string };

type Symptom = {
  id: string;
  location: string; // e.g. "Бедро / правое / боль ноющая"
  score: number; // current 0-10
  prevScore?: number; // previous visit score
  since?: string; // e.g. "05.01"
  isPrimary: boolean;
};

type SymptomSeries = {
  name: string;
  color: string;
  points: Array<{ visit: string; score: number }>; // visit label + score
};

type CalendarDay = {
  day: number;
  status: "full" | "partial" | "missed" | "no-assign" | "future" | "today";
  /** 0–1 completion ratio for shading partial */
  ratio?: number;
};

type Note = { id: string; text: string; pinned: boolean; date?: string };
type Task = { id: string; text: string; deadline: string; overdue: boolean };

type ExerciseRow = {
  id: string;
  icon: string;
  name: string;
  lastMark: "easy" | "medium" | "hard" | null;
  lastMarkLabel: string; // e.g. "12 кг × 15"
  commentCount: number;
  hasUnread: boolean;
};

type ProgramBlock = { id: string; label: string; exercises: ExerciseRow[] };

type Message = {
  id: string;
  senderName: string;
  text: string;
  date: string;
  isPatient: boolean;
  isUnread: boolean;
};

// ---------------------------------------------------------------------------
// MOCK DATA — TODO(backend) replace with real API calls
// ---------------------------------------------------------------------------

/** TODO(backend): fetch from program stage / appointment_records */
const MOCK_CONTROL_DAYS = 9;
const MOCK_CONTROL_DATE = "21.06";
const MOCK_CONTROL_STAGE = "конец этапа 2";

/** TODO(backend): fetch from memberships table */
const MOCK_MEMBERSHIP_USED = 4;
const MOCK_MEMBERSHIP_TOTAL = 10;
const MOCK_MEMBERSHIP_UNTIL = "до 31.07";

/** TODO(backend): fetch from patient signals (from «Сегодня» feed) */
const MOCK_SIGNALS: Signal[] = [
  { id: "s1", text: "Не выполняет упражнения 5 дней подряд", link: "программа" },
  { id: "s2", text: "Тест «Наклон вперёд» ждёт проверки 3 дня", link: "тест" },
];

/** TODO(backend): fetch from card complaint/diagnosis model */
const MOCK_SYMPTOMS: Symptom[] = [
  { id: "sym1", location: "Бедро / правое / боль ноющая", score: 2, prevScore: 5, since: "05.01", isPrimary: true },
  { id: "sym2", location: "Поясница (низ) / слева / боль тянущая, мышечная", score: 4, since: "05.01", isPrimary: false },
];

/** TODO(backend): pull symptom scores from visits history */
const MOCK_SYMPTOM_SERIES: SymptomSeries[] = [
  {
    name: "Поясница · 4/10",
    color: "#c2812e",
    points: [
      { visit: "05.01 · первичный", score: 6 },
      { visit: "15.01", score: 5 },
      { visit: "22.01", score: 4 },
    ],
  },
  {
    name: "⚑ Бедро · 2/10",
    color: "var(--primary, #3b82f6)",
    points: [
      { visit: "05.01 · первичный", score: 5 },
      { visit: "15.01", score: 3 },
      { visit: "22.01", score: 2 },
    ],
  },
];

/** June 2026 exercise calendar — 30 days, today = 14 */
const TODAY_DAY = 14;
const MOCK_JUNE_CALENDAR: CalendarDay[] = [
  { day: 1, status: "full" },
  { day: 2, status: "partial", ratio: 0.5 },
  { day: 3, status: "missed" },
  { day: 4, status: "full" },
  { day: 5, status: "partial", ratio: 0.25 },
  { day: 6, status: "full" },
  { day: 7, status: "no-assign" },
  { day: 8, status: "missed" },
  { day: 9, status: "missed" },
  { day: 10, status: "missed" },
  { day: 11, status: "missed" },
  { day: 12, status: "missed" },
  { day: 13, status: "no-assign" },
  { day: 14, status: "today" },
  ...Array.from({ length: 16 }, (_, i) => ({ day: 15 + i, status: "future" as const })),
];

/** TODO(backend): notes from entity_comments / notes table */
const MOCK_NOTES: Note[] = [
  { id: "n1", text: "Не давать осевую нагрузку до контрольного МРТ (июль)", pinned: true },
  { id: "n2", text: "Мануальные техники не любит — только мягкие методики", pinned: true },
  { id: "n3", text: "Просил счёт для работодателя за абонемент", pinned: false, date: "18.05" },
];

/** TODO(backend): tasks from tasks/todos table */
const MOCK_TASKS: Task[] = [
  { id: "t1", text: "Проверить технику наклона по видео", deadline: "до 13.06", overdue: true },
  { id: "t2", text: "Скорректировать программу после контрольного МРТ", deadline: "до 04.07", overdue: false },
];

/** TODO(backend): program stage from treatment_program_instances + stages */
const MOCK_STAGE = { current: 2, total: 4, name: "Укрепление", activeDays: 12, totalDays: 21 };
const MOCK_PROGRAM_BLOCKS: ProgramBlock[] = [
  {
    id: "b1",
    label: "Блок 1 · Силовые",
    exercises: [
      { id: "e1", icon: "🏋️", name: "Ягодичный мост на двух ногах с резиной", lastMark: "medium", lastMarkLabel: "12 кг × 15", commentCount: 4, hasUnread: true },
      { id: "e2", icon: "🦵", name: "Подъёмы на носок одной ноги", lastMark: "easy", lastMarkLabel: "× 20", commentCount: 1, hasUnread: false },
      { id: "e3", icon: "🧎", name: "Обратный нордический наклон, эксцентрика", lastMark: "hard", lastMarkLabel: "× 8", commentCount: 0, hasUnread: false },
      { id: "e4", icon: "🙇", name: "Разгибания в наклоне", lastMark: "medium", lastMarkLabel: "8 кг × 12", commentCount: 1, hasUnread: false },
    ],
  },
  {
    id: "b2",
    label: "Блок 2 · Мобилизация и растяжка",
    exercises: [
      { id: "e5", icon: "🧘", name: "Поза ребёнка в динамике", lastMark: null, lastMarkLabel: "", commentCount: 2, hasUnread: true },
      { id: "e6", icon: "🦿", name: "Вращения бедра на одной ноге", lastMark: "easy", lastMarkLabel: "× 12", commentCount: 0, hasUnread: false },
    ],
  },
];

/** TODO(backend): messages from conversation thread */
const MOCK_MESSAGES: Message[] = [
  { id: "m1", senderName: "Егор", text: "После вчерашнего комплекса утром спина не болела — впервые за месяц", date: "11.06", isPatient: true, isUnread: true },
  { id: "m2", senderName: "Егор", text: "Можно ли заменить планку на боковую? В классической тянет поясницу", date: "11.06", isPatient: true, isUnread: true },
  { id: "m3", senderName: "Вы", text: "Пришлите видео наклона — посмотрю технику", date: "09.06", isPatient: false, isUnread: false },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** KPI pill — "Контроль" / "Абонемент" */
function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={cn(doctorStatCardShellClass, "flex flex-col gap-0.5")}>
      <span className={doctorMetricLabelClass}>{label}</span>
      <span className={cn(doctorMetricValueClass, "text-base")}>{value}</span>
      <span className="text-xs text-muted-foreground leading-tight">{hint}</span>
    </div>
  );
}

/** Symptom score badge */
function ScoreBadge({ score, size = "base" }: { score: number; size?: "base" | "sm" }) {
  const cls = size === "base"
    ? "text-xs font-bold text-primary bg-primary/10 rounded-[9px] px-2 py-0.5 tabular-nums"
    : "text-[10.5px] font-bold text-primary bg-primary/10 rounded-lg px-1.5 py-0 tabular-nums";
  return <span className={cls}>{score}/10</span>;
}

/** Last-mark dumbbell icon for exercise rows */
function DumbbellMark({ mark }: { mark: ExerciseRow["lastMark"] }) {
  if (!mark) return null;
  const color = mark === "easy" ? "#1f9d55" : mark === "medium" ? "var(--primary, #3b82f6)" : "#2b3442";
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" style={{ flex: "none", alignSelf: "center" }}>
      <path d="M4.4 6 A2.6 2.6 0 0 1 9.6 6" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="7" cy="9.2" r="3.9" fill={color} />
    </svg>
  );
}

/** Inline SVG symptom dynamics chart */
function SymptomChart({ series }: { series: SymptomSeries[] }) {
  if (series.length === 0 || series[0].points.length === 0) return null;

  const W = 480;
  const H = 168;
  const padLeft = 34;
  const padRight = 14;
  const padTop = 10;
  const chartH = 130;
  const chartW = W - padLeft - padRight;

  // Y gridlines at 0,2,4,6,8,10
  const yLabels = [10, 8, 6, 4, 2, 0];
  const yOf = (score: number) => padTop + ((10 - score) / 10) * chartH;
  const xLabels = series[0].points.map((p) => p.visit);
  const nPoints = series[0].points.length;
  const xOf = (i: number) => padLeft + (i / Math.max(nPoints - 1, 1)) * chartW;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* Grid lines */}
      <g stroke="#edf0f5" strokeWidth="1">
        {yLabels.map((v) => (
          <line key={v} x1={padLeft} y1={yOf(v)} x2={W - padRight} y2={yOf(v)} />
        ))}
      </g>
      {/* Y axis labels */}
      <g fontSize="9" fill="#8b95a3">
        {yLabels.map((v) => (
          <text key={v} x={padLeft - 6} y={yOf(v) + 3} textAnchor="end">{v}</text>
        ))}
      </g>
      {/* Series */}
      {series.map((s) => {
        const pts = s.points.map((p, i) => `${xOf(i)},${yOf(p.score)}`).join(" ");
        return (
          <g key={s.name}>
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" />
            {s.points.map((p, i) => (
              <circle
                key={i}
                cx={xOf(i)}
                cy={yOf(p.score)}
                r={i === s.points.length - 1 ? 3.5 : 3}
                fill={s.color}
              />
            ))}
          </g>
        );
      })}
      {/* X axis visit labels */}
      <g fontSize="9.5" fill="#5a6675">
        {xLabels.map((label, i) => (
          <text key={i} x={xOf(i)} y={H - 12} textAnchor="middle">{label}</text>
        ))}
      </g>
    </svg>
  );
}

/** Exercise calendar cell */
function CalendarCell({ day }: { day: CalendarDay }) {
  let bg = "";
  let textColor = "";
  let ring = "";

  switch (day.status) {
    case "full":
      bg = "bg-primary";
      textColor = "text-white font-semibold";
      break;
    case "partial":
      // shade by ratio: lighter for lower completion
      bg = day.ratio && day.ratio > 0.4 ? "bg-[hsl(215_45%_76%)]" : "bg-[hsl(215_45%_89%)]";
      textColor = day.ratio && day.ratio > 0.4 ? "text-white font-semibold" : "text-muted-foreground";
      break;
    case "missed":
      bg = "bg-background border border-border";
      textColor = "text-muted-foreground";
      break;
    case "no-assign":
      bg = "bg-muted/40";
      textColor = "text-muted-foreground/50";
      break;
    case "today":
      bg = "bg-background border border-border";
      textColor = "text-muted-foreground";
      ring = "ring-2 ring-[#e8c84a] ring-inset";
      break;
    case "future":
      bg = "bg-muted/20";
      textColor = "text-muted-foreground/40";
      break;
  }

  return (
    <div
      className={cn(
        "h-[26px] rounded-md flex items-center justify-center text-[10px]",
        bg,
        textColor,
        ring,
      )}
    >
      {day.day}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabOverview({ userId: _userId, header: _header }: Props) {
  const [calView, setCalView] = useState<"month" | "week">("month");
  const [programStageOffset, setProgramStageOffset] = useState(0);

  // Mock total program new comments
  const totalProgramUnread = MOCK_PROGRAM_BLOCKS.flatMap((b) => b.exercises).filter((e) => e.hasUnread).length;
  const totalMessageUnread = MOCK_MESSAGES.filter((m) => m.isUnread).length;

  // Week view: 7 days around today (days 8-14)
  const WEEK_DAYS: CalendarDay[] = MOCK_JUNE_CALENDAR.slice(7, 14);

  const calDays = calView === "month" ? MOCK_JUNE_CALENDAR : WEEK_DAYS;

  // June 2026 starts on Monday (day 1 = Mon). June 1 is a Monday.
  const firstDOW = 0; // 0 offset — June 1 = Monday (first column)

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>

      {/* ===== LEFT COLUMN ===== */}
      <div className="flex flex-col gap-2.5">

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-2">
          <KpiCard
            label="Контроль"
            value={`через ${MOCK_CONTROL_DAYS} дн`}
            hint={`${MOCK_CONTROL_STAGE} · ${MOCK_CONTROL_DATE}`}
          />
          <KpiCard
            label="Абонемент"
            value={`${MOCK_MEMBERSHIP_USED} из ${MOCK_MEMBERSHIP_TOTAL}`}
            hint={`осталось · ${MOCK_MEMBERSHIP_UNTIL}`}
          />
        </div>

        {/* Сигналы — shown only when present */}
        {MOCK_SIGNALS.length > 0 && (
          <div className={doctorSectionCardClass}>
            <div className="flex items-center gap-2 mb-1">
              <span className={doctorSectionTitleClass}>Сигналы</span>
              <span className="inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0 text-[10px] font-semibold text-destructive">
                {MOCK_SIGNALS.length}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {MOCK_SIGNALS.map((sig) => (
                <div
                  key={sig.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-sm"
                >
                  <span className="text-base flex-none">⚠</span>
                  <span className="flex-1 text-xs text-foreground">{sig.text}</span>
                  <span className="ml-auto text-xs text-muted-foreground cursor-pointer whitespace-nowrap hover:text-primary transition-colors">
                    к {sig.link} →
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground leading-tight">
              виден только при наличии сигналов · источник — «Сигналы пациентов» с «Сегодня»
            </p>
          </div>
        )}

        {/* Актуальные симптомы */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center justify-between mb-1">
            <span className={doctorSectionTitleClass}>Актуальные симптомы</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              открыть Карту →
            </button>
          </div>

          {MOCK_SYMPTOMS.filter((s) => s.isPrimary).map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 border border-[#ecd9d5] bg-[#fbf5f4] rounded-lg px-3 py-2"
            >
              <span className="text-base flex-none">⚑</span>
              <span className="text-sm font-semibold text-foreground flex-1 min-w-0">{s.location}</span>
              <ScoreBadge score={s.score} size="base" />
              <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                {s.since && `с ${s.since}`}
                {s.prevScore != null && ` · было ${s.prevScore}/10`}
              </span>
            </div>
          ))}

          {MOCK_SYMPTOMS.filter((s) => !s.isPrimary).map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 mt-1 px-3 text-xs text-muted-foreground"
            >
              <span className="w-3.5 flex-none" />
              <span className="flex-1 min-w-0">{s.location}</span>
              <ScoreBadge score={s.score} size="sm" />
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                {s.since && `с ${s.since}`}
              </span>
            </div>
          ))}

          <p className="text-xs text-muted-foreground leading-tight mt-1">
            основной симптом (⚑) — крупно, остальные актуальные — мелкими строками
          </p>
        </div>

        {/* Динамика симптомов */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center justify-between flex-wrap gap-1.5 mb-1">
            <span className={doctorSectionTitleClass}>Динамика симптомов</span>
            <span className="flex gap-2.5 items-center">
              {MOCK_SYMPTOM_SERIES.map((s) => (
                <span key={s.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-none"
                    style={{ background: s.color }}
                  />
                  {s.name}
                </span>
              ))}
            </span>
          </div>
          <SymptomChart series={MOCK_SYMPTOM_SERIES} />
          <p className="text-xs text-muted-foreground leading-tight mt-1">
            {/* TODO(backend): pull visit symptom scores from visits history */}
            линия на каждый актуальный симптом · точки — оценки из визитов
          </p>
        </div>

        {/* Выполнение упражнений */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
            <div>
              <span className={doctorSectionTitleClass}>
                Выполнение упражнений · {calView === "month" ? "июнь" : "неделя"}
              </span>
              <p className={cn(doctorSectionSubtitleClass, "mt-0.5")}>
                {/* TODO(backend): program name and start date */}
                Реабилитация ТБС + поясница · начата 12.02.2026 (4 мес)
              </p>
            </div>
            {/* Month/Week toggle */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => setCalView("month")}
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  calView === "month"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                Месяц
              </button>
              <button
                type="button"
                onClick={() => setCalView("week")}
                className={cn(
                  "px-2.5 py-1 border-l border-border transition-colors",
                  calView === "week"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                Неделя
              </button>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-0.5">
            {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((d) => (
              <div
                key={d}
                className="h-4 flex items-center justify-center text-[9px] text-muted-foreground/70 uppercase"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {calView === "month" ? (
            <div className="grid grid-cols-7 gap-0.5">
              {/* Offset for first day of month (June 2026 starts Monday = 0 offset) */}
              {Array.from({ length: firstDOW }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {calDays.map((d) => (
                <CalendarCell key={d.day} day={d} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-0.5">
              {calDays.map((d) => (
                <CalendarCell key={d.day} day={d} />
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-1.5 text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-primary" />полностью
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[hsl(215_45%_76%)]" />частично
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-background border border-border" />не выполнено
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-muted/40" />нет назначений
            </span>
          </div>

          {/* Summary */}
          <p className="text-xs text-foreground mt-2">
            {/* TODO(backend): compute from exercise completion log */}
            За 30 дней: <strong>18 из 26</strong> дней с назначением · средняя выполняемость{" "}
            <strong>64%</strong>
          </p>
        </div>

      </div>

      {/* ===== RIGHT COLUMN ===== */}
      <div className="flex flex-col gap-2.5">

        {/* Заметки */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center gap-2 mb-1">
            <span className={doctorSectionTitleClass}>Заметки</span>
            <button
              type="button"
              title="Добавить заметку"
              className="w-5 h-5 rounded-full border border-border text-xs text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center cursor-pointer"
            >
              +
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {MOCK_NOTES.filter((n) => n.pinned).map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2 rounded-md border border-[#f0e3c5] bg-[#fffdf5] px-2 py-1.5 text-sm"
              >
                <span className="flex-none">📌</span>
                <span className="flex-1 text-xs text-foreground">{n.text}</span>
                <button
                  type="button"
                  title="Редактировать"
                  className="text-xs text-muted-foreground hover:text-primary cursor-pointer flex-none"
                >
                  ✎
                </button>
              </div>
            ))}
            {MOCK_NOTES.filter((n) => !n.pinned).map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-sm"
              >
                <span className="w-3 flex-none" />
                <span className="flex-1 text-xs text-foreground">{n.text}</span>
                <button
                  type="button"
                  title="Редактировать"
                  className="text-xs text-muted-foreground hover:text-primary cursor-pointer flex-none"
                >
                  ✎
                </button>
                {n.date && (
                  <span className="text-[11px] text-muted-foreground flex-none">{n.date}</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {/* TODO(backend): notes from entity_comments or dedicated notes table */}
            📌 важные — закреплены и видны всегда, обычные — по дате
          </p>
        </div>

        {/* Задачи */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center gap-2 mb-1">
            <span className={doctorSectionTitleClass}>Задачи</span>
            <button
              type="button"
              title="Добавить задачу"
              className="w-5 h-5 rounded-full border border-border text-xs text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center cursor-pointer"
            >
              +
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {MOCK_TASKS.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-sm"
              >
                <span className="flex-none text-base">☐</span>
                <span className="flex-1 text-xs text-foreground">{task.text}</span>
                <span
                  className={cn(
                    "text-[11px] font-medium flex-none",
                    task.overdue ? "text-destructive font-semibold" : "text-muted-foreground",
                  )}
                >
                  {task.deadline}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {/* TODO(backend): tasks table / TODO list */}
            открытые задачи по пациенту, по дедлайну · видны и в общем списке на «Сегодня»
          </p>
        </div>

        {/* Программа и комментарии */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={doctorSectionTitleClass}>Программа и комментарии</span>
            {totalProgramUnread > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0 text-[10px] font-semibold text-destructive">
                💬 {totalProgramUnread * 2} новых
              </span>
            )}
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              открыть программу →
            </button>
          </div>

          {/* Stage pager */}
          <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5 bg-muted/10 mb-2">
            <button
              type="button"
              title="Предыдущий этап"
              onClick={() => setProgramStageOffset((o) => Math.max(o - 1, 0))}
              disabled={programStageOffset <= 0}
              className="w-6 h-6 rounded-md border border-border text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
            >
              ◀
            </button>
            <div className="flex-1 text-center">
              <div className="text-[12.5px] font-semibold text-foreground">
                Этап {MOCK_STAGE.current} из {MOCK_STAGE.total} · {MOCK_STAGE.name}
              </div>
              <div className="text-xs text-muted-foreground">
                активный · {MOCK_STAGE.activeDays} дней из {MOCK_STAGE.totalDays}
              </div>
            </div>
            <button
              type="button"
              title="Следующий этап"
              onClick={() => setProgramStageOffset((o) => o + 1)}
              disabled={programStageOffset >= MOCK_STAGE.total - 1}
              className="w-6 h-6 rounded-md border border-border text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
            >
              ▶
            </button>
          </div>

          {/* Exercise blocks */}
          {MOCK_PROGRAM_BLOCKS.map((block) => (
            <div key={block.id} className="mb-2">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 px-0.5">
                {block.label}
              </div>
              <div className="flex flex-col gap-1">
                {block.exercises.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-center gap-2 border border-border rounded-[7px] px-2 py-1 bg-card text-[11.5px] text-foreground"
                  >
                    {/* Icon */}
                    <span className="w-[22px] h-[22px] rounded-md bg-muted/50 flex items-center justify-center text-xs flex-none">
                      {ex.icon}
                    </span>
                    {/* Name */}
                    <span className="flex-1 min-w-0 truncate">{ex.name}</span>
                    {/* Last mark + params */}
                    {ex.lastMark && (
                      <span className="inline-flex items-center gap-1 flex-none">
                        <DumbbellMark mark={ex.lastMark} />
                        {ex.lastMarkLabel && (
                          <span className="text-[10.5px] text-muted-foreground font-semibold whitespace-nowrap">
                            {ex.lastMarkLabel}
                          </span>
                        )}
                      </span>
                    )}
                    {/* Comments */}
                    {ex.commentCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground flex-none">
                        💬 {ex.commentCount}
                        {ex.hasUnread && (
                          <span className="w-1.5 h-1.5 rounded-full bg-destructive flex-none" />
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {/* TODO(backend): treatment_program_instances + stages + exercise completion */}
            этапы листаются ◀ ▶. Гиря:{" "}
            <span className="text-[#1f9d55] font-semibold">зелёная</span> легко ·{" "}
            <span className="text-primary font-semibold">синяя</span> средне ·{" "}
            <span className="text-[#2b3442] font-semibold">тёмная</span> сложно. 💬 — комментарии, красная точка — непрочитанные.
          </p>
        </div>

        {/* Сообщения */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={doctorSectionTitleClass}>Сообщения</span>
            {totalMessageUnread > 0 && (
              <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0 text-[10px] font-semibold text-destructive">
                {totalMessageUnread} новых
              </span>
            )}
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              вся переписка →
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {MOCK_MESSAGES.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-1.5 items-start rounded-lg px-2.5 py-1.5 text-[12.5px]",
                  msg.isUnread
                    ? "border border-primary bg-primary/5"
                    : "border border-border bg-muted/10",
                  !msg.isPatient && "text-muted-foreground",
                )}
              >
                <span className="flex-1 min-w-0">
                  <strong>{msg.senderName}:</strong> {msg.text}
                </span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-auto pl-1.5">
                  {msg.date}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {/* TODO(backend): conversation thread / inbox for patient */}
            только контекст: последние сообщения, непрочитанные подсвечены. Ответ — через «вся переписка».
          </p>
        </div>

      </div>
    </div>
  );
}
