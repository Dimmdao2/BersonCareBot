"use client";

/**
 * PatientsPageClient — unified patients list.
 *
 * Layout (desktop, 2-column, lg:grid-cols-[1.4fr_1fr]):
 *   LEFT  (wider, 1.4fr) — search input (full-width, top of block) +
 *                          patient list with sticky icon-filter rail header
 *   RIGHT (narrower, 1fr) — segment stat cards (5-per-row, compact) +
 *                           channel/archive filter buttons +
 *                           patient preview pane (appears on row click)
 *
 * Row click → selects patient + shows preview pane. Does NOT navigate.
 * «Открыть карточку» button in the pane is the only way to open the full card.
 *
 * Search logic: debounced API call (/api/doctor/patients?q=…), min 3 chars.
 */

import { Suspense, use, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Ban, CalendarDays, Dumbbell, Handshake, Mail, MessageSquare, Phone, Send, Smartphone, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import type { ClientListItem, DoctorDashboardPatientMetrics } from "@/modules/doctor-clients/ports";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorStatCard } from "@/app/app/doctor/analytics/clients/DoctorStatCard";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { doctorListItemOuterClass } from "@/shared/ui/doctor/doctorVisual";
import { doctorClientListRowLinkClass } from "@/app/app/doctor/clients/doctorClientCardChrome";
import { PatientPreviewPane } from "./PatientPreviewPane";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InitialFilters = {
  q: string;
  segment: string | null;
  channel: string | null;
  archivedOnly: boolean;
};

export type PatientsPageClientProps = {
  listPromise: Promise<ClientListItem[]>;
  metricsPromise: Promise<DoctorDashboardPatientMetrics>;
  initialFilters: InitialFilters;
};

type TriFilterState = "off" | "positive" | "negative";
type RichFilterState = "off" | "positive" | "new" | "negative";

type IconFiltersState = {
  appointments: RichFilterState;
  messages: RichFilterState;
  comments: RichFilterState;
  memberships: TriFilterState;
  support: TriFilterState;
  telegram: TriFilterState;
  max: TriFilterState;
  email: TriFilterState;
  phone: TriFilterState;
  app: TriFilterState;
};

// Legacy per-button filter state (mirrors old DoctorClientsPanel ClientFiltersState)
type LegacyFiltersState = {
  telegram: boolean;
  max: boolean;
  email: boolean;
  phone: boolean;
  visitedMonth: boolean;
  cancellations: boolean;
  reschedules: boolean;
  withoutAppointments: boolean;
  memberships: boolean;
  archive: boolean;
};

// ---------------------------------------------------------------------------
// Segment definitions (merged: old 4-card model + new extended segments)
// ---------------------------------------------------------------------------

type SegmentKey =
  | "all"
  | "appointments"
  | "on_support"
  | "with_program"
  | "without_appointments"
  | "new"
  | "former"
  | "cancellations"
  | "memberships"
  | "visited_month";

type SegmentDef = {
  key: SegmentKey;
  title: string;
  /** URL param value (null = no filter / "Все") */
  urlValue: string | null;
};

const SEGMENTS: SegmentDef[] = [
  { key: "all",                  title: "Все",                  urlValue: null },
  { key: "appointments",         title: "С записями",           urlValue: "appointments" },
  { key: "on_support",           title: "На сопровождении",     urlValue: "on_support" },
  { key: "with_program",         title: "С программой",         urlValue: "with_program" },
  { key: "without_appointments", title: "Без приёмов",          urlValue: "without_appointments" },
  { key: "new",                  title: "Новые",                urlValue: "new" },
  { key: "former",               title: "Бывшие",               urlValue: "former" },
  { key: "cancellations",        title: "С отменами",           urlValue: "cancellations" },
  { key: "memberships",          title: "С абонементами",       urlValue: "memberships" },
  { key: "visited_month",        title: "Приём в этом мес.",    urlValue: "visited_month" },
];

const CLIENT_ICON_RAIL_CLASS = "grid shrink-0 grid-cols-[repeat(10,1.75rem)] gap-1";

// ---------------------------------------------------------------------------
// Icon filter helpers (icon-rail on list header)
// ---------------------------------------------------------------------------

function cycleTriFilterState(state: TriFilterState): TriFilterState {
  if (state === "off") return "positive";
  if (state === "positive") return "negative";
  return "off";
}

function cycleRichFilterState(state: RichFilterState): RichFilterState {
  if (state === "off") return "positive";
  if (state === "positive") return "new";
  if (state === "new") return "negative";
  return "off";
}

function applyTriFilter(
  list: ClientListItem[],
  state: TriFilterState,
  predicate: (item: ClientListItem) => boolean,
): ClientListItem[] {
  if (state === "off") return list;
  if (state === "positive") return list.filter(predicate);
  return list.filter((item) => !predicate(item));
}

function applyRichFilter(
  list: ClientListItem[],
  state: RichFilterState,
  hasPredicate: (item: ClientListItem) => boolean,
  newPredicate: (item: ClientListItem) => boolean,
): ClientListItem[] {
  if (state === "off") return list;
  if (state === "positive") return list.filter(hasPredicate);
  if (state === "new") return list.filter(newPredicate);
  return list.filter((item) => !hasPredicate(item));
}

function applyIconFilters(
  list: ClientListItem[],
  iconFilters: IconFiltersState,
): ClientListItem[] {
  list = applyRichFilter(
    list,
    iconFilters.appointments,
    (c) => (c.hasAppointmentHistory ?? false) || (c.activeAppointmentsCount ?? 0) > 0,
    (c) => (c.activeAppointmentsCount ?? 0) > 0,
  );
  list = applyRichFilter(
    list,
    iconFilters.messages,
    (c) => (c.hasConversation ?? false) || (c.unreadMessagesCount ?? 0) > 0,
    (c) => (c.unreadMessagesCount ?? 0) > 0,
  );
  list = applyRichFilter(
    list,
    iconFilters.comments,
    (c) => c.activeTreatmentProgram,
    (c) => (c.unreadExerciseCommentsCount ?? 0) > 0,
  );
  list = applyTriFilter(list, iconFilters.memberships, (c) => c.hasMemberships === true);
  list = applyTriFilter(list, iconFilters.support, (c) => c.isOnSupport === true);
  list = applyTriFilter(
    list,
    iconFilters.telegram,
    (c) => Boolean(c.bindings.telegramId?.trim()) && !c.bindings.telegramBotBlocked,
  );
  list = applyTriFilter(
    list,
    iconFilters.max,
    (c) => Boolean(c.bindings.maxId?.trim()) && !c.bindings.maxBotBlocked,
  );
  list = applyTriFilter(list, iconFilters.email, (c) => c.hasEmail === true);
  list = applyTriFilter(list, iconFilters.phone, (c) => Boolean(c.phone?.trim()));
  list = applyTriFilter(list, iconFilters.app, (c) => c.hasApp === true);
  return list;
}

const DEFAULT_ICON_FILTERS: IconFiltersState = {
  appointments: "off",
  messages: "off",
  comments: "off",
  memberships: "off",
  support: "off",
  telegram: "off",
  max: "off",
  email: "off",
  phone: "off",
  app: "off",
};

const DEFAULT_LEGACY_FILTERS: LegacyFiltersState = {
  telegram: false,
  max: false,
  email: false,
  phone: false,
  visitedMonth: false,
  cancellations: false,
  reschedules: false,
  withoutAppointments: false,
  memberships: false,
  archive: false,
};

// ---------------------------------------------------------------------------
// Segment count helper (maps server metrics → each segment)
// ---------------------------------------------------------------------------

function getSegmentCount(
  key: SegmentKey,
  metrics: DoctorDashboardPatientMetrics,
  clients: ClientListItem[],
): number | null {
  switch (key) {
    case "all":                  return clients.length;
    case "appointments":         return clients.filter((c) => (c.activeAppointmentsCount ?? 0) > 0).length;
    case "on_support":           return metrics.onSupportCount;
    case "with_program":         return metrics.withProgramCount;
    case "without_appointments": return metrics.subscriberCount;
    case "new":                  return metrics.newCount;
    case "former":               return metrics.formerCount;
    case "cancellations":        return metrics.cancellationsCount;
    case "memberships":          return metrics.membershipsCount;
    case "visited_month":        return metrics.visitedThisCalendarMonthCount;
    default:                     return null;
  }
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildUrl(filters: {
  q?: string;
  segment?: string | null;
  channel?: string | null;
  archivedOnly?: boolean;
}): string {
  const sp = new URLSearchParams();
  if (filters.q?.trim()) sp.set("q", filters.q.trim());
  if (filters.segment) sp.set("segment", filters.segment);
  if (filters.channel) sp.set("channel", filters.channel);
  if (filters.archivedOnly) sp.set("archived", "true");
  const qs = sp.toString();
  return qs ? `${routePaths.doctorPatients}?${qs}` : routePaths.doctorPatients;
}

// ---------------------------------------------------------------------------
// IconSlot (patient list row)
// ---------------------------------------------------------------------------

function iconBadge(value: number | null): ReactNode {
  if (!value || value <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 inline-flex min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none text-primary-foreground">
      {value}
    </span>
  );
}

type IconSlotProps = {
  visible: boolean;
  label: string;
  title: string;
  badge?: number;
  children: ReactNode;
};

function IconSlot({ visible, label, title, badge, children }: IconSlotProps) {
  if (!visible) {
    return <span className="inline-flex size-7 shrink-0" aria-hidden />;
  }
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center">
      <span
        className="relative inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground"
        aria-label={label}
        title={title}
      >
        {children}
        {iconBadge(badge ?? 0)}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// HeaderIconButton (icon filter rail)
// ---------------------------------------------------------------------------

type HeaderIconButtonProps = {
  label: string;
  title: string;
  state: TriFilterState | RichFilterState;
  onClick: () => void;
  children: ReactNode;
};

function HeaderIconButton({ label, title, state, onClick, children }: HeaderIconButtonProps) {
  const isPositive = state === "positive" || state === "new";
  const isNegative = state === "negative";
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className={[
        "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors",
        isPositive
          ? "border-primary/50 bg-primary/15 text-primary"
          : isNegative
            ? "border-slate-500/60 bg-slate-600/20 text-slate-700 dark:text-slate-300"
            : "border-border/60 bg-muted/40 text-muted-foreground",
      ].join(" ")}
    >
      {children}
      {state === "new" ? (
        <span
          className="absolute -right-1 -top-1 inline-flex size-2.5 rounded-full bg-destructive"
          aria-hidden
        />
      ) : null}
      {isNegative ? (
        <span className="absolute -right-1 -top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-background">
          <Ban className="size-3 text-destructive" aria-hidden />
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// List skeleton
// ---------------------------------------------------------------------------

function PatientListSkeleton() {
  return (
    <div className="grid min-h-0 gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      {/* Left: list skeleton */}
      <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
        <div className="border-b border-border/60 px-5 py-2">
          <div className="h-6 w-full animate-pulse rounded bg-muted/50" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mx-2 mb-1.5 mt-1.5 h-10 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
      {/* Right: filters skeleton */}
      <div className="rounded-lg border border-border bg-card p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-2 h-8 animate-pulse rounded bg-muted/50" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content (Suspense boundary — uses `use()`)
// ---------------------------------------------------------------------------

type PatientsContentProps = {
  listPromise: Promise<ClientListItem[]>;
  metricsPromise: Promise<DoctorDashboardPatientMetrics>;
  activeSegment: string | null;
  activeChannel: string | null;
  archivedOnly: boolean;
  searchQuery: string;
  searchInput: string;
  legacyFilters: LegacyFiltersState;
  iconFilters: IconFiltersState;
  isListPending: boolean;
  selectedPatient: ClientListItem | null;
  onPatientSelect: (patient: ClientListItem) => void;
  onSegmentChange: (value: string | null) => void;
  onChannelChange: (channel: string | null, archived: boolean) => void;
  onToggleLegacyFilter: (key: keyof LegacyFiltersState) => void;
  onCycleRichIconFilter: (key: Extract<keyof IconFiltersState, "appointments" | "messages" | "comments">) => void;
  onCycleTriIconFilter: (key: Exclude<keyof IconFiltersState, "appointments" | "messages" | "comments">) => void;
  onClearSearch: () => void;
  onSearchInput: (value: string) => void;
};

function PatientsContent({
  listPromise,
  metricsPromise,
  activeSegment,
  activeChannel,
  archivedOnly,
  searchQuery,
  searchInput,
  legacyFilters,
  iconFilters,
  isListPending,
  selectedPatient,
  onPatientSelect,
  onSegmentChange,
  onChannelChange,
  onToggleLegacyFilter,
  onCycleRichIconFilter,
  onCycleTriIconFilter,
  onClearSearch,
  onSearchInput,
}: PatientsContentProps) {
  const allClients = use(listPromise);
  const metrics = use(metricsPromise);

  // Apply client-side icon filters on top of server-filtered list
  const filtered = applyIconFilters(allClients, iconFilters);

  // Segment tone: highlight active segment card
  function segmentTone(key: SegmentKey): "neutral" | "warning" {
    const seg = SEGMENTS.find((s) => s.key === key);
    if (!seg) return "neutral";
    const isActive =
      (key === "all" && activeSegment === null && !archivedOnly) ||
      (seg.urlValue !== null && seg.urlValue === activeSegment);
    return isActive ? "warning" : "neutral";
  }

  return (
    <div className="grid min-h-0 gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      {/* ===== LEFT: search + patient list ===== */}
      <section
        className={cn(
          "flex min-h-0 flex-col gap-2",
        )}
      >
        {/* Search — full width, top of the list column */}
        <div>
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Поиск (от 3 символов)…"
              value={searchInput}
              onChange={(e) => onSearchInput(e.target.value)}
              className="pl-8 pr-8 text-sm"
              aria-label="Поиск пациентов"
            />
            {searchInput && (
              <button
                type="button"
                onClick={onClearSearch}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Сбросить поиск"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {searchInput.length > 0 && searchInput.trim().length < 3 ? (
            <p className="mt-1 text-muted-foreground text-xs">
              Введите ещё {3 - searchInput.trim().length} симв.
            </p>
          ) : null}
        </div>

        {/* Patient list card */}
        <div
          className={cn(
            "flex min-h-0 flex-col rounded-lg border border-border bg-card",
            "lg:h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-top,0px)_-_8.5rem)] lg:overflow-hidden",
          )}
        >
          {/* Sticky header: count + icon filter rail */}
          <div className="sticky top-0 z-10 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 bg-card px-5 py-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              Пациентов: {filtered.length}
              {isListPending && <span className="ml-1 animate-pulse">…</span>}
            </p>
            <div className={CLIENT_ICON_RAIL_CLASS} aria-label="Фильтры списка">
              <HeaderIconButton
                label="Фильтр записей"
                title="Записи: все состояния -> с записями -> с активными -> без записей"
                state={iconFilters.appointments}
                onClick={() => onCycleRichIconFilter("appointments")}
              >
                <CalendarDays className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр переписки"
                title="Переписка: все состояния -> с перепиской -> с непрочитанными -> без переписки"
                state={iconFilters.messages}
                onClick={() => onCycleRichIconFilter("messages")}
              >
                <MessageSquare className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр комментариев"
                title="Комментарии по упражнениям: все -> есть -> новые -> нет"
                state={iconFilters.comments}
                onClick={() => onCycleRichIconFilter("comments")}
              >
                <Dumbbell className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр сопровождения"
                title="Сопровождение: все -> на сопровождении -> не на сопровождении"
                state={iconFilters.support}
                onClick={() => onCycleTriIconFilter("support")}
              >
                <Handshake className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр абонементов"
                title="Абонементы: все -> с абонементами -> без абонементов"
                state={iconFilters.memberships}
                onClick={() => onCycleTriIconFilter("memberships")}
              >
                <Ticket className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр телефона"
                title="Телефон: все -> есть телефон -> нет телефона"
                state={iconFilters.phone}
                onClick={() => onCycleTriIconFilter("phone")}
              >
                <Phone className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр Telegram"
                title="Telegram: все -> подключен -> не подключен"
                state={iconFilters.telegram}
                onClick={() => onCycleTriIconFilter("telegram")}
              >
                <Send className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр MAX"
                title="MAX: все -> подключен -> не подключен"
                state={iconFilters.max}
                onClick={() => onCycleTriIconFilter("max")}
              >
                <span className="text-[10px] font-semibold leading-none">М</span>
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр email"
                title="Email: все -> указан -> не указан"
                state={iconFilters.email}
                onClick={() => onCycleTriIconFilter("email")}
              >
                <Mail className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр приложения"
                title="Приложение: все -> есть приложение -> нет приложения"
                state={iconFilters.app}
                onClick={() => onCycleTriIconFilter("app")}
              >
                <Smartphone className="size-3.5" aria-hidden />
              </HeaderIconButton>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {searchQuery.trim()
                ? "Нет пациентов по запросу."
                : "Нет пациентов по заданным фильтрам."}
            </p>
          ) : (
            <ul id="doctor-patients-list" className="m-0 min-h-0 flex-1 list-none space-y-1.5 overflow-y-auto p-2">
              {filtered.map((c) => {
                const appointmentCount = c.activeAppointmentsCount ?? (c.nextAppointmentLabel ? 1 : 0);
                const unreadMessagesCount = c.unreadMessagesCount ?? 0;
                const unreadExerciseCommentsCount = c.unreadExerciseCommentsCount ?? 0;
                const hasApptHistory = (c.hasAppointmentHistory ?? false) || appointmentCount > 0;
                const isSelected = selectedPatient?.userId === c.userId;
                return (
                  <li key={c.userId} id={`doctor-patients-item-${c.userId}`} className={doctorListItemOuterClass}>
                    <button
                      id={`doctor-patients-card-${c.userId}`}
                      type="button"
                      onClick={() => onPatientSelect(c)}
                      aria-pressed={isSelected}
                      className={cn(
                        doctorClientListRowLinkClass,
                        "items-center w-full",
                        isSelected && "ring-2 ring-primary/60 bg-primary/5",
                      )}
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{c.displayName}</span>
                      </div>
                      <div className={CLIENT_ICON_RAIL_CLASS}>
                        <IconSlot
                          visible={hasApptHistory}
                          label={`История записей${appointmentCount > 0 ? `, активных: ${appointmentCount}` : ""}`}
                          title="История записей"
                          badge={appointmentCount > 0 ? appointmentCount : undefined}
                        >
                          <CalendarDays className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={(c.hasConversation ?? false) || unreadMessagesCount > 0}
                          label={`Переписка${unreadMessagesCount > 0 ? `, непрочитанных: ${unreadMessagesCount}` : ""}`}
                          title="Переписка"
                          badge={unreadMessagesCount > 0 ? unreadMessagesCount : undefined}
                        >
                          <MessageSquare className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={c.activeTreatmentProgram}
                          label={`Программа тренировок${unreadExerciseCommentsCount > 0 ? `, новых комментариев: ${unreadExerciseCommentsCount}` : ""}`}
                          title="Назначенная программа тренировок"
                          badge={unreadExerciseCommentsCount > 0 ? unreadExerciseCommentsCount : undefined}
                        >
                          <Dumbbell className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={c.isOnSupport === true}
                          label="Клиент на сопровождении"
                          title="На сопровождении"
                        >
                          <Handshake className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={c.hasMemberships === true}
                          label="Есть абонемент"
                          title="Есть абонемент"
                        >
                          <Ticket className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot visible={Boolean(c.phone?.trim())} label="Телефон указан" title="Телефон указан">
                          <Phone className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={Boolean(c.bindings.telegramId?.trim())}
                          label="Подключён Telegram"
                          title="Подключён Telegram"
                        >
                          <Send className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={Boolean(c.bindings.maxId?.trim())}
                          label="Подключён MAX"
                          title="Подключён MAX"
                        >
                          <span className="text-[10px] font-semibold leading-none">М</span>
                        </IconSlot>
                        <IconSlot visible={c.hasEmail === true} label="Указан email" title="Указан email">
                          <Mail className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot visible={c.hasApp === true} label="Есть приложение" title="Есть приложение">
                          <Smartphone className="size-3.5" aria-hidden />
                        </IconSlot>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ===== RIGHT: segment cards + channel filters + preview pane ===== */}
      <section
        className={cn(
          "flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-card p-3",
          "lg:h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-top,0px)_-_6rem)] lg:overflow-y-auto",
        )}
      >
        {/* Segment stat cards — 5 per row, compact */}
        <DoctorMetricList className="grid-cols-5">
          {SEGMENTS.map((seg) => (
            <DoctorStatCard
              key={seg.key}
              id={`doctor-patients-segment-${seg.key}`}
              title={seg.title}
              value={getSegmentCount(seg.key, metrics, allClients) ?? "—"}
              tone={segmentTone(seg.key)}
              onClick={() => onSegmentChange(seg.urlValue)}
            />
          ))}
        </DoctorMetricList>

        {/* Channel + archive filter buttons */}
        <div className="border-t border-border/60 pt-2">
          <p className="mb-1.5 text-xs text-muted-foreground">Дополнительные фильтры</p>
          <div id="doctor-patients-filters" className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={activeChannel === "telegram" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onChannelChange(activeChannel === "telegram" ? null : "telegram", false)}
              aria-pressed={activeChannel === "telegram"}
            >
              Telegram
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeChannel === "max" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onChannelChange(activeChannel === "max" ? null : "max", false)}
              aria-pressed={activeChannel === "max"}
            >
              MAX
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeChannel === "email" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onChannelChange(activeChannel === "email" ? null : "email", false)}
              aria-pressed={activeChannel === "email"}
            >
              Email
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeChannel === "phone" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onChannelChange(activeChannel === "phone" ? null : "phone", false)}
              aria-pressed={activeChannel === "phone"}
            >
              Телефон
            </Button>
            <Button
              type="button"
              size="sm"
              variant={legacyFilters.visitedMonth ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onToggleLegacyFilter("visitedMonth")}
              aria-pressed={legacyFilters.visitedMonth}
            >
              Приём в этом месяце
            </Button>
            <Button
              type="button"
              size="sm"
              variant={legacyFilters.cancellations ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onToggleLegacyFilter("cancellations")}
              aria-pressed={legacyFilters.cancellations}
            >
              Есть отмены
            </Button>
            <Button
              type="button"
              size="sm"
              variant={legacyFilters.reschedules ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onToggleLegacyFilter("reschedules")}
              aria-pressed={legacyFilters.reschedules}
            >
              Есть переносы
            </Button>
            <Button
              type="button"
              size="sm"
              variant={legacyFilters.withoutAppointments ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onToggleLegacyFilter("withoutAppointments")}
              aria-pressed={legacyFilters.withoutAppointments}
            >
              Без записей
            </Button>
            <Button
              type="button"
              size="sm"
              variant={legacyFilters.memberships ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onToggleLegacyFilter("memberships")}
              aria-pressed={legacyFilters.memberships}
            >
              С абонементами
            </Button>
            <Button
              type="button"
              size="sm"
              variant={archivedOnly ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onChannelChange(null, !archivedOnly)}
              aria-pressed={archivedOnly}
            >
              Архив
            </Button>
          </div>
        </div>

        {/* Patient preview pane — below filters */}
        <PatientPreviewPane patient={selectedPatient} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component — manages state + debounced search
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_MIN_CHARS = 3;

export function PatientsPageClient({
  listPromise: initialListPromise,
  metricsPromise,
  initialFilters,
}: PatientsPageClientProps) {
  const [isListPending, startListTransition] = useTransition();

  // Search state (local, debounced)
  const [searchInput, setSearchInput] = useState(initialFilters.q);
  const [searchQuery, setSearchQuery] = useState(initialFilters.q);
  const [listPromise, setListPromise] = useState<Promise<ClientListItem[]>>(initialListPromise);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Segment / channel / archive state (sync to URL on change)
  const [activeSegment, setActiveSegment] = useState<string | null>(initialFilters.segment);
  const [activeChannel, setActiveChannel] = useState<string | null>(
    initialFilters.archivedOnly ? null : initialFilters.channel,
  );
  const [archivedOnly, setArchivedOnly] = useState(initialFilters.archivedOnly);

  // Icon filter state (client-side only, not reflected in URL)
  const [iconFilters, setIconFilters] = useState<IconFiltersState>(DEFAULT_ICON_FILTERS);

  // Legacy per-button filter state (client-side only)
  const [legacyFilters, setLegacyFilters] = useState<LegacyFiltersState>(DEFAULT_LEGACY_FILTERS);

  // Selected patient for preview pane
  const [selectedPatient, setSelectedPatient] = useState<ClientListItem | null>(null);

  const router = useRouter();

  /** Navigate to update server-side filters (segment, channel, archive). */
  const navigateToFilters = useCallback(
    (overrides: {
      segment?: string | null;
      channel?: string | null;
      archivedOnly?: boolean;
    }) => {
      const url = buildUrl({
        q: searchInput,
        segment: overrides.segment !== undefined ? overrides.segment : activeSegment,
        channel: overrides.channel !== undefined ? overrides.channel : activeChannel,
        archivedOnly: overrides.archivedOnly !== undefined ? overrides.archivedOnly : archivedOnly,
      });
      startListTransition(() => {
        router.push(url, { scroll: false });
      });
    },
    [router, searchInput, activeSegment, activeChannel, archivedOnly],
  );

  /** Fetch client list from API (for search debounce — avoids full navigation). */
  const fetchList = useCallback(
    (q: string) => {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (activeSegment) sp.set("segment", activeSegment);
      if (activeChannel) sp.set("channel", activeChannel);
      if (archivedOnly) sp.set("archived", "true");
      const newPromise = fetch(`/api/doctor/patients?${sp.toString()}`)
        .then((r) => {
          if (!r.ok) throw new Error(`Patients fetch failed: ${r.status}`);
          return r.json() as Promise<{ clients: ClientListItem[] }>;
        })
        .then((data) => data.clients);
      startListTransition(() => {
        setListPromise(newPromise);
      });
    },
    [activeSegment, activeChannel, archivedOnly],
  );

  const handleSegmentChange = useCallback(
    (value: string | null) => {
      setActiveSegment(value);
      navigateToFilters({ segment: value });
    },
    [navigateToFilters],
  );

  const handleChannelChange = useCallback(
    (channel: string | null, archived: boolean) => {
      setActiveChannel(channel);
      setArchivedOnly(archived);
      navigateToFilters({ channel, archivedOnly: archived });
    },
    [navigateToFilters],
  );

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = value.trim();
      if (trimmed.length === 0 || trimmed.length >= SEARCH_MIN_CHARS) {
        debounceRef.current = setTimeout(() => {
          setSearchQuery(trimmed);
          fetchList(value);
        }, SEARCH_DEBOUNCE_MS);
      }
    },
    [fetchList],
  );

  const clearSearch = useCallback(() => {
    setSearchInput("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery("");
    fetchList("");
  }, [fetchList]);

  const handleToggleLegacyFilter = useCallback(
    (key: keyof LegacyFiltersState) => {
      setLegacyFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [],
  );

  const handlePatientSelect = useCallback((patient: ClientListItem) => {
    setSelectedPatient((prev) => (prev?.userId === patient.userId ? null : patient));
  }, []);

  // Keep state in sync when server-side navigation occurs (Next.js router)
  useEffect(() => {
    setListPromise(initialListPromise);
    setSearchInput(initialFilters.q);
    setActiveSegment(initialFilters.segment);
    setActiveChannel(initialFilters.archivedOnly ? null : initialFilters.channel);
    setArchivedOnly(initialFilters.archivedOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialListPromise]);

  const handleCycleRichIconFilter = useCallback(
    (key: Extract<keyof IconFiltersState, "appointments" | "messages" | "comments">) => {
      setIconFilters((prev) => ({ ...prev, [key]: cycleRichFilterState(prev[key]) }));
    },
    [],
  );

  const handleCycleTriIconFilter = useCallback(
    (key: Exclude<keyof IconFiltersState, "appointments" | "messages" | "comments">) => {
      setIconFilters((prev) => ({ ...prev, [key]: cycleTriFilterState(prev[key]) }));
    },
    [],
  );

  return (
    <Suspense fallback={<PatientListSkeleton />}>
      <PatientsContent
        listPromise={listPromise}
        metricsPromise={metricsPromise}
        activeSegment={activeSegment}
        activeChannel={activeChannel}
        archivedOnly={archivedOnly}
        searchQuery={searchQuery}
        searchInput={searchInput}
        legacyFilters={legacyFilters}
        iconFilters={iconFilters}
        isListPending={isListPending}
        selectedPatient={selectedPatient}
        onPatientSelect={handlePatientSelect}
        onSegmentChange={handleSegmentChange}
        onChannelChange={handleChannelChange}
        onToggleLegacyFilter={handleToggleLegacyFilter}
        onCycleRichIconFilter={handleCycleRichIconFilter}
        onCycleTriIconFilter={handleCycleTriIconFilter}
        onClearSearch={clearSearch}
        onSearchInput={handleSearchInput}
      />
    </Suspense>
  );
}
