"use client";

/**
 * PatientTabRecords — Wave 3: appointment history, KPIs, upcoming, membership.
 * Data: real from GET /api/doctor/patients/[userId]/appointments (client-side fetch).
 * Falls back to mock display if fetch fails / empty so UI never breaks.
 * «Оформить визит»: dispatches custom event "patient:open-tab" with {tab:"karta"} — consumed by
 *   PatientCardClient (lines 140-141) to switch to the Карта tab.
 * Note: booking-reputation & merge removed from this tab per owner decision 2026-06-14.
 */

import { useEffect, useState } from "react";
import type { PatientAppointmentItem, PatientCardHeader } from "@/modules/doctor-clients/ports";
import { MembershipCardHeader } from "@/shared/ui/doctor/MembershipCardHeader";
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
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppointmentStatus =
  | "completed"   // состоялась
  | "rescheduled" // перенос
  | "canceled"    // отмена
  | "no_show"     // неявка (маппинг от canceled — не используется в реальных данных)
  | "upcoming";   // предстоящая

/** Нормализованный элемент для рендера — общий формат для real + mock данных. */
interface DisplayAppointment {
  id: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  location: string;
  service: string;
  status: AppointmentStatus;
  rescheduledToDate?: string;
  hasVisitRecord?: boolean;
  cancelReason?: string;
  durationMin?: number;
  /** Запись списана с абонемента (be_appointments.package_usage_ref IS NOT NULL). */
  isPackage?: boolean | null;
}

/** Маппинг PatientAppointmentItem → DisplayAppointment. */
function mapRealToDisplay(item: PatientAppointmentItem): DisplayAppointment {
  const dt = item.dateTime ? new Date(item.dateTime) : null;
  const date = dt
    ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
    : "";
  const time = dt
    ? `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`
    : "";
  return {
    id: item.id,
    date,
    time,
    location: item.location ?? "",
    service: item.serviceName ?? "Запись",
    status: item.status === "rescheduled" ? "rescheduled" : item.status,
    durationMin: item.durationMin ?? undefined,
    hasVisitRecord: false, // PatientAppointmentItem doesn't include visit-record presence yet
    isPackage: item.isPackage ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fallback mock data — показывается только если fetch провалился или userId не найден
// ---------------------------------------------------------------------------

const MOCK_HISTORY_FALLBACK: DisplayAppointment[] = [
  { id: "m-1", date: "2026-06-04", time: "10:00", location: "Студия на Лесной", service: "Тренировка ЛФК", status: "completed", hasVisitRecord: false },
  { id: "m-2", date: "2026-05-28", time: "10:00", location: "Студия на Лесной", service: "Тренировка ЛФК", status: "rescheduled", rescheduledToDate: "04.06" },
  { id: "m-3", date: "2026-04-14", time: "18:30", location: "Онлайн", service: "Консультация", status: "canceled", cancelReason: "болезнь" },
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
  return d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", weekday: "short" }).replace(".", "");
}

/** Dispatch custom event to switch PatientCardClient to a different tab. */
function openTab(tabId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("patient:open-tab", { detail: { tab: tabId } }));
  }
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

/** Appointment prefill data passed to the visit creation callback. */
export type AppointmentPrefill = {
  id: string;
  location?: string;
  service?: string;
  durationMin?: number;
};

type Props = {
  userId: string;
  header?: PatientCardHeader;
  onCreateVisitFromAppointment?: (prefill: AppointmentPrefill) => void;
  initialAppointments?: PatientAppointmentItem[] | null;
  /** SSR-provided patient packages. When present, skips the MembershipPanel client fetch. */
  initialPackages?: ApiPackage[] | null;
  /** SSR-provided payments summary. When present, skips the PaymentsPanel initial fetch. */
  initialPaymentsSummary?: { payments: PaymentItem[]; totalPaidMinor: number } | null;
};

export function PatientTabRecords({ userId, header, onCreateVisitFromAppointment, initialAppointments, initialPackages, initialPaymentsSummary }: Props) {
  const [cancelsPanelOpen, setCancelsPanelOpen] = useState(false);

  // Real appointments fetch. Track the userId the loaded state belongs to so we
  // can derive «loading» when the prop changes — instead of resetting state
  // synchronously inside the effect (which triggers cascading renders).
  const [allAppointments, setAllAppointments] = useState<DisplayAppointment[] | null>(
    () => initialAppointments != null ? initialAppointments.map(mapRealToDisplay) : null,
  );
  const [fetchError, setFetchError] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(
    () => initialAppointments != null ? userId : null,
  );

  useEffect(() => {
    if (initialAppointments != null && loadedUserId === userId) {
      return;
    }
    let active = true;
    fetch(`/api/doctor/patients/${userId}/appointments`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<{ appointments: PatientAppointmentItem[] }>;
      })
      .then((data) => {
        if (!active) return;
        setAllAppointments(data.appointments.map(mapRealToDisplay));
        setFetchError(false);
        setLoadedUserId(userId);
      })
      .catch(() => {
        if (!active) return;
        setFetchError(true);
        setLoadedUserId(userId);
      });
    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Stale = loaded state belongs to a previous userId → treat as loading.
  const isStale = loadedUserId !== userId;
  // Loading → empty (spinner shown); error → mock fallback; loaded → real data
  const isLoading = isStale || (allAppointments === null && !fetchError);
  const displayList: DisplayAppointment[] = isStale
    ? []
    : fetchError
      ? MOCK_HISTORY_FALLBACK
      : (allAppointments ?? []);

  const upcomingList = displayList.filter((a) => a.status === "upcoming");
  const historyList = displayList.filter((a) => a.status !== "upcoming");

  // KPI: real values from header where available
  const completedCount = header?.totalVisits ?? historyList.filter((a) => a.status === "completed").length;
  const cancelsCount = header?.cancellationsCount ?? historyList.filter((a) => a.status === "canceled" || a.status === "no_show").length;
  const reschedulesCount = header?.reschedulesCount ?? historyList.filter((a) => a.status === "rescheduled").length;
  const totalRecords = completedCount + cancelsCount + reschedulesCount;
  const firstVisitDate = header?.firstVisitDate;

  const hasNoShows = historyList.some((a) => a.status === "no_show");
  const cancelsHistory = historyList.filter((a) => a.status === "canceled" || a.status === "no_show");

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
          <p className="mt-0.5 text-[11px] text-muted-foreground">посещений за всё время</p>
        </div>

        {/* Отмены — clickable, highlights when there are no-shows */}
        <Button
          type="button"
          variant="ghost"
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
        </Button>

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

        {/* LEFT: Визиты */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center justify-between gap-2">
            <p className={doctorSectionTitleClass}>Визиты</p>
            <span className={cn(doctorSectionSubtitleClass, "text-[11px]")}>новые сверху · прокручивается</span>
          </div>

          <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto pr-0.5">
            {isLoading && (
              <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка записей…</p>
            )}
            {fetchError && (
              <p className="text-xs text-destructive py-1">Не удалось загрузить записи. Показаны примеры.</p>
            )}
            {!isLoading && !fetchError && historyList.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">Записей пока нет.</p>
            )}
            {historyList.map((appt) => (
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
                {/* Package badge */}
                {appt.isPackage ? (
                  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap bg-[#e8f0fd] text-[#2563eb] flex-none">
                    абонемент
                  </span>
                ) : null}
                {/* Status chip */}
                <StatusChip status={appt.status} rescheduledToDate={appt.rescheduledToDate} />
                {/* Action */}
                {appt.status === "completed" && !appt.hasVisitRecord && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (onCreateVisitFromAppointment) {
                        onCreateVisitFromAppointment({
                          id: appt.id,
                          location: appt.location || undefined,
                          service: appt.service || undefined,
                          durationMin: appt.durationMin,
                        });
                      } else {
                        openTab("karta");
                      }
                    }}
                    className="rounded-md bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/25 whitespace-nowrap flex-none"
                  >
                    Оформить визит
                  </Button>
                )}
                {appt.status === "completed" && appt.hasVisitRecord && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (onCreateVisitFromAppointment) {
                        onCreateVisitFromAppointment({
                          id: appt.id,
                          location: appt.location || undefined,
                          service: appt.service || undefined,
                          durationMin: appt.durationMin,
                        });
                      } else {
                        openTab("karta");
                      }
                    }}
                    className="text-[11px] text-muted-foreground whitespace-nowrap flex-none hover:text-primary"
                  >
                    визит {fmtDateShort(appt.date)} →
                  </Button>
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
              {upcomingList.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {upcomingList.length}
                </span>
              )}
            </div>

            {upcomingList.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">Нет предстоящих записей</p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcomingList.map((appt) => (
                  <div key={appt.id} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground">
                        {appt.date ? `${fmtWeekday(appt.date)} ${fmtDate(appt.date)}` : "—"}{appt.time ? ` · ${appt.time}` : ""}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium text-primary border border-primary/20">
                        подтверждена
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[appt.location, appt.service].filter(Boolean).join(" · ")}
                      {appt.durationMin ? ` · ${appt.durationMin} мин` : ""}
                    </p>
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {["Перенести", "Отменить", "Комментарий"].map((label) => (
                        <Button
                          key={label}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => undefined}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Абонемент */}
          <MembershipPanel userId={userId} initialPackages={initialPackages} />
        </div>
      </div>

      {/* ================================================================
          ФИНАНСЫ — Платежи (moved from Учётка S2.5)
      ================================================================ */}
      <PaymentsPanel userId={userId} initialPaymentsSummary={initialPaymentsSummary} />

    </div>
  );
}

// ---------------------------------------------------------------------------
// Membership panel — real data from be_patient_packages
// ---------------------------------------------------------------------------

type ApiPackageItemBalance = {
  quantityInitial: number;
  remaining: number;
  serviceTitle?: string | null;
  displayRemaining?: number | null;
};
export type ApiPackage = {
  id: string;
  title: string;
  status: string;
  soldAt?: string | null;
  validUntil: string | null;
  balance?: { items: ApiPackageItemBalance[] } | null;
  /** Items with service info from PatientPackageRecord.items. */
  items?: Array<{ serviceId: string; quantityInitial: number; sortOrder: number }> | null;
};

const isActivePackageStatus = (s: string) => s === "active" || s === "activated";

type ConsumeSession = {
  startsAt: string;
};

function MembershipPanel({
  userId,
  initialPackages,
}: {
  userId: string;
  /** SSR-provided packages. When present, skips the initial client fetch. */
  initialPackages?: ApiPackage[] | null;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [packages, setPackages] = useState<ApiPackage[] | null>(() => initialPackages ?? null);
  const [error, setError] = useState(false);
  const [consumeSessions, setConsumeSessions] = useState<ConsumeSession[] | null>(null);
  const [consumeLoading, setConsumeLoading] = useState(false);

  useEffect(() => {
    // Skip initial fetch when SSR data provided.
    if (initialPackages != null) return;
    let active = true;
    fetch(`/api/doctor/booking-engine/patient-packages?platformUserId=${userId}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<{ ok: boolean; packages: ApiPackage[] }>;
      })
      .then((d) => {
        if (!active) return;
        setPackages(d.packages ?? []);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
      });
    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const activePackages = (packages ?? []).filter((p) => isActivePackageStatus(p.status));
  const pastPackages = (packages ?? []).filter((p) => !isActivePackageStatus(p.status));
  const active = activePackages[0] ?? null;
  const balanceItems = active?.balance?.items ?? [];
  const totalSessions = balanceItems.reduce((s, it) => s + (it.quantityInitial ?? 0), 0);
  const remainingSessions = balanceItems.reduce((s, it) => s + (it.remaining ?? 0), 0);

  // Fetch sessions for active package to show consume dates (startsAt of consumed sessions)
  useEffect(() => {
    if (!active) { setConsumeSessions(null); return; }
    let alive = true;
    setConsumeLoading(true);
    fetch(
      `/api/doctor/booking-engine/patient-packages/${active.id}/sessions?includePast=true`,
      { credentials: "include" },
    )
      .then((r) => r.ok ? (r.json() as Promise<{ ok: boolean; sessions?: Array<{ linkage: string; startsAt: string }> }>) : null)
      .catch(() => null)
      .then((data) => {
        if (!alive) return;
        const sessions = data?.sessions ?? [];
        setConsumeSessions(
          sessions
            .filter((s) => s.linkage === "consumed")
            .map((s) => ({ startsAt: s.startsAt })),
        );
        setConsumeLoading(false);
      });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  return (
    <div className={doctorSectionCardClass}>
      <div className="flex items-center gap-2">
        <p className={doctorSectionTitleClass}>Абонемент</p>
        {active ? (
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-[#e7f4ec] text-[#1f7a45]">
            активен
          </span>
        ) : null}
      </div>

      {packages === null && !error ? (
        <p className={cn(doctorSectionSubtitleClass, "text-xs")}>Загрузка…</p>
      ) : error ? (
        <p className={cn(doctorSectionSubtitleClass, "text-xs")}>Не удалось загрузить абонементы.</p>
      ) : active ? (
        <>
          <MembershipCardHeader
            title={active.title}
            soldAt={active.soldAt ?? null}
            totalSessions={totalSessions}
            remainingSessions={remainingSessions}
            items={balanceItems.map((it) => ({
              serviceTitle: it.serviceTitle,
              quantityInitial: it.quantityInitial,
            }))}
            consumeDates={consumeSessions ? consumeSessions.map((s) => s.startsAt) : null}
            consumeLoading={consumeLoading}
          />
          {active.validUntil ? (
            <p className="text-xs text-muted-foreground">
              действует до: {fmtDate(active.validUntil.slice(0, 10))}
            </p>
          ) : null}
        </>
      ) : (
        <p className={cn(doctorSectionSubtitleClass, "text-xs")}>Активного абонемента нет.</p>
      )}

      {pastPackages.length > 0 ? (
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground text-left w-full"
          >
            <span className="flex-1">Прошлые абонементы</span>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {pastPackages.length}
            </span>
            <span className="text-muted-foreground/60">{historyOpen ? "▾" : "▸"}</span>
          </Button>

          {historyOpen ? (
            <div className="flex flex-col gap-1 mt-0.5">
              {pastPackages.map((pkg) => {
                const items = pkg.balance?.items ?? [];
                const total = items.reduce((s, it) => s + (it.quantityInitial ?? 0), 0);
                const remaining = items.reduce((s, it) => s + (it.remaining ?? 0), 0);
                return (
                  <div key={pkg.id} className={cn(doctorSectionItemClass, "text-xs bg-muted/5")}>
                    <span className="font-medium text-foreground">«{pkg.title}»</span>
                    <span className="ml-2 text-muted-foreground">
                      {pkg.soldAt ? `куплен ${fmtDate(pkg.soldAt.slice(0, 10))} · ` : ""}
                      {pkg.validUntil ? `до ${fmtDate(pkg.validUntil.slice(0, 10))} · ` : ""}
                      использовано {total - remaining}/{total}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}

      <p className={cn(doctorSectionSubtitleClass, "text-[11px] leading-relaxed")}>
        Работа с абонементом — здесь. Карточка «Абонемент» на Обзоре ведёт сюда по клику.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments panel — moved from PatientTabAccount (S2.5)
// Real data from GET /api/doctor/patients/{userId}/payments
// ---------------------------------------------------------------------------

export type PaymentItem = {
  id: string;
  amountMinor: number;
  currency?: string;
  kind: "cash" | "acquiring";
  status: string;
  comment?: string | null;
  service?: string | null;
  visitId?: string | null;
  createdAt: string;
};

type PaymentsResponse = {
  ok: true;
  payments: PaymentItem[];
  totalPaidMinor: number;
};

function fmtRub(minorAmount: number): string {
  return (minorAmount / 100).toLocaleString("ru-RU") + " ₽";
}

function fmtPaymentDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });
}

function PaymentsPanel({
  userId,
  initialPaymentsSummary,
}: {
  userId: string;
  /** SSR-provided payments + total. When present, skips the initial client fetch. */
  initialPaymentsSummary?: { payments: PaymentItem[]; totalPaidMinor: number } | null;
}) {
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentItem[] | null>(() => initialPaymentsSummary?.payments ?? null);
  const [totalPaidMinor, setTotalPaidMinor] = useState(() => initialPaymentsSummary?.totalPaidMinor ?? 0);
  const [fetched, setFetched] = useState(() => initialPaymentsSummary != null);

  // Cash form state
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashAmountRub, setCashAmountRub] = useState("");
  const [cashComment, setCashComment] = useState("");
  const [cashService, setCashService] = useState("");
  const [cashPending, setCashPending] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const res = await fetch(
        `/api/doctor/patients/${encodeURIComponent(userId)}/payments`,
        { credentials: "include" },
      );
      if (res.status === 404 || res.status === 501) {
        setUnavailable(true);
        return;
      }
      const data = (await res.json().catch(() => null)) as PaymentsResponse | null;
      if (!res.ok || !data?.ok) {
        setUnavailable(true);
        return;
      }
      setPayments(data.payments);
      setTotalPaidMinor(data.totalPaidMinor);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!fetched) {
      setFetched(true);
      void loadPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleSubmitCash = async () => {
    const rubles = parseFloat(cashAmountRub.replace(",", "."));
    if (!rubles || rubles <= 0) {
      setCashError("Введите сумму > 0");
      return;
    }
    const amountMinor = Math.round(rubles * 100);
    setCashPending(true);
    setCashError(null);
    try {
      const res = await fetch(
        `/api/doctor/patients/${encodeURIComponent(userId)}/payments`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountMinor,
            comment: cashComment.trim() || undefined,
            service: cashService.trim() || undefined,
          }),
        },
      );
      if (res.status === 404 || res.status === 501) {
        setCashError("Эндпоинт платежей ещё не готов — попробуйте позже.");
        return;
      }
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setCashError(data?.error ?? `Ошибка ${res.status}`);
        return;
      }
      setCashAmountRub("");
      setCashComment("");
      setCashService("");
      setShowCashForm(false);
      setFetched(false);
    } catch {
      setCashError("network");
    } finally {
      setCashPending(false);
    }
  };

  // Reload when fetched flag resets
  useEffect(() => {
    if (!fetched) {
      setFetched(true);
      void loadPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetched]);

  return (
    <div className={doctorSectionCardClass}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className={doctorSectionTitleClass}>Финансы · Платежи</p>
        {!unavailable && payments !== null && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setFetched(false)}
            className="ml-auto text-xs text-muted-foreground hover:text-primary"
          >
            обновить
          </Button>
        )}
      </div>

      {loading && (
        <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>Загрузка платежей…</p>
      )}

      {unavailable && !loading && (
        <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
          Платежи недоступны — эндпоинт строится параллельным агентом.
          Данные появятся после деплоя миграции.
        </div>
      )}

      {error && !unavailable && !loading && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}

      {!unavailable && !loading && payments !== null && (
        <>
          {/* Total */}
          <div className={cn(doctorStatCardShellClass)}>
            <div className={cn(doctorMetricLabelClass, "mb-0.5")}>Итого оплачено</div>
            <div className={cn(doctorMetricValueClass, "text-base")}>{fmtRub(totalPaidMinor)}</div>
          </div>

          {/* Payment list */}
          {payments.length === 0 ? (
            <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>Нет записей об оплате.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className={cn(doctorSectionItemClass, "flex items-center gap-2 text-xs")}
                >
                  <span className="flex-none text-muted-foreground text-[11px] font-medium">
                    {p.kind === "cash" ? "нал" : "экв"}
                  </span>
                  <span className="flex-1 truncate">
                    {p.service ?? p.comment ?? (p.kind === "cash" ? "Наличные" : "Эквайринг")}
                    {p.comment && p.service && (
                      <span className="text-muted-foreground ml-1">· {p.comment}</span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums whitespace-nowrap">
                    {fmtRub(p.amountMinor)}
                  </span>
                  <span className={cn(doctorSectionSubtitleClass, "whitespace-nowrap pl-2")}>
                    {fmtPaymentDate(p.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Manual cash form */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCashForm((v) => !v);
                setCashError(null);
              }}
            >
              Внести наличные
            </Button>
            <span className="text-[11px] text-muted-foreground">Эквайринг — скоро</span>
          </div>

          {showCashForm && (
            <div className="rounded-lg border border-border bg-background p-3 flex flex-col gap-2 shadow-sm">
              <p className={cn(doctorSectionTitleClass, "text-xs")}>Внести наличные</p>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex flex-col gap-0.5 flex-1 min-w-[100px]">
                  <label className="text-[11px] text-muted-foreground">Сумма, ₽</label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="4000"
                    value={cashAmountRub}
                    onChange={(e) => setCashAmountRub(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                  <label className="text-[11px] text-muted-foreground">Услуга</label>
                  <Input
                    type="text"
                    placeholder="Приём · 60 мин"
                    value={cashService}
                    onChange={(e) => setCashService(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                  <label className="text-[11px] text-muted-foreground">Комментарий</label>
                  <Input
                    type="text"
                    placeholder="доп. инфо…"
                    value={cashComment}
                    onChange={(e) => setCashComment(e.target.value)}
                  />
                </div>
              </div>
              {cashError && (
                <p className="text-[11px] text-destructive">{cashError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cashPending}
                  onClick={() => { setShowCashForm(false); setCashError(null); }}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={cashPending}
                  onClick={() => void handleSubmitCash()}
                >
                  {cashPending ? "…" : "Сохранить"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
        Учёт наличных платежей. Эквайринг (провайдер не выбран) — следующий этап.
      </p>
    </div>
  );
}
