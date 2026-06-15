"use client";

/**
 * PatientsPageClient — unified patients list.
 *
 * Layout (desktop, 2-column):
 *   LEFT  – filter panel: search (full-width) + segment stat cards + channel row + additional filters
 *   RIGHT – patient list with icon-filter rail header + patient preview
 *
 * The filter panel markup is kept pixel-for-pixel identical to the old DoctorClientsPanel
 * right-section (§ "Дополнительные фильтры" + DoctorStatCard segments).
 * Only the height clip is fixed: the panel now fills the full viewport height.
 *
 * Search logic reused from Wave-2 PatientsPageClient (debounced API call, min 3 chars).
 */

import { Suspense, use, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
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
  { key: "all",                 title: "Все",                  urlValue: null },
  { key: "appointments",        title: "С записями",           urlValue: "appointments" },
  { key: "on_support",          title: "На сопровождении",     urlValue: "on_support" },
  { key: "with_program",        title: "С программой",         urlValue: "with_program" },
  { key: "without_appointments",title: "Без приёмов",          urlValue: "without_appointments" },
  { key: "new",                 title: "Новые",                urlValue: "new" },
  { key: "former",              title: "Бывшие",               urlValue: "former" },
  { key: "cancellations",       title: "С отменами",           urlValue: "cancellations" },
  { key: "memberships",         title: "С абонементами",       urlValue: "memberships" },
  { key: "visited_month",       title: "Приём в этом мес.",    urlValue: "visited_month" },
];

// Row split: top row (5 items), bottom row (5 items)
const SEGMENTS_ROW1 = SEGMENTS.slice(0, 5);
const SEGMENTS_ROW2 = SEGMENTS.slice(5);

type ChannelKey = "telegram" | "max" | "email" | "phone" | "archive";
type ChannelDef = { key: ChannelKey; label: string };

const CHANNELS: ChannelDef[] = [
  { key: "telegram", label: "Telegram" },
  { key: "max",      label: "MAX" },
  { key: "email",    label: "Email" },
  { key: "phone",    label: "Телефон" },
  { key: "archive",  label: "Архив" },
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
    <div className="grid min-h-0 gap-3 lg:grid-cols-2 lg:items-start">
      <div className="rounded-lg border border-border bg-card p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-2 h-8 animate-pulse rounded bg-muted/50" />
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border/60 px-5 py-2">
          <div className="h-6 w-full animate-pulse rounded bg-muted/50" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mx-2 mb-1.5 mt-1.5 h-10 animate-pulse rounded-md bg-muted/40" />
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
  iconFilters: IconFiltersState;
  isListPending: boolean;
  onSegmentChange: (value: string | null) => void;
  onChannelChange: (channel: string | null, archived: boolean) => void;
  onCycleRichIconFilter: (key: Extract<keyof IconFiltersState, "appointments" | "messages" | "comments">) => void;
  onCycleTriIconFilter: (key: Exclude<keyof IconFiltersState, "appointments" | "messages" | "comments">) => void;
};

function PatientsContent({
  listPromise,
  metricsPromise,
  activeSegment,
  activeChannel,
  archivedOnly,
  searchQuery,
  iconFilters,
  isListPending,
  onSegmentChange,
  onChannelChange,
  onCycleRichIconFilter,
  onCycleTriIconFilter,
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
    <div className="grid min-h-0 gap-3 lg:grid-cols-2 lg:items-start">
      {/* ===== LEFT: filter panel ===== */}
      {/* rounded-lg border bg-card p3 keeps the exact old right-section look */}
      <section className="rounded-lg border border-border bg-card p-3">
        {/* Segment stat cards — exact DoctorMetricList / DoctorStatCard markup from old page */}
        <DoctorMetricList className="grid-cols-5 xl:grid-cols-5 mb-1">
          {SEGMENTS_ROW1.map((seg) => (
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
        <DoctorMetricList className="grid-cols-5 xl:grid-cols-5">
          {SEGMENTS_ROW2.map((seg) => (
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

        {/* Channel / archive row */}
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-2 text-xs text-muted-foreground">Канал связи · архив</p>
          <div id="doctor-patients-filters" className="flex flex-wrap gap-1.5">
            {CHANNELS.map((ch) => {
              const isArchive = ch.key === "archive";
              const isActive = isArchive ? archivedOnly : activeChannel === ch.key;
              return (
                <Button
                  key={ch.key}
                  type="button"
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    if (isArchive) {
                      onChannelChange(null, !archivedOnly);
                    } else {
                      onChannelChange(isActive ? null : ch.key, false);
                    }
                  }}
                  aria-pressed={isActive}
                >
                  {ch.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== RIGHT: patient list (exact old left-section markup) ===== */}
      <section
        className={cn(
          "flex min-h-0 flex-col rounded-lg border border-border bg-card",
          "lg:h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-top,0px)_-_6rem)] lg:overflow-hidden",
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
              title="Записи: все -> с записями -> с активными -> без записей"
              state={iconFilters.appointments}
              onClick={() => onCycleRichIconFilter("appointments")}
            >
              <CalendarDays className="size-3.5" aria-hidden />
            </HeaderIconButton>
            <HeaderIconButton
              label="Фильтр переписки"
              title="Переписка: все -> с перепиской -> с непрочитанными -> без переписки"
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
              return (
                <li key={c.userId} id={`doctor-patients-item-${c.userId}`} className={doctorListItemOuterClass}>
                  <Link
                    id={`doctor-patients-card-${c.userId}`}
                    href={routePaths.doctorPatientCard(c.userId)}
                    className={`${doctorClientListRowLinkClass} items-center`}
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
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
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
  const [, setSearchQuery] = useState(initialFilters.q);
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

  const navigateWithFilters = useCallback(
    (overrides: {
      q?: string;
      segment?: string | null;
      channel?: string | null;
      archivedOnly?: boolean;
    }) => {
      const url = buildUrl({
        q: overrides.q ?? searchInput,
        segment: overrides.segment !== undefined ? overrides.segment : activeSegment,
        channel: overrides.channel !== undefined ? overrides.channel : activeChannel,
        archivedOnly: overrides.archivedOnly !== undefined ? overrides.archivedOnly : archivedOnly,
      });
      startListTransition(() => {
        // Use replaceState-equivalent: don't add to history for filter changes
        window.history.replaceState(null, "", url);
        // Trigger a server re-fetch by reloading the list promise via API
        const sp = new URLSearchParams();
        const q = overrides.q ?? searchInput;
        const seg = overrides.segment !== undefined ? overrides.segment : activeSegment;
        const ch = overrides.channel !== undefined ? overrides.channel : activeChannel;
        const arch = overrides.archivedOnly !== undefined ? overrides.archivedOnly : archivedOnly;
        if (q?.trim()) sp.set("q", q.trim());
        if (seg) sp.set("segment", seg);
        if (ch) sp.set("channel", ch);
        if (arch) sp.set("archived", "true");
        const newPromise = fetch(`/api/doctor/patients?${sp.toString()}`)
          .then((r) => {
            if (!r.ok) throw new Error(`Patients fetch failed: ${r.status}`);
            return r.json() as Promise<{ clients: ClientListItem[] }>;
          })
          .then((data) => data.clients);
        setListPromise(newPromise);
      });
    },
    [searchInput, activeSegment, activeChannel, archivedOnly],
  );

  const handleSegmentChange = useCallback(
    (value: string | null) => {
      setActiveSegment(value);
      navigateWithFilters({ segment: value });
    },
    [navigateWithFilters],
  );

  const handleChannelChange = useCallback(
    (channel: string | null, archived: boolean) => {
      setActiveChannel(channel);
      setArchivedOnly(archived);
      navigateWithFilters({ channel, archivedOnly: archived });
    },
    [navigateWithFilters],
  );

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = value.trim();
      if (trimmed.length === 0 || trimmed.length >= SEARCH_MIN_CHARS) {
        debounceRef.current = setTimeout(() => {
          setSearchQuery(trimmed);
          navigateWithFilters({ q: value });
        }, SEARCH_DEBOUNCE_MS);
      }
    },
    [navigateWithFilters],
  );

  const clearSearch = useCallback(() => {
    setSearchInput("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery("");
    navigateWithFilters({ q: "" });
  }, [navigateWithFilters]);

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
    <div className="flex flex-col gap-3">
      {/* Search — full width of the left block (placed above the 2-col grid) */}
      <form
        id="doctor-patients-search-form"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-2"
      >
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Поиск (от 3 символов)…"
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="pl-8 pr-8 text-sm"
            aria-label="Поиск пациентов"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 text-muted-foreground hover:text-foreground"
              aria-label="Сбросить поиск"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {searchInput.length > 0 && searchInput.trim().length < 3 ? (
          <p className="text-muted-foreground text-xs">
            Введите ещё {3 - searchInput.trim().length} симв.
          </p>
        ) : null}
        {/* Active filter badge row */}
        {(activeSegment || activeChannel || archivedOnly) && (
          <div className="flex flex-wrap gap-1">
            {activeSegment && (
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {SEGMENTS.find((s) => s.urlValue === activeSegment)?.title ?? activeSegment}
                <button
                  type="button"
                  onClick={() => handleSegmentChange(null)}
                  className="hover:text-primary/70"
                  aria-label="Снять фильтр сегмента"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            {activeChannel && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                {CHANNELS.find((c) => c.key === activeChannel)?.label ?? activeChannel}
                <button
                  type="button"
                  onClick={() => handleChannelChange(null, false)}
                  className="hover:text-muted-foreground"
                  aria-label="Снять фильтр канала"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            {archivedOnly && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                Архив
                <button
                  type="button"
                  onClick={() => handleChannelChange(null, false)}
                  className="hover:text-muted-foreground"
                  aria-label="Выйти из архива"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </form>

      {/* 2-column grid: filter panel (left) + patient list (right) */}
      <Suspense fallback={<PatientListSkeleton />}>
        <PatientsContent
          listPromise={listPromise}
          metricsPromise={metricsPromise}
          activeSegment={activeSegment}
          activeChannel={activeChannel}
          archivedOnly={archivedOnly}
          searchQuery={searchInput}
          iconFilters={iconFilters}
          isListPending={isListPending}
          onSegmentChange={handleSegmentChange}
          onChannelChange={handleChannelChange}
          onCycleRichIconFilter={handleCycleRichIconFilter}
          onCycleTriIconFilter={handleCycleTriIconFilter}
        />
      </Suspense>
    </div>
  );
}
