"use client";

/**
 * PatientTabRecords — Wave 3: appointment history, KPIs, upcoming, membership.
 * Data: MOCK (no per-patient appointment list endpoint yet) — TODO(backend): wire real data.
 * «Оформить визит»: dispatches custom event "patient:open-tab" with {tab:"karta"} — consumed by
 *   PatientCardClient to switch to the Карта tab. TODO(bridge to Карта visit form).
 * Note: booking-reputation & merge removed from this tab per owner decision 2026-06-14.
 */

import { useState } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorStatCardShellClass,
  doctorStatCardShellWarningClass,
  doctorStatCardInteractiveClass,
  doctorMetricValueClass,
  doctorMetricLabelClass,
  doctorSectionItemClass,
  doctorSectionItemUrgentClass,
  doctorPageStackClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppointmentStatus =
  | "completed"   // состоялась
  | "rescheduled" // перенос
  | "canceled"    // отмена (клиент)
  | "no_show"     // неявка (отмена, причина: клиент не пришёл)
  | "upcoming";   // предстоящая

interface MockAppointment {
  id: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  location: string;
  service: string;
  status: AppointmentStatus;
  rescheduledToDate?: string; // "DD.MM" for "перенос → ..."
  hasVisitRecord?: boolean;   // completed + visit form filled
  cancelReason?: string;
  durationMin?: number;
}

// ---------------------------------------------------------------------------
// Mock data
// TODO(backend): replace with GET /api/doctor/patients/[userId]/appointments
// ---------------------------------------------------------------------------

const MOCK_UPCOMING: MockAppointment = {
  id: "up-1",
  date: "2026-06-18",
  time: "10:00",
  location: "Студия на Лесной",
  service: "Тренировка ЛФК",
  status: "upcoming",
  durationMin: 60,
};

const MOCK_HISTORY: MockAppointment[] = [
  {
    id: "h-1",
    date: "2026-06-04",
    time: "10:00",
    location: "Студия на Лесной",
    service: "Тренировка ЛФК",
    status: "completed",
    hasVisitRecord: false,
  },
  {
    id: "h-2",
    date: "2026-05-28",
    time: "10:00",
    location: "Студия на Лесной",
    service: "Тренировка ЛФК",
    status: "rescheduled",
    rescheduledToDate: "04.06",
  },
  {
    id: "h-3",
    date: "2026-04-14",
    time: "18:30",
    location: "Онлайн",
    service: "Консультация",
    status: "canceled",
    cancelReason: "болезнь",
  },
  {
    id: "h-4",
    date: "2026-03-03",
    time: "10:00",
    location: "Студия на Лесной",
    service: "Тренировка ЛФК",
    status: "no_show",
    cancelReason: "клиент не пришёл",
  },
  {
    id: "h-5",
    date: "2026-01-22",
    time: "10:00",
    location: "Студия на Лесной",
    service: "Повторный приём",
    status: "completed",
    hasVisitRecord: true,
  },
  {
    id: "h-6",
    date: "2026-01-15",
    time: "18:30",
    location: "Онлайн",
    service: "Консультация",
    status: "completed",
    hasVisitRecord: true,
  },
  {
    id: "h-7",
    date: "2026-01-05",
    time: "10:00",
    location: "Студия на Лесной",
    service: "Первичный приём",
    status: "completed",
    hasVisitRecord: true,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(isoOrSlash: string): string {
  // Accepts YYYY-MM-DD → DD.MM.YYYY
  const parts = isoOrSlash.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return isoOrSlash;
}

function fmtDateShort(iso: string): string {
  const parts = iso.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
  return iso;
}

function fmtWeekday(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
}

/** Dispatch custom event to switch PatientCardClient to a different tab. */
function openTab(tabId: string) {
  // TODO(bridge to Карта visit form): PatientCardClient listens to this event and switches tab
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("patient:open-tab", { detail: { tab: tabId } }));
  }
  console.log("[PatientTabRecords] request open tab:", tabId);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusChip({ status, rescheduledToDate }: { status: AppointmentStatus; rescheduledToDate?: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-[#e7f4ec] text-[#1f7a45]">
        состоялась
      </span>
    );
  }
  if (status === "rescheduled") {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-[#fdf3dd] text-[#9a6b15]">
        перенос{rescheduledToDate ? ` → ${rescheduledToDate}` : ""}
      </span>
    );
  }
  if (status === "no_show") {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-destructive/10 text-destructive">
        отмена ⚠
      </span>
    );
  }
  // canceled
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-destructive/10 text-destructive">
      отмена
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabRecords({ userId: _userId, header }: Props) {
  const [cancelsPanelOpen, setCancelsPanelOpen] = useState(false);

  // Real KPI values from header if available, otherwise mock
  // TODO(backend): totalVisits, cancellationsCount, reschedulesCount come from header already
  const totalRecords = header?.totalVisits != null ? header.totalVisits + (header.cancellationsCount ?? 0) + (header.reschedulesCount ?? 0) : 12;
  const completedCount = header?.totalVisits ?? 9;
  const cancelsCount = header?.cancellationsCount ?? 2;
  const reschedulesCount = header?.reschedulesCount ?? 1;
  const firstVisitDate = header?.firstVisitDate;

  const hasNoShows = MOCK_HISTORY.some((a) => a.status === "no_show");
  const cancelsHistory = MOCK_HISTORY.filter((a) => a.status === "canceled" || a.status === "no_show");

  return (
    <div className={cn(doctorPageStackClass)}>

      {/* ================================================================
          KPI ROW — 4 stat cards
      ================================================================ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">

        {/* Всего записей */}
        <div className={doctorStatCardShellClass}>
          <p className={doctorMetricLabelClass}>Всего записей</p>
          <p className={cn(doctorMetricValueClass, "mt-0.5")}>{totalRecords}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {firstVisitDate
              ? `с ${(() => { const p = firstVisitDate.split("-"); return p.length === 3 ? `${p[1]}.${p[0]}` : firstVisitDate; })()}`
              : "с 09.2025"}
          </p>
        </div>

        {/* Состоялись */}
        <div className={doctorStatCardShellClass}>
          <p className={doctorMetricLabelClass}>Состоялись</p>
          <p className={cn(doctorMetricValueClass, "mt-0.5")}>{completedCount}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">визитов оформлено {Math.max(0, completedCount - 1)}</p>
        </div>

        {/* Отмены — clickable, highlights when there are no-shows */}
        <button
          type="button"
          onClick={() => setCancelsPanelOpen((v) => !v)}
          className={cn(
            "text-left",
            hasNoShows ? doctorStatCardShellWarningClass : doctorStatCardShellClass,
            doctorStatCardInteractiveClass,
          )}
        >
          <p className={doctorMetricLabelClass}>Отмены</p>
          <p className={cn(doctorMetricValueClass, "mt-0.5")}>
            {cancelsCount}
            {hasNoShows && (
              <span className="ml-1 text-destructive font-black">!</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {hasNoShows ? "есть неявка · детали ↓" : "за всё время"}
          </p>
        </button>

        {/* Переносы */}
        <div className={doctorStatCardShellClass}>
          <p className={doctorMetricLabelClass}>Переносы</p>
          <p className={cn(doctorMetricValueClass, "mt-0.5")}>{reschedulesCount}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">за всё время</p>
        </div>
      </div>

      {/* ================================================================
          CANCELS DETAIL PANEL — opens on click of Отмены card
      ================================================================ */}
      {cancelsPanelOpen && cancelsHistory.length > 0 && (
        <div className={cn(doctorSectionCardClass, "border-destructive/30")}>
          <p className={cn(doctorSectionTitleClass, "text-xs uppercase tracking-wide text-muted-foreground")}>
            Отмены · детали
          </p>
          <div className="flex flex-col gap-1.5">
            {cancelsHistory.map((a) => (
              <div
                key={a.id}
                className={cn(
                  doctorSectionItemClass,
                  a.status === "no_show" ? doctorSectionItemUrgentClass : "bg-muted/10",
                  "flex items-center gap-3 text-xs",
                )}
              >
                <span className="font-semibold text-foreground whitespace-nowrap">{fmtDate(a.date)}</span>
                <span className="text-muted-foreground flex-1 min-w-0">
                  {a.status === "canceled"
                    ? `отменена клиентом · причина: ${a.cancelReason ?? "—"}`
                    : `отменена · причина: клиент не пришёл`}
                </span>
                {a.status === "no_show" && (
                  <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive whitespace-nowrap flex-none">
                    ⚠ неявка
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className={cn(doctorSectionSubtitleClass, "text-[11px] leading-relaxed")}>
            Неявка — не отдельный статус, а причина отмены (как в Rubitime).
          </p>
        </div>
      )}

      {/* ================================================================
          TWO-COLUMN: История записей | Предстоящие + Абонемент
      ================================================================ */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.25fr_1fr] md:items-start">

        {/* LEFT: История записей */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center justify-between gap-2">
            <p className={doctorSectionTitleClass}>История записей</p>
            <span className={cn(doctorSectionSubtitleClass, "text-[11px]")}>новые сверху · прокручивается</span>
          </div>

          <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto pr-0.5">
            {/* TODO(backend): replace MOCK_HISTORY with real per-patient list */}
            {MOCK_HISTORY.map((appt) => (
              <div
                key={appt.id}
                className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-background px-2.5 py-2 text-xs"
              >
                {/* Date */}
                <span className="font-semibold text-foreground flex-none w-[72px]">
                  {fmtDate(appt.date)}
                </span>
                {/* Time */}
                <span className="text-muted-foreground flex-none w-[38px]">{appt.time}</span>
                {/* Location · Service */}
                <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-foreground/80">
                  {appt.location} · {appt.service}
                </span>
                {/* Status chip */}
                <StatusChip status={appt.status} rescheduledToDate={appt.rescheduledToDate} />
                {/* Action */}
                {appt.status === "completed" && !appt.hasVisitRecord && (
                  <button
                    type="button"
                    onClick={() => {
                      // TODO(bridge to Карта visit form): pass appt date/location/service
                      openTab("karta");
                    }}
                    className="inline-flex items-center rounded-md bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/25 transition-colors whitespace-nowrap flex-none cursor-pointer"
                  >
                    Оформить визит
                  </button>
                )}
                {appt.status === "completed" && appt.hasVisitRecord && (
                  <button
                    type="button"
                    onClick={() => openTab("karta")}
                    className="text-[11px] text-muted-foreground whitespace-nowrap flex-none hover:text-primary transition-colors cursor-pointer"
                  >
                    визит {fmtDateShort(appt.date)} →
                  </button>
                )}
              </div>
            ))}
          </div>

          <p className={cn(doctorSectionSubtitleClass, "text-[11px] leading-relaxed")}>
            У состоявшейся записи — либо ссылка «визит → » (Карта, визит раскрыт),
            либо кнопка «Оформить визит», если визит не оформлен.
            Создание новой записи — в Расписании.
          </p>
        </div>

        {/* RIGHT column: Предстоящие + Абонемент */}
        <div className="flex flex-col gap-3">

          {/* Предстоящие */}
          <div className={doctorSectionCardClass}>
            <div className="flex items-center gap-2">
              <p className={doctorSectionTitleClass}>Предстоящие</p>
              <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                1
              </span>
            </div>

            {/* TODO(backend): real upcoming appointments */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-foreground">
                  {fmtWeekday(MOCK_UPCOMING.date)} {fmtDate(MOCK_UPCOMING.date)} · {MOCK_UPCOMING.time}
                </span>
                <span className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium text-primary border border-primary/20">
                  подтверждена
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {MOCK_UPCOMING.location} · {MOCK_UPCOMING.service}
                {MOCK_UPCOMING.durationMin ? ` · ${MOCK_UPCOMING.durationMin} мин` : ""}
              </p>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {["Перенести", "Отменить", "Комментарий"].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => console.log("[PatientTabRecords] action:", label)}
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Абонемент */}
          {/* TODO(backend): real membership data */}
          <MembershipPanel />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Membership panel (stub with mock data)
// ---------------------------------------------------------------------------

function MembershipPanel() {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className={doctorSectionCardClass}>
      <div className="flex items-center gap-2">
        <p className={doctorSectionTitleClass}>Абонемент</p>
        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-[#e7f4ec] text-[#1f7a45]">
          активен
        </span>
      </div>

      {/* Active membership card */}
      {/* TODO(backend): real package data from be_patient_packages */}
      <div className="rounded-xl border border-border bg-muted/10 p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-extrabold text-foreground">4 из 10</span>
          <span className={cn(doctorSectionSubtitleClass, "text-xs")}>занятий осталось</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          «Абонемент 10 занятий» · до 31.07.2026 · применяется к: Тренировка ЛФК
        </p>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {["Продлить", "Оформить новый"].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => console.log("[PatientTabRecords] membership action:", label)}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Past memberships toggle */}
      <button
        type="button"
        onClick={() => setHistoryOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 transition-colors cursor-pointer text-left w-full"
      >
        <span className="flex-1">Прошлые абонементы</span>
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          2
        </span>
        <span className="text-muted-foreground/60">{historyOpen ? "▾" : "▸"}</span>
      </button>

      {historyOpen && (
        <div className="flex flex-col gap-1 mt-0.5">
          {/* TODO(backend): real historical packages */}
          {[
            { label: "«Абонемент 10 занятий»", period: "01.10.2025 – 31.12.2025", used: "10/10" },
            { label: "«Абонемент 5 занятий»", period: "01.07.2025 – 30.09.2025", used: "5/5" },
          ].map((pkg, i) => (
            <div key={i} className={cn(doctorSectionItemClass, "text-xs bg-muted/5")}>
              <span className="font-medium text-foreground">{pkg.label}</span>
              <span className="ml-2 text-muted-foreground">{pkg.period} · {pkg.used}</span>
            </div>
          ))}
        </div>
      )}

      <p className={cn(doctorSectionSubtitleClass, "text-[11px] leading-relaxed")}>
        Работа с абонементом — здесь. Карточка «Абонемент» на Обзоре ведёт сюда по клику.
      </p>
    </div>
  );
}
