"use client";

/**
 * PatientTabOverview — Wave 4: «Обзор» tab wired to real backend.
 * Two columns 50/50:
 *   LEFT  — KPIs · Сигналы · Актуальные симптомы · Динамика симптомов · Выполнение упражнений
 *   RIGHT — Заметки · Задачи · Программа и комментарии · Сообщения
 *
 * All widgets fetch independently; each degrades gracefully on error/empty.
 * Parallel fetches via Promise.all — no waterfall.
 * Pattern mirrors PatientTabRecords.tsx / PatientTabKarta.tsx.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import type { ActiveComplaint } from "@/modules/patient-clinical/ports";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import type { DoctorNoteRow } from "@/modules/doctor-notes/ports";
import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";
import type { SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorStatCardShellClass,
  doctorMetricValueClass,
  doctorMetricLabelClass,
} from "@/shared/ui/doctor/doctorVisual";

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface ClinicalApiResponse {
  ok: boolean;
  state: {
    complaints: ActiveComplaint[];
  };
  visits: Array<{
    id: string;
    date: string;
    type: "first" | "repeat";
    dynamics?: Array<{ id: string; label: string; from: number; to: number; note: string; priority: boolean }>;
  }>;
}

interface AppointmentItem {
  id: string;
  dateTime: string;
  status: "upcoming" | "completed" | "rescheduled" | "canceled";
  serviceName?: string | null;
  location?: string | null;
  durationMin?: number | null;
}

interface AppointmentsApiResponse {
  appointments: AppointmentItem[];
}

interface PackageItem {
  id: string;
  title?: string | null;
  quantityInitial?: number | null;
  remaining?: number | null;
  validUntil?: string | null;
  status?: string | null;
}

interface PackagesApiResponse {
  ok: boolean;
  packages: PackageItem[];
}

interface NotesApiResponse {
  ok: boolean;
  notes: DoctorNoteRow[];
}

interface TasksApiResponse {
  ok: boolean;
  tasks: SpecialistTaskRow[];
}

interface TreatmentInstanceItem {
  id: string;
  title: string;
  status: "active" | "completed" | "archived" | string;
  createdAt: string;
  updatedAt: string;
}

interface TreatmentInstanceStage {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
  groups: Array<{ id: string; title: string; systemKind?: string | null }>;
  items: Array<{
    id: string;
    itemType: string;
    sortOrder: number;
    snapshot?: { title?: string | null; loadType?: string | null; difficulty?: number | null } | null;
    effectiveComment?: string | null;
    settings?: Record<string, unknown> | null;
  }>;
}

interface TreatmentInstanceDetailResponse {
  ok: boolean;
  item: TreatmentInstanceItem & { stages: TreatmentInstanceStage[] };
}

interface ProgramInstancesApiResponse {
  ok: boolean;
  items: TreatmentInstanceItem[];
}

interface SignalsApiResponse {
  ok: boolean;
  signals: ProactiveInsightRow[];
}

interface CalendarDay {
  date: string; // YYYY-MM-DD
  completedCount: number;
}

interface ExerciseCalendarApiResponse {
  ok: boolean;
  days: CalendarDay[];
}

interface MessagesApiResponse {
  ok: boolean;
  conversationId?: string;
  messages: SerializedSupportMessage[];
  unreadFromUserCount: number;
}

// ---------------------------------------------------------------------------
// Aggregated fetch state
// ---------------------------------------------------------------------------

type WidgetStatus = "loading" | "ok" | "error" | "empty";

interface OverviewData {
  // Clinical
  clinicalStatus: WidgetStatus;
  complaints: ActiveComplaint[];
  symptomSeries: SymptomSeries[];

  // KPI — Control (appointments)
  appointmentsStatus: WidgetStatus;
  controlDays: number | null;
  controlDate: string | null;

  // KPI — Package
  packageStatus: WidgetStatus;
  activePackage: PackageItem | null;

  // Treatment program
  programStatus: WidgetStatus;
  programTitle: string | null;
  programStages: TreatmentInstanceStage[];
  programCurrentStage: TreatmentInstanceStage | null;
  programCurrentStageIndex: number; // 0-based index into programStages

  // Notes
  notesStatus: WidgetStatus;
  notes: DoctorNoteRow[];

  // Tasks
  tasksStatus: WidgetStatus;
  tasks: SpecialistTaskRow[];

  // Signals
  signalsStatus: WidgetStatus;
  signals: ProactiveInsightRow[];

  // Exercise calendar
  calendarStatus: WidgetStatus;
  calendarDays: CalendarDay[];

  // Messages
  messagesStatus: WidgetStatus;
  messages: SerializedSupportMessage[];
  unreadFromUserCount: number;
}

type SymptomSeries = {
  name: string;
  color: string;
  points: Array<{ visit: string; score: number }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFromNow(isoDate: string): number {
  const now = new Date();
  const target = new Date(isoDate);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function fmtDateShort(iso: string): string {
  // ISO → "DD.MM"
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDateMsgShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Build per-complaint dynamics series from clinical visits. */
function buildSymptomSeries(
  complaints: ActiveComplaint[],
  visits: ClinicalApiResponse["visits"],
): SymptomSeries[] {
  if (complaints.length === 0 || visits.length === 0) return [];

  // Colors: priority complaint → primary; others → secondary
  const COLORS = [
    "var(--primary, #3b82f6)",
    "#c2812e",
    "#9b59b6",
    "#2ecc71",
    "#e74c3c",
  ];

  // Sort visits oldest→newest (visits come newest→oldest from API)
  const sorted = [...visits].reverse();

  return complaints.map((c, idx) => {
    const points: Array<{ visit: string; score: number }> = [];

    for (const v of sorted) {
      if (!v.dynamics) continue;
      const match = v.dynamics.find((d) => d.label === c.text);
      if (match) {
        points.push({ visit: v.date, score: match.to });
      }
    }

    // If we got no dynamics points but have trend data from state — use trend
    if (points.length === 0 && c.trend.length > 0) {
      c.trend.forEach((score, i) => {
        points.push({ visit: `Визит ${i + 1}`, score });
      });
    }

    const color = c.priority ? COLORS[0] : (COLORS[idx + 1] ?? COLORS[1]);
    const label = `${c.priority ? "⚑ " : ""}${c.text.length > 20 ? c.text.slice(0, 20) + "…" : c.text} · ${c.currentSeverity}/10`;
    return { name: label, color, points };
  });
}

/** Get current month ISO range. */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(last.getDate())}`,
  };
}

/** Month label in Russian for the current month. */
function currentMonthLabel(): string {
  return new Date().toLocaleDateString("ru-RU", { month: "long" });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value, hint, loading }: { label: string; value: string; hint: string; loading?: boolean }) {
  return (
    <div className={cn(doctorStatCardShellClass, "flex flex-col gap-0.5")}>
      <span className={doctorMetricLabelClass}>{label}</span>
      {loading ? (
        <span className="text-xs text-muted-foreground animate-pulse py-1">…</span>
      ) : (
        <>
          <span className={cn(doctorMetricValueClass, "text-base")}>{value}</span>
          <span className="text-xs text-muted-foreground leading-tight">{hint}</span>
        </>
      )}
    </div>
  );
}

function ScoreBadge({ score, size = "base" }: { score: number; size?: "base" | "sm" }) {
  const cls = size === "base"
    ? "text-xs font-bold text-primary bg-primary/10 rounded-[9px] px-2 py-0.5 tabular-nums"
    : "text-[10.5px] font-bold text-primary bg-primary/10 rounded-lg px-1.5 py-0 tabular-nums";
  return <span className={cls}>{score}/10</span>;
}

function SymptomChart({ series }: { series: SymptomSeries[] }) {
  const validSeries = series.filter((s) => s.points.length >= 2);
  if (validSeries.length === 0) return null;

  const W = 480;
  const H = 168;
  const padLeft = 34;
  const padRight = 14;
  const padTop = 10;
  const chartH = 130;
  const chartW = W - padLeft - padRight;

  const yLabels = [10, 8, 6, 4, 2, 0];
  const yOf = (score: number) => padTop + ((10 - score) / 10) * chartH;
  const xLabels = validSeries[0].points.map((p) => p.visit);
  const nPoints = validSeries[0].points.length;
  const xOf = (i: number) => padLeft + (i / Math.max(nPoints - 1, 1)) * chartW;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <g stroke="#edf0f5" strokeWidth="1">
        {yLabels.map((v) => (
          <line key={v} x1={padLeft} y1={yOf(v)} x2={W - padRight} y2={yOf(v)} />
        ))}
      </g>
      <g fontSize="9" fill="#8b95a3">
        {yLabels.map((v) => (
          <text key={v} x={padLeft - 6} y={yOf(v) + 3} textAnchor="end">{v}</text>
        ))}
      </g>
      {validSeries.map((s) => {
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
      <g fontSize="9.5" fill="#5a6675">
        {xLabels.map((label, i) => (
          <text key={i} x={xOf(i)} y={H - 12} textAnchor="middle">{label.length > 12 ? label.slice(0, 12) : label}</text>
        ))}
      </g>
    </svg>
  );
}

type CalendarDayStatus = "full" | "partial" | "missed" | "no-assign" | "future" | "today";

interface CalendarCellData {
  day: number;
  status: CalendarDayStatus;
  ratio?: number;
}

function CalendarCell({ day }: { day: CalendarCellData }) {
  let bg = "";
  let textColor = "";
  let ring = "";

  switch (day.status) {
    case "full":
      bg = "bg-primary";
      textColor = "text-white font-semibold";
      break;
    case "partial":
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

export function PatientTabOverview({ userId }: Props) {
  const [calView, setCalView] = useState<"month" | "week">("month");
  const [programStageOffset, setProgramStageOffset] = useState(0);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const { from, to } = currentMonthRange();

    // --- All fetches in parallel ---
    const fetchClinical = fetch(`/api/doctor/patients/${userId}/clinical`, { credentials: "include" })
      .then((r) => r.ok ? (r.json() as Promise<ClinicalApiResponse>) : null)
      .catch(() => null);

    const fetchAppointments = fetch(`/api/doctor/patients/${userId}/appointments`, { credentials: "include" })
      .then((r) => r.ok ? (r.json() as Promise<AppointmentsApiResponse>) : null)
      .catch(() => null);

    const fetchPackages = fetch(
      `/api/doctor/booking-engine/patient-packages?platformUserId=${userId}`,
      { credentials: "include" },
    )
      .then((r) => r.ok ? (r.json() as Promise<PackagesApiResponse>) : null)
      .catch(() => null);

    const fetchNotes = fetch(`/api/doctor/clients/${userId}/notes`, { credentials: "include" })
      .then((r) => r.ok ? (r.json() as Promise<NotesApiResponse>) : null)
      .catch(() => null);

    const fetchTasks = fetch(`/api/doctor/clients/${userId}/tasks`, { credentials: "include" })
      .then((r) => r.ok ? (r.json() as Promise<TasksApiResponse>) : null)
      .catch(() => null);

    const fetchProgram = fetch(`/api/doctor/clients/${userId}/treatment-program-instances`, { credentials: "include" })
      .then((r) => r.ok ? (r.json() as Promise<ProgramInstancesApiResponse>) : null)
      .catch(() => null);

    const fetchSignals = fetch(`/api/doctor/patients/${userId}/proactive-insights`, { credentials: "include" })
      .then((r) => r.ok ? (r.json() as Promise<SignalsApiResponse>) : null)
      .catch(() => null);

    const fetchCalendar = fetch(
      `/api/doctor/patients/${userId}/exercise-calendar?from=${from}&to=${to}`,
      { credentials: "include" },
    )
      .then((r) => r.ok ? (r.json() as Promise<ExerciseCalendarApiResponse>) : null)
      .catch(() => null);

    const fetchMessages = fetch(
      `/api/doctor/messages/conversations/ensure`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientUserId: userId }),
      },
    )
      .then((r) => r.ok ? (r.json() as Promise<MessagesApiResponse>) : null)
      .catch(() => null);

    Promise.all([
      fetchClinical,
      fetchAppointments,
      fetchPackages,
      fetchNotes,
      fetchTasks,
      fetchProgram,
      fetchSignals,
      fetchCalendar,
      fetchMessages,
    ]).then(async ([
      clinical,
      appointments,
      packages,
      notes,
      tasks,
      programList,
      signals,
      calendar,
      messages,
    ]) => {
      if (!active) return;

      // --- Clinical ---
      const complaints = clinical?.state?.complaints ?? [];
      const clinicalStatus: WidgetStatus = !clinical ? "error" : complaints.length === 0 ? "empty" : "ok";
      const symptomSeries = clinical
        ? buildSymptomSeries(complaints, clinical.visits ?? [])
        : [];

      // --- Appointments → Control KPI ---
      const upcomingAppts = (appointments?.appointments ?? []).filter(
        (a) => a.status === "upcoming",
      );
      upcomingAppts.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
      const nearestUpcoming = upcomingAppts[0] ?? null;
      const controlDays = nearestUpcoming ? daysFromNow(nearestUpcoming.dateTime) : null;
      const controlDate = nearestUpcoming ? fmtDateShort(nearestUpcoming.dateTime) : null;
      const appointmentsStatus: WidgetStatus = !appointments ? "error" : nearestUpcoming === null ? "empty" : "ok";

      // --- Packages ---
      const activePackages = (packages?.packages ?? []).filter(
        (p) => p.status === "active" || p.status === "activated",
      );
      const activePackage = activePackages[0] ?? null;
      const packageStatus: WidgetStatus = !packages ? "error" : activePackage === null ? "empty" : "ok";

      // --- Notes ---
      const notesList = notes?.notes ?? [];
      const notesStatus: WidgetStatus = !notes ? "error" : "ok";

      // --- Tasks ---
      const tasksList = (tasks?.tasks ?? []).filter((t) => !t.completedAt);
      tasksList.sort((a, b) => {
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });
      const tasksStatus: WidgetStatus = !tasks ? "error" : "ok";

      // --- Program — fetch active instance detail if available ---
      let programStatus: WidgetStatus = "ok";
      let programTitle: string | null = null;
      let programStages: TreatmentInstanceStage[] = [];
      let programCurrentStage: TreatmentInstanceStage | null = null;
      let programCurrentStageIndex = 0;

      if (!programList) {
        programStatus = "error";
      } else {
        const activeInstance = (programList.items ?? []).find((i) => i.status === "active");
        if (!activeInstance) {
          programStatus = "empty";
        } else {
          programTitle = activeInstance.title;
          // Fetch detail for stages+items
          try {
            const detailRes = await fetch(
              `/api/doctor/treatment-program-instances/${activeInstance.id}`,
              { credentials: "include" },
            );
            if (detailRes.ok) {
              const detail = (await detailRes.json()) as TreatmentInstanceDetailResponse;
              if (detail.ok && detail.item) {
                programStages = detail.item.stages ?? [];
                // Current stage = last in_progress, fallback to last available
                const inProgress = programStages.find((s) => s.status === "in_progress");
                const available = programStages.find((s) => s.status === "available");
                programCurrentStage = inProgress ?? available ?? programStages[0] ?? null;
                if (programCurrentStage) {
                  programCurrentStageIndex = programStages.findIndex((s) => s.id === programCurrentStage!.id);
                  if (programCurrentStageIndex < 0) programCurrentStageIndex = 0;
                }
                programStatus = programStages.length === 0 ? "empty" : "ok";
              }
            }
          } catch {
            // Non-blocking: program section degraded, show title only
            programStatus = programTitle ? "ok" : "error";
          }
        }
      }

      // --- Signals ---
      const signalsList = signals?.signals ?? [];
      const signalsStatus: WidgetStatus = !signals ? "error" : signalsList.length === 0 ? "empty" : "ok";

      // --- Calendar ---
      const calendarDays = calendar?.days ?? [];
      const calendarStatus: WidgetStatus = !calendar ? "error" : "ok";

      // --- Messages ---
      const messagesList = messages?.messages ?? [];
      const unreadFromUserCount = messages?.unreadFromUserCount ?? 0;
      const messagesStatus: WidgetStatus = !messages ? "error" : "ok";

      setData({
        clinicalStatus,
        complaints,
        symptomSeries,
        appointmentsStatus,
        controlDays,
        controlDate,
        packageStatus,
        activePackage,
        programStatus,
        programTitle,
        programStages,
        programCurrentStage,
        programCurrentStageIndex,
        notesStatus,
        notes: notesList,
        tasksStatus,
        tasks: tasksList,
        signalsStatus,
        signals: signalsList,
        calendarStatus,
        calendarDays,
        messagesStatus,
        messages: messagesList,
        unreadFromUserCount,
      });
      setLoadedUserId(userId);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  const isStale = loadedUserId !== userId;
  const isLoading = isStale || data === null;

  // Compute calendar grid from real data
  const calendarGrid = buildCalendarGrid(data?.calendarDays ?? []);

  // Program stage to display (offset from current stage)
  const displayStageIndex = data
    ? Math.max(0, Math.min(data.programCurrentStageIndex + programStageOffset, data.programStages.length - 1))
    : 0;
  const displayStage = data?.programStages[displayStageIndex] ?? null;
  const maxStageOffset = data ? data.programStages.length - 1 - data.programCurrentStageIndex : 0;
  const minStageOffset = data ? -data.programCurrentStageIndex : 0;

  // Message unread count
  const totalMessageUnread = data?.unreadFromUserCount ?? 0;

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>

      {/* ===== LEFT COLUMN ===== */}
      <div className="flex flex-col gap-2.5">

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-2">
          {/* Контроль KPI */}
          <KpiCard
            label="Контроль"
            loading={isLoading}
            value={
              data?.appointmentsStatus === "empty" || data?.controlDays === null
                ? "—"
                : data?.controlDays !== undefined && data.controlDays <= 0
                  ? "сегодня"
                  : `через ${data?.controlDays} дн`
            }
            hint={
              data?.controlDate
                ? `следующий визит · ${data.controlDate}`
                : "нет предстоящих записей"
            }
          />
          {/* Абонемент KPI */}
          <KpiCard
            label="Абонемент"
            loading={isLoading}
            value={
              data?.packageStatus === "empty" || !data?.activePackage
                ? "—"
                : data.activePackage.remaining !== null && data.activePackage.remaining !== undefined &&
                  data.activePackage.quantityInitial
                  ? `${data.activePackage.remaining} из ${data.activePackage.quantityInitial}`
                  : "активен"
            }
            hint={
              data?.activePackage?.validUntil
                ? `осталось · до ${fmtDateShort(data.activePackage.validUntil)}`
                : data?.packageStatus === "empty"
                  ? "абонемент не активен"
                  : "осталось занятий"
            }
          />
        </div>

        {/* Сигналы — shown only when present */}
        {!isLoading && data?.signalsStatus === "ok" && (data.signals?.length ?? 0) > 0 && (
          <div className={doctorSectionCardClass}>
            <div className="flex items-center gap-2 mb-1">
              <span className={doctorSectionTitleClass}>Сигналы</span>
              <span className="inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0 text-[10px] font-semibold text-destructive">
                {data.signals.length}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {data.signals.map((sig, idx) => (
                <div
                  key={sig.patientUserId + sig.kind + idx}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-sm"
                >
                  <span className="text-base flex-none">⚠</span>
                  <span className="flex-1 text-xs text-foreground">{sig.summary}</span>
                </div>
              ))}
            </div>
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

          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка симптомов…</p>
          )}
          {!isLoading && data?.clinicalStatus === "error" && (
            <p className="text-xs text-destructive py-1">Не удалось загрузить симптомы.</p>
          )}
          {!isLoading && data?.clinicalStatus === "empty" && (
            <p className="text-xs text-muted-foreground py-2">Симптомы не зафиксированы.</p>
          )}

          {!isLoading && data?.clinicalStatus === "ok" && (
            <>
              {data.complaints.filter((c) => c.priority).map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 border border-[#ecd9d5] bg-[#fbf5f4] rounded-lg px-3 py-2"
                >
                  <span className="text-base flex-none">⚑</span>
                  <span className="text-sm font-semibold text-foreground flex-1 min-w-0">{c.text}</span>
                  <ScoreBadge score={c.currentSeverity} size="base" />
                  <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                    {c.since}
                    {c.trend.length >= 2 && ` · было ${c.trend[0]}/10`}
                  </span>
                </div>
              ))}

              {data.complaints.filter((c) => !c.priority).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 mt-1 px-3 text-xs text-muted-foreground"
                >
                  <span className="w-3.5 flex-none" />
                  <span className="flex-1 min-w-0">{c.text}</span>
                  <ScoreBadge score={c.currentSeverity} size="sm" />
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                    {c.since}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Динамика симптомов */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center justify-between flex-wrap gap-1.5 mb-1">
            <span className={doctorSectionTitleClass}>Динамика симптомов</span>
            {!isLoading && data?.symptomSeries && data.symptomSeries.length > 0 && (
              <span className="flex gap-2.5 items-center">
                {data.symptomSeries.map((s) => (
                  <span key={s.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: s.color }} />
                    {s.name}
                  </span>
                ))}
              </span>
            )}
          </div>
          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка данных…</p>
          )}
          {!isLoading && (data?.clinicalStatus === "empty" || (data?.symptomSeries?.every((s) => s.points.length < 2))) && (
            <p className="text-xs text-muted-foreground py-2">Недостаточно данных для графика.</p>
          )}
          {!isLoading && data?.symptomSeries && data.symptomSeries.some((s) => s.points.length >= 2) && (
            <SymptomChart series={data.symptomSeries} />
          )}
        </div>

        {/* Выполнение упражнений */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
            <div>
              <span className={doctorSectionTitleClass}>
                Выполнение упражнений · {calView === "month" ? currentMonthLabel() : "неделя"}
              </span>
              {data?.programTitle && (
                <p className={cn(doctorSectionSubtitleClass, "mt-0.5")}>
                  {data.programTitle}
                </p>
              )}
            </div>
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

          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка календаря…</p>
          )}
          {!isLoading && data?.calendarStatus === "error" && (
            <p className="text-xs text-muted-foreground py-2">Данные о выполнении недоступны.</p>
          )}
          {!isLoading && data?.calendarStatus === "ok" && (
            <>
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

              {calView === "month" ? (
                <div className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: calendarGrid.firstDOW }).map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}
                  {calendarGrid.days.map((d) => (
                    <CalendarCell key={d.day} day={d} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-0.5">
                  {calendarGrid.weekDays.map((d) => (
                    <CalendarCell key={d.day} day={d} />
                  ))}
                </div>
              )}

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

              {(data.calendarDays.length > 0 || !isLoading) && (
                <p className="text-xs text-foreground mt-2">
                  За месяц: <strong>{data.calendarDays.length}</strong> дн с выполнением
                  {data.calendarDays.length === 0 && " · нет данных"}
                </p>
              )}
            </>
          )}

          {/* If calendar 500'd (parallel agent building it) */}
          {!isLoading && !data?.calendarStatus && (
            <p className="text-xs text-muted-foreground py-2">Данные о выполнении недоступны.</p>
          )}
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

          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка заметок…</p>
          )}
          {!isLoading && data?.notesStatus === "error" && (
            <p className="text-xs text-destructive py-1">Не удалось загрузить заметки.</p>
          )}
          {!isLoading && data?.notesStatus === "ok" && data.notes.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Заметок нет.</p>
          )}
          {!isLoading && data?.notesStatus === "ok" && data.notes.length > 0 && (
            <div className="flex flex-col gap-1">
              {/* Notes don't have a pinned field — sort by updatedAt newest first */}
              {[...data.notes]
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-sm"
                  >
                    <span className="flex-1 text-xs text-foreground">{n.text}</span>
                    <span className="text-[11px] text-muted-foreground flex-none">
                      {fmtDateMsgShort(n.updatedAt)}
                    </span>
                  </div>
                ))}
            </div>
          )}
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

          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка задач…</p>
          )}
          {!isLoading && data?.tasksStatus === "error" && (
            <p className="text-xs text-destructive py-1">Не удалось загрузить задачи.</p>
          )}
          {!isLoading && data?.tasksStatus === "ok" && data.tasks.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Задач нет.</p>
          )}
          {!isLoading && data?.tasksStatus === "ok" && data.tasks.length > 0 && (
            <div className="flex flex-col gap-1">
              {data.tasks.map((task) => {
                const isOverdue = task.dueAt ? new Date(task.dueAt) < new Date() : false;
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-sm"
                  >
                    <span className="flex-none text-base">☐</span>
                    {task.isImportant && <span className="flex-none text-destructive text-xs">!</span>}
                    <span className="flex-1 text-xs text-foreground">{task.title}</span>
                    {task.dueAt && (
                      <span
                        className={cn(
                          "text-[11px] font-medium flex-none",
                          isOverdue ? "text-destructive font-semibold" : "text-muted-foreground",
                        )}
                      >
                        до {fmtDateShort(task.dueAt)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Программа и комментарии */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={doctorSectionTitleClass}>Программа и комментарии</span>
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              открыть программу →
            </button>
          </div>

          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка программы…</p>
          )}
          {!isLoading && data?.programStatus === "error" && (
            <p className="text-xs text-destructive py-1">Не удалось загрузить программу.</p>
          )}
          {!isLoading && data?.programStatus === "empty" && (
            <p className="text-xs text-muted-foreground py-2">Программа не назначена.</p>
          )}

          {!isLoading && data?.programStatus === "ok" && (
            <>
              {data.programTitle && (
                <p className="text-[12px] font-semibold text-foreground mb-1.5">{data.programTitle}</p>
              )}

              {/* Stage pager */}
              {data.programStages.length > 0 && displayStage && (
                <>
                  <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5 bg-muted/10 mb-2">
                    <button
                      type="button"
                      title="Предыдущий этап"
                      onClick={() => setProgramStageOffset((o) => Math.max(o - 1, minStageOffset))}
                      disabled={programStageOffset <= minStageOffset}
                      className="w-6 h-6 rounded-md border border-border text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
                    >
                      ◀
                    </button>
                    <div className="flex-1 text-center">
                      <div className="text-[12.5px] font-semibold text-foreground">
                        Этап {displayStageIndex + 1} из {data.programStages.length} · {displayStage.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {displayStage.status === "in_progress"
                          ? "активный"
                          : displayStage.status === "completed"
                            ? "завершён"
                            : displayStage.status === "available"
                              ? "доступен"
                              : displayStage.status}
                      </div>
                    </div>
                    <button
                      type="button"
                      title="Следующий этап"
                      onClick={() => setProgramStageOffset((o) => Math.min(o + 1, maxStageOffset))}
                      disabled={programStageOffset >= maxStageOffset}
                      className="w-6 h-6 rounded-md border border-border text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
                    >
                      ▶
                    </button>
                  </div>

                  {/* Exercise items in stage */}
                  {displayStage.items.filter((it) => it.itemType === "exercise").map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 border border-border rounded-[7px] px-2 py-1 bg-card text-[11.5px] text-foreground mb-1"
                    >
                      <span className="w-[22px] h-[22px] rounded-md bg-muted/50 flex items-center justify-center text-xs flex-none">
                        💪
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        {item.snapshot?.title ?? "Упражнение"}
                      </span>
                      {item.effectiveComment && (
                        <span className="text-[10.5px] text-muted-foreground flex-none truncate max-w-[100px]">
                          {item.effectiveComment}
                        </span>
                      )}
                      {/* TODO(backend): per-exercise last-mark / unread comments not exposed via these endpoints */}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
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

          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка сообщений…</p>
          )}
          {!isLoading && data?.messagesStatus === "error" && (
            <p className="text-xs text-destructive py-1">Не удалось загрузить сообщения.</p>
          )}
          {!isLoading && data?.messagesStatus === "ok" && data.messages.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Сообщений нет.</p>
          )}
          {!isLoading && data?.messagesStatus === "ok" && data.messages.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {[...data.messages]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 5)
                .map((msg) => {
                  const isUnread = !msg.readAt && msg.senderRole !== "admin";
                  const isPatient = msg.senderRole !== "admin";
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-1.5 items-start rounded-lg px-2.5 py-1.5 text-[12.5px]",
                        isUnread
                          ? "border border-primary bg-primary/5"
                          : "border border-border bg-muted/10",
                        !isPatient && "text-muted-foreground",
                      )}
                    >
                      <span className="flex-1 min-w-0">
                        <strong>{isPatient ? "Пациент" : "Вы"}:</strong> {msg.text}
                      </span>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-auto pl-1.5">
                        {fmtDateMsgShort(msg.createdAt)}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar grid builder — converts API days to renderable cells
// ---------------------------------------------------------------------------

interface CalendarGrid {
  firstDOW: number; // blank cells before day 1 (0 = Mon)
  days: CalendarCellData[];
  weekDays: CalendarCellData[];
}

function buildCalendarGrid(apiDays: CalendarDay[]): CalendarGrid {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDay = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // First day of week offset (Mon = 0): getDay() returns 0=Sun, 1=Mon, …6=Sat
  const firstOfMonth = new Date(year, month, 1);
  const jsDay = firstOfMonth.getDay(); // 0=Sun
  const firstDOW = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon-based

  // Build lookup by day number (1-31)
  const completedByDay = new Map<number, number>();
  for (const apiDay of apiDays) {
    const d = parseInt(apiDay.date.slice(8, 10), 10);
    completedByDay.set(d, (completedByDay.get(d) ?? 0) + apiDay.completedCount);
  }

  const days: CalendarCellData[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const completedCount = completedByDay.get(d);
    let status: CalendarCellData["status"];

    if (d > todayDay) {
      status = "future";
    } else if (d === todayDay) {
      status = "today";
    } else if (completedCount === undefined) {
      // Past day with no data — we don't know if it had assignments
      status = "no-assign";
    } else if (completedCount >= 3) {
      status = "full";
    } else if (completedCount >= 1) {
      status = "partial";
      // ratio hint: 1 → 0.3, 2 → 0.6
    } else {
      status = "missed";
    }

    days.push({ day: d, status, ratio: completedCount ? Math.min(completedCount / 3, 1) : undefined });
  }

  // Week view: 7 days around today (today and 3 days each side, clamped)
  const weekStart = Math.max(1, todayDay - 3);
  const weekEnd = Math.min(daysInMonth, weekStart + 6);
  const weekDays = days.slice(weekStart - 1, weekEnd);

  return { firstDOW, days, weekDays };
}
